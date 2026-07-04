#!/usr/bin/env node
/**
 * ios-add-share-extension.cjs
 *
 * Injects the "TwakeDriveShareExt" Share Extension app-extension target into the
 * COMMITTED Xcode project (ios/TwakeDrive.xcodeproj/project.pbxproj) WITHOUT running
 * `expo prebuild`. Uses the `xcode` npm lib (node_modules/xcode), adapting the proven
 * logic from expo-share-intent's `withIosShareExtensionXcodeTarget.js`.
 *
 * What it does (all against project.pbxproj):
 *   - Creates a PBXGroup "TwakeDriveShareExt" (path TwakeDriveShareExt/) holding the
 *     extension's Info.plist, entitlements and ShareViewController.swift.
 *   - Creates a PBXNativeTarget "TwakeDriveShareExt" of type app_extension
 *     (productType com.apple.product-type.app-extension). The `xcode` lib's addTarget()
 *     ALSO auto-creates, on the main TwakeDrive target, a PBXCopyFilesBuildPhase
 *     (dstSubfolderSpec = 13 => PlugIns) that embeds TwakeDriveShareExt.appex, and adds
 *     a target dependency main-app -> extension.
 *   - Adds a Sources build phase (ShareViewController.swift) + empty Frameworks phase.
 *   - Sets the required build settings (bundle id, deployment target, dev team,
 *     entitlements, Info.plist, product name, swift version, device family).
 *   - Renames the auto-created "Copy Files" embed phase to "Embed Foundation Extensions"
 *     (cosmetic, matches Xcode's own naming).
 *
 * It does NOT touch the Podfile.
 *
 * Safe to re-run: it exits non-zero with a clear message if the target already exists.
 *
 * Usage:  node scripts/ios-add-share-extension.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const IOS_DIR = path.join(__dirname, '..', 'ios');
const PBX_PATH = path.join(IOS_DIR, 'TwakeDrive.xcodeproj', 'project.pbxproj');

const EXT_NAME = 'TwakeDriveShareExt'; // target name == group name == folder name
const EXT_BUNDLE_ID = 'com.linagora.twakedrive.ShareExt';
const DEVELOPMENT_TEAM = 'KUT463DS29';
const DEPLOYMENT_TARGET = '16.0';
const SWIFT_VERSION = '5.0';

const INFO_PLIST_REL = `${EXT_NAME}/Info.plist`;
const ENTITLEMENTS_REL = `${EXT_NAME}/${EXT_NAME}.entitlements`;

// Files that live in the extension group. Only the .swift is compiled; Info.plist and
// the entitlements are referenced via build settings, not via a build phase.
const sourceFiles = ['ShareViewController.swift'];
const configFiles = ['Info.plist', `${EXT_NAME}.entitlements`];
const allFiles = [...sourceFiles, ...configFiles];

function fail(msg) {
  console.error(`\n[ios-add-share-extension] ERROR: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------
if (!fs.existsSync(PBX_PATH)) {
  fail(`project.pbxproj not found at ${PBX_PATH}`);
}
for (const f of ['ShareViewController.swift', 'Info.plist', `${EXT_NAME}.entitlements`]) {
  const p = path.join(IOS_DIR, EXT_NAME, f);
  if (!fs.existsSync(p)) {
    fail(`expected extension file missing: ${p} (create ios/${EXT_NAME}/ first)`);
  }
}

// ---------------------------------------------------------------------------
// Parse project
// ---------------------------------------------------------------------------
const project = xcode.project(PBX_PATH);
project.parseSync();

// Idempotency guard: bail if the target OR group already exists.
if (project.pbxTargetByName(EXT_NAME)) {
  fail(`target "${EXT_NAME}" already exists in project.pbxproj. Nothing to do (re-run is a no-op).`);
}
const existingGroups = project.hash.project.objects.PBXGroup || {};
const groupAlreadyExists = Object.keys(existingGroups).some((key) => {
  const g = existingGroups[key];
  return g && typeof g === 'object' && g.name === EXT_NAME;
});
if (groupAlreadyExists) {
  fail(`group "${EXT_NAME}" already exists in project.pbxproj. Aborting to avoid duplicates.`);
}

// ---------------------------------------------------------------------------
// 1. PBXGroup for the extension (path == EXT_NAME, so files resolve to ios/EXT_NAME/*)
// ---------------------------------------------------------------------------
const extGroup = project.addPbxGroup(allFiles, EXT_NAME, EXT_NAME);

// Attach the new group under the project's top-level (nameless/pathless) group.
Object.keys(existingGroups).forEach((key) => {
  const g = existingGroups[key];
  if (g && typeof g === 'object' && g.name === undefined && g.path === undefined) {
    project.addToPbxGroup(extGroup.uuid, key);
  }
});

// ---------------------------------------------------------------------------
// 2. Work around the `xcode` addTarget bug: a single-target project has no
//    PBXTargetDependency / PBXContainerItemProxy sections, and addTargetDependency
//    silently no-ops if they are missing. Create them first.
// ---------------------------------------------------------------------------
const projObjects = project.hash.project.objects;
projObjects.PBXTargetDependency = projObjects.PBXTargetDependency || {};
projObjects.PBXContainerItemProxy = projObjects.PBXContainerItemProxy || {};

// ---------------------------------------------------------------------------
// 3. Create the app_extension target.
//    addTarget() also (because type === 'app_extension'):
//      - creates a PBXCopyFilesBuildPhase (dstSubfolderSpec 13 / PlugIns) on the FIRST
//        target (main app) and pushes TwakeDriveShareExt.appex into it  -> the embed
//      - adds a dependency: main app depends on the extension
// ---------------------------------------------------------------------------
const target = project.addTarget(EXT_NAME, 'app_extension', EXT_NAME);

// ---------------------------------------------------------------------------
// 4. Build phases for the extension target.
//    The source/config PBXFileReference + PBXBuildFile entries already exist (created by
//    addPbxGroup), so addBuildPhase reuses them by path.
// ---------------------------------------------------------------------------
project.addBuildPhase(sourceFiles, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

// ---------------------------------------------------------------------------
// 5. Build settings on the extension's Debug + Release configs.
//    Match by PRODUCT_NAME == "TwakeDriveShareExt" (only the ext configs carry that).
// ---------------------------------------------------------------------------
const configs = project.pbxXCBuildConfigurationSection();
let patchedConfigs = 0;
for (const key in configs) {
  const cfg = configs[key];
  if (!cfg || typeof cfg !== 'object') continue;
  const bs = cfg.buildSettings;
  if (!bs) continue;
  if (bs.PRODUCT_NAME !== `"${EXT_NAME}"`) continue;

  bs.CLANG_ENABLE_MODULES = 'YES';
  bs.INFOPLIST_FILE = `"${INFO_PLIST_REL}"`;
  bs.CODE_SIGN_ENTITLEMENTS = `"${ENTITLEMENTS_REL}"`;
  bs.CODE_SIGN_STYLE = 'Automatic';
  bs.CURRENT_PROJECT_VERSION = '"1"';
  bs.MARKETING_VERSION = '"1.0"';
  bs.GENERATE_INFOPLIST_FILE = 'NO'; // we ship a complete Info.plist
  bs.PRODUCT_BUNDLE_IDENTIFIER = `"${EXT_BUNDLE_ID}"`;
  bs.PRODUCT_NAME = `"${EXT_NAME}"`;
  bs.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
  bs.SWIFT_VERSION = SWIFT_VERSION;
  bs.SWIFT_EMIT_LOC_STRINGS = 'YES';
  bs.TARGETED_DEVICE_FAMILY = '"1,2"';
  bs.DEVELOPMENT_TEAM = DEVELOPMENT_TEAM;
  bs.SKIP_INSTALL = 'YES';
  patchedConfigs += 1;
}
if (patchedConfigs === 0) {
  fail('could not find the extension build configurations to patch (PRODUCT_NAME match failed).');
}

// ---------------------------------------------------------------------------
// 6. DevelopmentTeam target attributes (main app already has it; set it on the ext too).
// ---------------------------------------------------------------------------
project.addTargetAttribute('DevelopmentTeam', DEVELOPMENT_TEAM, project.pbxTargetByName(EXT_NAME));

// ---------------------------------------------------------------------------
// 7. Cosmetic: rename the auto-created "Copy Files" embed phase (dstSubfolderSpec 13)
//    to "Embed Foundation Extensions", matching Xcode's own label.
// ---------------------------------------------------------------------------
const copyPhases = projObjects.PBXCopyFilesBuildPhase || {};
let embedPhaseUuid = null;
for (const key in copyPhases) {
  if (/_comment$/.test(key)) continue;
  const ph = copyPhases[key];
  if (ph && typeof ph === 'object' && String(ph.dstSubfolderSpec) === '13') {
    embedPhaseUuid = key;
    ph.name = '"Embed Foundation Extensions"';
    copyPhases[`${key}_comment`] = 'Embed Foundation Extensions';
  }
}
if (embedPhaseUuid) {
  // Update the comment on the main target's buildPhases entry so the pbxproj reads cleanly.
  const nativeTargets = project.pbxNativeTargetSection();
  const mainTargetUuid = project.getFirstTarget().uuid;
  const mainTarget = nativeTargets[mainTargetUuid];
  (mainTarget.buildPhases || []).forEach((bp) => {
    if (bp.value === embedPhaseUuid) bp.comment = 'Embed Foundation Extensions';
  });
} else {
  console.warn('[ios-add-share-extension] WARNING: could not locate the embed (PlugIns) copy-files phase to rename.');
}

// ---------------------------------------------------------------------------
// 8. Cleanup: the `xcode` lib emits literal `undefined` tokens for optional file
//    properties it leaves unset (e.g. `fileEncoding = undefined;`). These are tolerated
//    by parsers but ugly and needlessly noisy in the committed pbxproj. Strip any
//    property whose value is JS `undefined` across every object.
// ---------------------------------------------------------------------------
Object.keys(projObjects).forEach((sectionName) => {
  const section = projObjects[sectionName];
  if (!section || typeof section !== 'object') return;
  Object.keys(section).forEach((objKey) => {
    const obj = section[objKey];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach((prop) => {
      if (obj[prop] === undefined) delete obj[prop];
    });
  });
});

// ---------------------------------------------------------------------------
// Write back
// ---------------------------------------------------------------------------
fs.writeFileSync(PBX_PATH, project.writeSync());

console.log('[ios-add-share-extension] SUCCESS');
console.log(`  - target        : ${EXT_NAME} (app_extension)`);
console.log(`  - bundle id     : ${EXT_BUNDLE_ID}`);
console.log(`  - deployment    : iOS ${DEPLOYMENT_TARGET}`);
console.log(`  - team          : ${DEVELOPMENT_TEAM}`);
console.log(`  - configs patched: ${patchedConfigs}`);
console.log(`  - embed phase   : ${embedPhaseUuid ? 'Embed Foundation Extensions (dstSubfolderSpec 13)' : 'NOT FOUND'}`);
console.log('  - project.pbxproj written.');
