#!/usr/bin/env node
/**
 * ios-add-file-provider-tests.cjs
 *
 * Injects a LOGIC-ONLY XCTest target "TwakeDriveFileProviderExtTests" (product type
 * com.apple.product-type.bundle.unit-test, NO TEST_HOST) into the committed pbxproj,
 * and keeps target membership in sync on every run:
 *   - SHARED_SOURCES   -> compiled into BOTH the extension target and the test target
 *   - TEST_ONLY_SOURCES-> compiled into the test target only
 * Idempotent: guards target creation, dedupes file refs and build files. Later tasks
 * append filenames to the two arrays below and re-run this script.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const IOS_DIR = path.join(__dirname, '..', 'ios');
const PBX_PATH = path.join(IOS_DIR, 'TwakeDrive.xcodeproj', 'project.pbxproj');

const EXT_TARGET = 'TwakeDriveFileProviderExt';
const TEST_TARGET = 'TwakeDriveFileProviderExtTests';
const EXT_GROUP = 'TwakeDriveFileProviderExt';       // folder ios/TwakeDriveFileProviderExt
const TEST_GROUP = 'TwakeDriveFileProviderExtTests';  // folder ios/TwakeDriveFileProviderExtTests

// --- membership manifests (tasks append here) ------------------------------
const SHARED_SOURCES = [
  'Session.swift',
  'KeychainSessionStore.swift',
  'HTTPClient.swift',
  'CozyFile.swift',
  'ItemMapper.swift',
  'TokenProvider.swift',
  'CozyFilesApi.swift',   // T7 (read); extended in T8 (write)
  'ConflictResolver.swift', // T9
];
const TEST_ONLY_SOURCES = [
  'SmokeTest.swift',
  'SessionTests.swift',
  'KeychainSessionStoreTests.swift',
  'MockURLProtocol.swift',
  'CozyFileTests.swift',
  'ItemMapperTests.swift',
  'TokenProviderTests.swift',
  'Fakes.swift',
  'CozyFilesApiReadTests.swift',
  'CozyFilesApiWriteTests.swift',
  'ConflictResolverTests.swift',   // T9
  // per-task: '<Name>Tests.swift'
];

const DEVELOPMENT_TEAM = 'KUT463DS29';
const DEPLOYMENT_TARGET = '16.0';
const SWIFT_VERSION = '5.0';

function fail(m) { console.error(`\n[ios-add-file-provider-tests] ERROR: ${m}\n`); process.exit(1); }
if (!fs.existsSync(PBX_PATH)) fail(`project.pbxproj not found at ${PBX_PATH}`);

const project = xcode.project(PBX_PATH);
project.parseSync();
const objects = project.hash.project.objects;

if (!project.pbxTargetByName(EXT_TARGET)) fail(`extension target ${EXT_TARGET} missing — run ios-add-file-provider.cjs first`);

// ---- helpers ---------------------------------------------------------------
function topLevelGroupKey() {
  const groups = objects.PBXGroup || {};
  return Object.keys(groups).find((k) => {
    const g = groups[k];
    return g && typeof g === 'object' && g.name === undefined && g.path === undefined;
  });
}
function groupByName(name) {
  const groups = objects.PBXGroup || {};
  const key = Object.keys(groups).find((k) => groups[k] && typeof groups[k] === 'object' && groups[k].name === name);
  return key ? { key, group: groups[key] } : null;
}
function ensureGroup(name) {
  const found = groupByName(name);
  if (found) return found;
  const g = project.addPbxGroup([], name, name);        // path == name -> ios/<name>/*
  project.addToPbxGroup(g.uuid, topLevelGroupKey());
  return { key: g.uuid, group: objects.PBXGroup[g.uuid] };
}
function ensureFileRef(basename, groupName) {
  const refs = objects.PBXFileReference || {};
  let key = Object.keys(refs).find((k) => !/_comment$/.test(k) && refs[k] && refs[k].path === basename);
  if (key) return key;
  key = project.generateUuid();
  refs[key] = {
    isa: 'PBXFileReference',
    lastKnownFileType: 'sourcecode.swift',
    path: basename,
    sourceTree: '"<group>"',
  };
  refs[`${key}_comment`] = basename;
  const { key: gkey, group } = ensureGroup(groupName);
  group.children = group.children || [];
  if (!group.children.some((c) => c.value === key)) group.children.push({ value: key, comment: basename });
  void gkey;
  return key;
}
function sourcesPhaseOf(targetName) {
  const target = project.pbxTargetByName(targetName);
  const bp = (target.buildPhases || []).find((p) => p.comment === 'Sources');
  return objects.PBXSourcesBuildPhase[bp.value];
}
function ensureMembership(fileRefKey, basename, targetName) {
  const phase = sourcesPhaseOf(targetName);
  phase.files = phase.files || [];
  const buildFiles = objects.PBXBuildFile || {};
  const already = phase.files.some((f) => {
    const bf = buildFiles[f.value];
    return bf && bf.fileRef === fileRefKey;
  });
  if (already) return;
  const bfKey = project.generateUuid();
  buildFiles[bfKey] = { isa: 'PBXBuildFile', fileRef: fileRefKey, fileRef_comment: basename };
  buildFiles[`${bfKey}_comment`] = `${basename} in Sources`;
  phase.files.push({ value: bfKey, comment: `${basename} in Sources` });
}

// ---- 1. create the test target once ---------------------------------------
if (!project.pbxTargetByName(TEST_TARGET)) {
  ensureGroup(TEST_GROUP);
  objects.PBXTargetDependency = objects.PBXTargetDependency || {};
  objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};
  const target = project.addTarget(TEST_TARGET, 'unit_test_bundle', TEST_TARGET);
  // ---- xcode-lib quirk (discovered running this script) -------------------
  // addTarget() stores the new target's name/productName as a JS string that already
  // contains literal embedded quote characters (e.g. the string `"TwakeDriveFileProviderExtTests"`,
  // quotes included), and mirrors that same quoted string verbatim into the
  // PBXNativeTarget section's `<uuid>_comment` key. Every name-based lookup
  // (pbxTargetByName -> pbxItemByComment, used by this script's own sourcesPhaseOf()
  // below, and by addTargetAttribute()'s `target || getFirstTarget()` fallback a few
  // lines down) compares against the BARE name — which is what Xcode's own file
  // convention uses (the pre-existing TwakeDriveFileProviderExt target, once parsed from
  // disk, already has a bare name/comment with no embedded quotes) and what re-parsing
  // this same file back from disk always produces. Left unfixed, the very first run
  // crashes in sourcesPhaseOf() (target not found) and — even before that — would have
  // silently mis-attributed DevelopmentTeam onto the main app target instead of this one
  // via addTargetAttribute's fallback. Normalize immediately so every lookup in this same
  // process resolves correctly; the writer only re-quotes a value if the bare text
  // actually needs it (it doesn't here), so on-disk output is unaffected (verified: comes
  // out as the plain `name = TwakeDriveFileProviderExtTests;`, same style as the
  // extension target).
  const newNativeTarget = objects.PBXNativeTarget[target.uuid];
  newNativeTarget.name = TEST_TARGET;
  newNativeTarget.productName = TEST_TARGET;
  objects.PBXNativeTarget[`${target.uuid}_comment`] = TEST_TARGET;

  // ---- xcode-lib quirk #2 (discovered running this script): wrong product extension ----
  // filetypeForProducttype('com.apple.product-type.bundle.unit-test') correctly resolves to
  // explicitFileType "wrapper.cfbundle" (that IS Xcode's own UTI for .xctest bundles — no bug
  // there). But addProductFile()'s reverse basename lookup (node_modules/xcode/lib/pbxFile.js
  // defaultExtension()) does a `for...in` scan over its FILETYPE_BY_EXTENSION table and
  // returns the FIRST key mapped to "wrapper.cfbundle" — and that table lists 'mdimporter'
  // before 'xctest' (both map to the same type), so the product got created as
  // "<name>.mdimporter" instead of "<name>.xctest". Our Step-3 scheme hardcodes
  // BuildableName="TwakeDriveFileProviderExtTests.xctest", so left unfixed the project's own
  // idea of its product desyncs from what the scheme/xcodebuild looks for. Rename the
  // product's PBXFileReference (name/path/comment), fix the Products group's display
  // comment, and delete the orphaned PBXBuildFile addProductFile() also created for it: a
  // product is only wired into a real build phase for app_extension/watch2_* target types
  // (see addTarget()'s `if (targetType === 'app_extension') {...}` branch); for
  // unit_test_bundle none is created, so that PBXBuildFile is dead weight with a misleading
  // "in Copy Files" comment, not a member of any actual PBXCopyFilesBuildPhase (verified: this
  // project's only two CopyFiles phases list only the ShareExt/FileProviderExt .appex files).
  const correctProductName = `${TEST_TARGET}.xctest`;
  const productRefKey = newNativeTarget.productReference;
  const productRef = objects.PBXFileReference[productRefKey];
  if (!productRef) fail(`product file reference ${productRefKey} not found for ${TEST_TARGET}`);
  productRef.name = correctProductName;
  productRef.path = correctProductName;
  objects.PBXFileReference[`${productRefKey}_comment`] = correctProductName;
  const productsGroupKey = Object.keys(objects.PBXGroup)
    .find((k) => !/_comment$/.test(k) && objects.PBXGroup[k] && objects.PBXGroup[k].name === 'Products');
  if (productsGroupKey) {
    const child = (objects.PBXGroup[productsGroupKey].children || []).find((c) => c.value === productRefKey);
    if (child) child.comment = correctProductName;
  }
  const buildFiles = objects.PBXBuildFile;
  const deadBuildFileKey = Object.keys(buildFiles)
    .find((k) => !/_comment$/.test(k) && buildFiles[k] && buildFiles[k].fileRef === productRefKey);
  if (deadBuildFileKey) {
    delete buildFiles[deadBuildFileKey];
    delete buildFiles[`${deadBuildFileKey}_comment`];
  }
  // Cosmetic: addTargetDependency() (called internally by addTarget()) stamped the
  // container-item-proxy / target-dependency pair it created for this target with the same
  // quoted-name quirk fixed above, for consistency with every pre-existing target's bare-name
  // convention (e.g. remoteInfo = TwakeDriveFileProviderExt; with no quotes).
  const cip = objects.PBXContainerItemProxy || {};
  Object.keys(cip).forEach((k) => {
    if (/_comment$/.test(k)) return;
    const o = cip[k];
    if (o && o.remoteGlobalIDString === target.uuid) o.remoteInfo = TEST_TARGET;
  });
  const tds = objects.PBXTargetDependency || {};
  Object.keys(tds).forEach((k) => {
    if (/_comment$/.test(k)) return;
    const o = tds[k];
    if (o && o.target === target.uuid) o.target_comment = TEST_TARGET;
  });
  // Same quoted-name quirk, third spot: addToPbxProjectSection() (also called inside
  // addTarget()) appends this target to the PBXProject's own `targets` list with the same
  // still-quoted comment.
  const projTargets = project.getFirstProject().firstProject.targets || [];
  const projTargetEntry = projTargets.find((t) => t.value === target.uuid);
  if (projTargetEntry) projTargetEntry.comment = TEST_TARGET;

  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
  const configs = project.pbxXCBuildConfigurationSection();
  for (const k in configs) {
    const cfg = configs[k];
    if (!cfg || typeof cfg !== 'object' || !cfg.buildSettings) continue;
    if (cfg.buildSettings.PRODUCT_NAME !== `"${TEST_TARGET}"`) continue;
    const bs = cfg.buildSettings;
    bs.PRODUCT_BUNDLE_IDENTIFIER = '"com.linagora.twakedrive.FileProviderTests"';
    bs.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
    bs.SWIFT_VERSION = SWIFT_VERSION;
    bs.DEVELOPMENT_TEAM = DEVELOPMENT_TEAM;
    bs.TARGETED_DEVICE_FAMILY = '"1,2"';
    bs.GENERATE_INFOPLIST_FILE = 'YES';       // logic bundle: no hand-written Info.plist needed
                                               // (addTarget('unit_test_bundle') defaults INFOPLIST_FILE to a
                                               // file that doesn't exist on disk; block 1b below deletes it
                                               // unconditionally, so doing it here too would be redundant)
    bs.CODE_SIGNING_ALLOWED = 'NO';           // pure logic bundle runs unsigned on the Simulator
    bs.SWIFT_EMIT_LOC_STRINGS = 'NO';
    delete bs.TEST_HOST;                       // NO host app
    delete bs.BUNDLE_LOADER;
  }
  // NOTE: intentionally `target` (the {uuid, pbxNativeTarget} wrapper addTarget() already
  // returned above), NOT project.pbxTargetByName(TEST_TARGET) as the brief drafted it.
  // addTargetAttribute() does `attributes['TargetAttributes'][target.uuid][prop] = value`,
  // but pbxTargetByName() returns the bare PBXNativeTarget dict, which has no `.uuid` field
  // (only getFirstTarget()/addTarget() return the uuid-bearing wrapper) — so that call would
  // silently key the attribute under the literal string "undefined" instead of this target's
  // real uuid, leaving stray cruft in the pbxproj and never actually tagging this target.
  project.addTargetAttribute('DevelopmentTeam', DEVELOPMENT_TEAM, target);
}

// ---- 1b. heal already-materialized projects (always runs, unlike block 1 above) ----
// Block 1 only fires once (guarded by "target doesn't exist yet"), so a project.pbxproj
// that was already committed with the dangling INFOPLIST_FILE (from a run predating the
// `delete bs.INFOPLIST_FILE` fix above) would never get patched just by re-running this
// script — the guard would skip right over it. Do the deletion unconditionally too, on
// every run, so this script can self-heal a project committed with the defect.
// NOTE: walk buildConfigurationList off the target object (uuid-keyed), not a PRODUCT_NAME
// string match like block 1 uses — PRODUCT_NAME only carries the embedded-quote form
// `"TwakeDriveFileProviderExtTests"` in the same process that just called addTarget();
// once written to disk and re-parsed (i.e. every run against an already-materialized
// project, this one included), it comes back bare (no embedded quotes), so a
// quoted-string match here would silently match nothing.
{
  const testTarget = project.pbxTargetByName(TEST_TARGET);
  const configList = objects.XCConfigurationList[testTarget.buildConfigurationList];
  for (const entry of (configList.buildConfigurations || [])) {
    const cfg = objects.XCBuildConfiguration[entry.value];
    if (cfg && cfg.buildSettings) delete cfg.buildSettings.INFOPLIST_FILE;
  }
}

// ---- 1c. heal: the app must not depend on the test bundle ------------------
// xcode-lib quirk #3: addTarget() (block 1 above) internally calls addTargetDependency(),
// which unconditionally wires the *new* target as a build dependency of getFirstTarget()
// — whichever target is listed first in the project's own `targets` array. That's the
// shipping app target (TwakeDrive, product-type.application), not
// TwakeDriveFileProviderExt (the extension this test target actually exercises). A
// logic-only XCTest bundle is never embedded in the app, so TwakeDrive depending on it is
// wrong: it couples the signed archive / fastlane-match pipeline (built from the
// TwakeDrive scheme) to a CODE_SIGNING_ALLOWED=NO target for no reason. Block 1 only fires
// once (guarded by "target doesn't exist yet"), so a project.pbxproj already committed
// with this bad edge (from a run predating this fix) would never get cleaned up just by
// re-running the script — same rationale as block 1b above. Do the removal
// unconditionally, every run: a no-op once the edge is gone (idempotent).
{
  const nativeTargets = objects.PBXNativeTarget || {};
  const testTargetObj = project.pbxTargetByName(TEST_TARGET);
  const testTargetKey = Object.keys(nativeTargets)
    .find((k) => !/_comment$/.test(k) && nativeTargets[k] === testTargetObj);
  const appTargetKey = Object.keys(nativeTargets).find((k) => {
    if (/_comment$/.test(k)) return false;
    const t = nativeTargets[k];
    return t && typeof t.productType === 'string'
      && t.productType.includes('com.apple.product-type.application');
  });
  if (!testTargetKey) fail(`could not resolve uuid of test target ${TEST_TARGET}`);
  if (!appTargetKey) fail('could not find the main app target (product-type.application)');
  const appTarget = nativeTargets[appTargetKey];
  const tds = objects.PBXTargetDependency || {};
  const cips = objects.PBXContainerItemProxy || {};
  if (Array.isArray(appTarget.dependencies)) {
    appTarget.dependencies = appTarget.dependencies.filter((dep) => {
      const td = dep && tds[dep.value];
      if (!td || td.target !== testTargetKey) return true; // unrelated dependency: keep
      const proxyKey = td.targetProxy;
      delete tds[dep.value];
      delete tds[`${dep.value}_comment`];
      if (proxyKey) {
        delete cips[proxyKey];
        delete cips[`${proxyKey}_comment`];
      }
      return false; // drop the spurious app -> test-bundle edge
    });
  }
}

// ---- 2. sync membership ----------------------------------------------------
for (const f of SHARED_SOURCES) {
  const ref = ensureFileRef(f, EXT_GROUP);
  ensureMembership(ref, f, EXT_TARGET);
  ensureMembership(ref, f, TEST_TARGET);
}
for (const f of TEST_ONLY_SOURCES) {
  const ref = ensureFileRef(f, TEST_GROUP);
  ensureMembership(ref, f, TEST_TARGET);
}

// ---- 3. strip literal `undefined` tokens (same cleanup as the Lot A script) -
Object.keys(objects).forEach((sec) => {
  const s = objects[sec];
  if (!s || typeof s !== 'object') return;
  Object.keys(s).forEach((ok) => {
    const o = s[ok];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    Object.keys(o).forEach((p) => { if (o[p] === undefined) delete o[p]; });
  });
});

fs.writeFileSync(PBX_PATH, project.writeSync());
console.log('[ios-add-file-provider-tests] OK');
console.log(`  shared sources : ${SHARED_SOURCES.length}`);
console.log(`  test-only      : ${TEST_ONLY_SOURCES.length}`);
