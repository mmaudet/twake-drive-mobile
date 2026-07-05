# iOS File Provider (Lot C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native iOS **File Provider** extension (`NSFileProviderReplicatedExtension`, iOS 16+) that exposes the user's Twake Drive as a browsable, read-write location in the Files app, at full parity with the Android `TwakeDocumentsProvider`.

**Architecture:** A committed-pbxproj app-extension target reads the cozy session from the shared iOS Keychain (Lot A) and talks to cozy-stack's `io.cozy.files` API over `URLSession`. All branching logic (session decode, keychain, token refresh, HTTP client, item mapping, conflict resolution) lives in **pure** Swift files unit-tested by an injected logic-only XCTest target; the thin `NSFileProvider` glue is device-validated. Reuses Lot A/B verbatim: shared Keychain access group, App Group, `xcode`-lib target injection (no prebuild), per-target `match` signing.

**Tech Stack:** Swift 5.0, `NSFileProviderReplicatedExtension` (iOS 16), `URLSession` async/await, `XCTest`; the `xcode` npm lib for pbxproj injection; fastlane `match` for signing. Port source: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/`.

## Global Constraints

- **Never `expo prebuild`.** `ios/` is hand-maintained. The extension target **and** the XCTest target are injected into the committed `ios/TwakeDrive.xcodeproj/project.pbxproj` by Node scripts (clone of `scripts/ios-add-share-extension.cjs`).
- **iOS 16.0** deployment floor (`NSFileProviderReplicatedExtension` requires 16+).
- Bundle id **`com.linagora.twakedrive.FileProvider`** (App ID already reserved: `docs/ci-cd-signed-release.md:30`).
- App Group **`group.com.linagora.twakedrive`**; shared Keychain access group **`com.linagora.twakedrive.shared`**.
- Session item: Keychain `kSecClassGenericPassword`, `kSecAttrService="app"`, `kSecAttrAccount = kSecAttrGeneric = Data("twake-drive-session".utf8)` (raw UTF-8, **not** hashed — the expo-secure-store contract), access group `<TeamPrefix>.com.linagora.twakedrive.shared`, `kSecAttrAccessible = AfterFirstUnlock`. Value = the nested `Session` JSON.
- Auth: `Authorization: Bearer {accessToken}` on every call; reads also send `Accept: application/vnd.api+json`.
- Apple team **`KUT463DS29`**; signing via `match` (repo `twake-certs`), **per-target manual**.
- Push to `fork`; commit trailer + PR footer as usual. Code/commits in English. Work on branch `feat/ios-file-provider`.

> **Keychain service caveat (reconciled in Task 4):** the constraint above states `kSecAttrService="app"` (the *base* service). The installed `expo-secure-store@15.0.8` appends a `:no-auth` / `:auth` suffix because `requireAuthentication` defaults to `false` and is always passed to its `query()` builder — so the item is persisted at effective service **`app:no-auth`**, and its own `get()` reads with a 3-alias fallback (`app:no-auth` → `app:auth` → legacy `app`). Task 4's Swift reader mirrors that exact fallback. Verified in `node_modules/expo-secure-store/ios/SecureStoreModule.swift` (`query()` line ~172, `get()` line ~69). The Android/ShareExt paths never actually *read* the keychain in Swift, so Lot C is the first reader — getting this right is what makes the domain's root appear on device.

---

## Prerequisites (USER — before *signed* device validation; not needed for the Simulator compile or the unit tests)

- **Portal (team `KUT463DS29`):** on App ID `com.linagora.twakedrive.FileProvider`, enable **App Groups** (Edit → assign "Twake Drive" → Continue → **Save**; confirm it persists on a fresh reload) **and** **Keychain Sharing**, both joined to `group.com.linagora.twakedrive` / `com.linagora.twakedrive.shared`.
- **match:** `cd ios && fastlane match appstore --git_url git@github.com:mmaudet/twake-certs.git --app_identifier com.linagora.twakedrive.FileProvider --force` (reuses the team's single Apple Distribution cert; only the new profile is added).
- **Verify the profile actually carries the App Group** (dotted-key `plutil -extract` silently returns empty — never use it):
  ```bash
  security cms -D -i ~/Library/MobileDevice/Provisioning\ Profiles/<uuid>.mobileprovision \
    | plutil -extract Entitlements xml1 -o - - | grep group.com.linagora.twakedrive
  ```
  Expected: one line printing `group.com.linagora.twakedrive`.

## Source file → target membership map

The logic-only test bundle has **no `TEST_HOST`**; the pure files are shared by **target membership** (compiled into both the extension and the test target). Task 2's `scripts/ios-add-file-provider-tests.cjs` owns this membership via two arrays it syncs idempotently on every run.

| File (`ios/…`) | Ext target | Test target | Introduced |
|---|:--:|:--:|---|
| `TwakeDriveFileProviderExt/FileProviderExtension.swift` | ✅ | — | T1 (skeleton), T10/T11 (fill) |
| `TwakeDriveFileProviderExt/FileProviderEnumerator.swift` | ✅ | — | T10 |
| `TwakeDriveFileProviderExt/Session.swift` | ✅ | ✅ | T3 |
| `TwakeDriveFileProviderExt/KeychainSessionStore.swift` | ✅ | ✅ | T4 |
| `TwakeDriveFileProviderExt/HTTPClient.swift` | ✅ | ✅ | T5 |
| `TwakeDriveFileProviderExt/CozyFile.swift` | ✅ | ✅ | T5 |
| `TwakeDriveFileProviderExt/ItemMapper.swift` | ✅ | ✅ | T5 |
| `TwakeDriveFileProviderExt/TokenProvider.swift` | ✅ | ✅ | T6 |
| `TwakeDriveFileProviderExt/CozyFilesApi.swift` | ✅ | ✅ | T7 (read), T8 (write) |
| `TwakeDriveFileProviderExt/ConflictResolver.swift` | ✅ | ✅ | T9 |
| `TwakeDriveFileProviderExtTests/*Tests.swift`, `Fakes.swift`, `MockURLProtocol.swift`, `SmokeTest.swift` | — | ✅ | T2–T9 |

**`git commit` trailer — append to every commit in this plan:**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG
```

---

### Task 1: Inject the File Provider extension target

**Files:**
- Create: `scripts/ios-add-file-provider.cjs`
- Create: `ios/TwakeDriveFileProviderExt/Info.plist`
- Create: `ios/TwakeDriveFileProviderExt/TwakeDriveFileProviderExt.entitlements`
- Create: `ios/TwakeDriveFileProviderExt/FileProviderExtension.swift`
- Modify: `ios/TwakeDrive.xcodeproj/project.pbxproj` (written by the script)

**Interfaces:**
- Produces: an `app_extension` target `TwakeDriveFileProviderExt` (bundle `com.linagora.twakedrive.FileProvider`, iOS 16, team `KUT463DS29`), embedded in the app via "Embed Foundation Extensions", with a compiling `FileProviderExtension: NSFileProviderReplicatedExtension`. Consumed by every later task (adds files to this target) and Task 13 (signing).

- [ ] **Step 1: Create the extension folder files first (the script asserts they exist)**

`ios/TwakeDriveFileProviderExt/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	<key>CFBundleDisplayName</key>
	<string>Twake Drive</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.fileprovider-nonui</string>
		<key>NSExtensionFileProviderDocumentGroup</key>
		<string>group.com.linagora.twakedrive</string>
		<key>NSExtensionFileProviderSupportsEnumeration</key>
		<true/>
		<key>NSExtensionPrincipalClass</key>
		<string>$(PRODUCT_MODULE_NAME).FileProviderExtension</string>
	</dict>
</dict>
</plist>
```

`ios/TwakeDriveFileProviderExt/TwakeDriveFileProviderExt.entitlements` (identical shape to the ShareExt — App Group + shared keychain group; both are required for the extension to read the shared session item):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>group.com.linagora.twakedrive</string>
	</array>
	<key>keychain-access-groups</key>
	<array>
		<string>$(AppIdentifierPrefix)com.linagora.twakedrive.shared</string>
	</array>
</dict>
</plist>
```

`ios/TwakeDriveFileProviderExt/FileProviderExtension.swift` (minimal skeleton — every required member compiles; filled in T10/T11):
```swift
import FileProvider
import UniformTypeIdentifiers

// NSExtensionPrincipalClass in Info.plist resolves "$(PRODUCT_MODULE_NAME).FileProviderExtension".
final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
  required init(domain: NSFileProviderDomain) {
    super.init()
  }

  func invalidate() {}

  func item(for identifier: NSFileProviderItemIdentifier,
            request: NSFileProviderRequest,
            completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void) -> Progress {
    completionHandler(nil, NSError(domain: NSFileProviderErrorDomain,
                                   code: NSFileProviderError.noSuchItem.rawValue))
    return Progress()
  }

  func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier,
                     version requestedVersion: NSFileProviderItemVersion?,
                     request: NSFileProviderRequest,
                     completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) -> Progress {
    completionHandler(nil, nil, NSError(domain: NSFileProviderErrorDomain,
                                        code: NSFileProviderError.noSuchItem.rawValue))
    return Progress()
  }

  func createItem(basedOn itemTemplate: NSFileProviderItem,
                  fields: NSFileProviderItemFields,
                  contents url: URL?,
                  options: NSFileProviderCreateItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    completionHandler(nil, [], false, NSError(domain: NSFileProviderErrorDomain,
                                              code: NSFileProviderError.serverUnreachable.rawValue))
    return Progress()
  }

  func modifyItem(_ item: NSFileProviderItem,
                  baseVersion version: NSFileProviderItemVersion,
                  changedFields: NSFileProviderItemFields,
                  contents newContents: URL?,
                  options: NSFileProviderModifyItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    completionHandler(nil, [], false, NSError(domain: NSFileProviderErrorDomain,
                                              code: NSFileProviderError.serverUnreachable.rawValue))
    return Progress()
  }

  func deleteItem(identifier: NSFileProviderItemIdentifier,
                  baseVersion version: NSFileProviderItemVersion,
                  options: NSFileProviderDeleteItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (Error?) -> Void) -> Progress {
    completionHandler(NSError(domain: NSFileProviderErrorDomain,
                             code: NSFileProviderError.noSuchItem.rawValue))
    return Progress()
  }

  func enumerator(for containerItemIdentifier: NSFileProviderItemIdentifier,
                  request: NSFileProviderRequest) throws -> NSFileProviderEnumerator {
    throw NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.noSuchItem.rawValue)
  }
}
```

- [ ] **Step 2: Clone the Lot A injector with the File-Provider deltas**

Copy `scripts/ios-add-share-extension.cjs` → `scripts/ios-add-file-provider.cjs` verbatim, then change **only** these constants/lists (everything else — the group/target/embed-phase/undefined-cleanup logic — is reused unchanged because it is already proven):
```js
const EXT_NAME = 'TwakeDriveFileProviderExt';                          // was TwakeDriveShareExt
const EXT_BUNDLE_ID = 'com.linagora.twakedrive.FileProvider';         // was .ShareExt
const DEVELOPMENT_TEAM = 'KUT463DS29';
const DEPLOYMENT_TARGET = '16.0';
const SWIFT_VERSION = '5.0';
// The only compiled source in this target for now (later tasks append more):
const sourceFiles = ['FileProviderExtension.swift'];                   // was ShareViewController.swift
const configFiles = ['Info.plist', `${EXT_NAME}.entitlements`];
const allFiles = [...sourceFiles, ...configFiles];
```
Also update the sanity-check loop's filename list from `'ShareViewController.swift'` to `'FileProviderExtension.swift'`, and the two log/prefix strings from `ios-add-share-extension` to `ios-add-file-provider`. The `addTarget(EXT_NAME, 'app_extension', EXT_NAME)` call and the `dstSubfolderSpec === '13'` embed-phase rename stay exactly as-is (a File Provider is an app extension, embedded in PlugIns identically).

- [ ] **Step 3: Run the injector**

Run: `node scripts/ios-add-file-provider.cjs`
Expected: `[ios-add-file-provider] SUCCESS`, `configs patched: 2`, `embed phase : Embed Foundation Extensions (dstSubfolderSpec 13)`.

- [ ] **Step 4: Validate plists + compile the new target on the Simulator**

Run:
```bash
plutil -lint ios/TwakeDriveFileProviderExt/Info.plist ios/TwakeDriveFileProviderExt/TwakeDriveFileProviderExt.entitlements
cd ios && pod install && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
```
Expected: both plists `OK`; `** BUILD SUCCEEDED **`; and `TwakeDriveFileProviderExt.appex` present under `build/Build/Products/Release-iphonesimulator/TwakeDrive.app/PlugIns/`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ios-add-file-provider.cjs ios/TwakeDriveFileProviderExt ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): inject the TwakeDriveFileProviderExt app-extension target (no prebuild)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 2: Inject the logic-only XCTest target + shared scheme

**Files:**
- Create: `scripts/ios-add-file-provider-tests.cjs`
- Create: `ios/TwakeDriveFileProviderExtTests/SmokeTest.swift`
- Create: `ios/TwakeDrive.xcodeproj/xcshareddata/xcschemes/TwakeDriveFileProviderExtTests.xcscheme`
- Modify: `ios/TwakeDrive.xcodeproj/project.pbxproj` (written by the script)

**Interfaces:**
- Produces: a `unit_test_bundle` target `TwakeDriveFileProviderExtTests` (`com.apple.product-type.bundle.unit-test`, **no `TEST_HOST`**) and a shared scheme that runs it. The script exposes two membership arrays — `SHARED_SOURCES` (compiled into **both** `TwakeDriveFileProviderExt` and the test target) and `TEST_ONLY_SOURCES` (test target only) — which it syncs idempotently. Consumed by Tasks 3–9: each appends its `.swift` file(s) to the right array and re-runs this script.

- [ ] **Step 1: Create the smoke test**

`ios/TwakeDriveFileProviderExtTests/SmokeTest.swift`:
```swift
import XCTest

final class SmokeTest: XCTestCase {
  func testHarnessRuns() {
    XCTAssertEqual(2 + 2, 4)
  }
}
```

- [ ] **Step 2: Write the injector script (complete, idempotent, membership-driven)**

`scripts/ios-add-file-provider-tests.cjs`:
```js
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
  // T3: 'Session.swift',
  // T4: 'KeychainSessionStore.swift',
  // T5: 'HTTPClient.swift', 'CozyFile.swift', 'ItemMapper.swift',
  // T6: 'TokenProvider.swift',
  // T7/T8: 'CozyFilesApi.swift',
  // T9: 'ConflictResolver.swift',
];
const TEST_ONLY_SOURCES = [
  'SmokeTest.swift',
  // T5: 'MockURLProtocol.swift', 'Fakes.swift',
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
    bs.CODE_SIGNING_ALLOWED = 'NO';           // pure logic bundle runs unsigned on the Simulator
    bs.SWIFT_EMIT_LOC_STRINGS = 'NO';
    delete bs.TEST_HOST;                       // NO host app
    delete bs.BUNDLE_LOADER;
  }
  project.addTargetAttribute('DevelopmentTeam', DEVELOPMENT_TEAM, project.pbxTargetByName(TEST_TARGET));
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
```

- [ ] **Step 3: Create the shared scheme so `xcodebuild -scheme` can find it**

`ios/TwakeDrive.xcodeproj/xcshareddata/xcschemes/TwakeDriveFileProviderExtTests.xcscheme` — set `BlueprintIdentifier` to the test target's UUID **after** running the script (read it back with the command in Step 4):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1130" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">
        <BuildableReference
          BuildableIdentifier="primary"
          BlueprintIdentifier="__TEST_TARGET_UUID__"
          BuildableName="TwakeDriveFileProviderExtTests.xctest"
          BlueprintName="TwakeDriveFileProviderExtTests"
          ReferencedContainer="container:TwakeDrive.xcodeproj">
        </BuildableReference>
      </BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <TestAction buildConfiguration="Debug"
    selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB"
    selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB"
    shouldUseLaunchSchemeArgsEnv="YES">
    <Testables>
      <TestableReference skipped="NO">
        <BuildableReference
          BuildableIdentifier="primary"
          BlueprintIdentifier="__TEST_TARGET_UUID__"
          BuildableName="TwakeDriveFileProviderExtTests.xctest"
          BlueprintName="TwakeDriveFileProviderExtTests"
          ReferencedContainer="container:TwakeDrive.xcodeproj">
        </BuildableReference>
      </TestableReference>
    </Testables>
  </TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB"
    selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0"
    useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES"
    debugServiceExtension="internal" allowLocationSimulation="YES">
  </LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier=""
    useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"></AnalyzeAction>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"></ArchiveAction>
</Scheme>
```

- [ ] **Step 4: Run the script, patch the scheme UUID, run the smoke test**

```bash
node scripts/ios-add-file-provider-tests.cjs
# Find the test target's UUID and substitute it into the scheme:
TUUID=$(node -e "const x=require('xcode').project('ios/TwakeDrive.xcodeproj/project.pbxproj');x.parseSync();process.stdout.write(x.pbxTargetByName('TwakeDriveFileProviderExtTests').uuid)")
sed -i '' "s/__TEST_TARGET_UUID__/$TUUID/g" ios/TwakeDrive.xcodeproj/xcshareddata/xcschemes/TwakeDriveFileProviderExtTests.xcscheme
cd ios && xcodebuild test -project TwakeDrive.xcodeproj \
  -scheme TwakeDriveFileProviderExtTests \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```
Expected: `TEST SUCCEEDED` with `SmokeTest.testHarnessRuns` passing. (If the runner lacks an "iPhone 15" simulator, substitute an available name from `xcrun simctl list devices available`.)

- [ ] **Step 5: Commit**

```bash
git add scripts/ios-add-file-provider-tests.cjs ios/TwakeDriveFileProviderExtTests \
  ios/TwakeDrive.xcodeproj/xcshareddata/xcschemes/TwakeDriveFileProviderExtTests.xcscheme \
  ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "test(ios): inject logic-only XCTest target + shared scheme for the File Provider" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 3: `Session.swift` — Codable session decode (TDD)

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/Session.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/SessionTests.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs` (append to arrays)

**Interfaces:**
- Produces:
  ```swift
  struct Session: Codable, Equatable { let uri: String; let oauthOptions: OAuthOptions; var token: OAuthToken; var baseURL: String { get } }
  struct OAuthOptions: Codable, Equatable { let clientID, clientSecret, clientName, softwareID, redirectURI, clientKind, clientURI: String; let scopes: [String]; let registrationAccessToken: String? }
  struct OAuthToken: Codable, Equatable { var accessToken, refreshToken: String; let tokenType, scope: String }
  ```
  Keys are the exact camelCase written by `src/auth/types.ts` (`oauthOptions`, `clientID`, `accessToken`, …) so default `JSONDecoder` round-trips the JS value. `token`/`accessToken`/`refreshToken` are `var` for write-back (Task 6). `baseURL` = `uri` with any trailing `/` stripped. Consumed by Tasks 4, 6, 7, 8.

- [ ] **Step 1: Write the failing test**

`ios/TwakeDriveFileProviderExtTests/SessionTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

final class SessionTests: XCTestCase {
  // A fixture captured from a real logged-in session (nested shape written by src/auth/tokenStorage.ts).
  private let fixture = """
  {
    "uri": "https://alice.twake.app/",
    "oauthOptions": {
      "clientID": "cid-123",
      "clientSecret": "secret-xyz",
      "clientName": "Twake Drive",
      "softwareID": "io.twake.drive",
      "redirectURI": "twakedrive://oauth",
      "clientKind": "mobile",
      "clientURI": "https://twake.app",
      "scopes": ["io.cozy.files", "*"],
      "registrationAccessToken": "rat-1"
    },
    "token": { "accessToken": "at-1", "refreshToken": "rt-1", "tokenType": "bearer", "scope": "*" }
  }
  """

  func testDecodesNestedSession() throws {
    let s = try JSONDecoder().decode(Session.self, from: Data(fixture.utf8))
    XCTAssertEqual(s.uri, "https://alice.twake.app/")
    XCTAssertEqual(s.baseURL, "https://alice.twake.app")           // trailing slash stripped
    XCTAssertEqual(s.oauthOptions.clientID, "cid-123")
    XCTAssertEqual(s.oauthOptions.clientSecret, "secret-xyz")
    XCTAssertEqual(s.oauthOptions.scopes, ["io.cozy.files", "*"])
    XCTAssertEqual(s.token.accessToken, "at-1")
    XCTAssertEqual(s.token.refreshToken, "rt-1")
  }

  func testRoundTripsThroughEncoder() throws {
    let s = try JSONDecoder().decode(Session.self, from: Data(fixture.utf8))
    let reencoded = try JSONEncoder().encode(s)
    let s2 = try JSONDecoder().decode(Session.self, from: reencoded)
    XCTAssertEqual(s, s2)
  }

  func testOptionalRegistrationTokenMayBeAbsent() throws {
    let minimal = fixture.replacingOccurrences(of: "\"registrationAccessToken\": \"rat-1\"", with: "\"registrationAccessToken\": null")
    let s = try JSONDecoder().decode(Session.self, from: Data(minimal.utf8))
    XCTAssertNil(s.oauthOptions.registrationAccessToken)
  }
}
```

- [ ] **Step 2: Register the sources, run, expect fail**

Append `'Session.swift'` to `SHARED_SOURCES` and `'SessionTests.swift'` to `TEST_ONLY_SOURCES` in `scripts/ios-add-file-provider-tests.cjs`, then:
```bash
node scripts/ios-add-file-provider-tests.cjs
cd ios && xcodebuild test -project TwakeDrive.xcodeproj \
  -scheme TwakeDriveFileProviderExtTests \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```
Expected: FAIL — `Session` is undefined (compile error / no such type).

- [ ] **Step 3: Minimal implementation**

`ios/TwakeDriveFileProviderExt/Session.swift`:
```swift
import Foundation

struct OAuthOptions: Codable, Equatable {
  let clientID: String
  let clientSecret: String
  let clientName: String
  let softwareID: String
  let redirectURI: String
  let clientKind: String
  let clientURI: String
  let scopes: [String]
  let registrationAccessToken: String?
}

struct OAuthToken: Codable, Equatable {
  var accessToken: String
  var refreshToken: String
  let tokenType: String
  let scope: String
}

struct Session: Codable, Equatable {
  let uri: String
  let oauthOptions: OAuthOptions
  var token: OAuthToken

  /// cozy-stack base URL: `uri` without a trailing slash (mirrors SessionStore.baseUri()).
  var baseURL: String {
    uri.hasSuffix("/") ? String(uri.dropLast()) : uri
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run the Step 2 `xcodebuild test` command again. Expected: `TEST SUCCEEDED`, `SessionTests` green.

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/Session.swift ios/TwakeDriveFileProviderExtTests/SessionTests.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): decode the shared-keychain cozy Session in the File Provider" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 4: `KeychainSessionStore.swift` — shared-keychain read + write-back (TDD)

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/KeychainSessionStore.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/KeychainSessionStoreTests.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs`

**Interfaces:**
- Produces:
  ```swift
  protocol KeychainAccess {
    func read(service: String, account: Data, accessGroup: String) -> Data?
    func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool
  }
  protocol SessionStoring { func load() throws -> Session?; func save(_ session: Session) throws }
  struct KeychainSessionStore: SessionStoring {
    init(access: KeychainAccess, accessGroup: String = "com.linagora.twakedrive.shared")
  }
  struct RealKeychainAccess: KeychainAccess { init() }
  ```
  Reads the item at `kSecAttrAccount = kSecAttrGeneric = Data("twake-drive-session".utf8)`, trying services `app:no-auth` → `app:auth` → `app` (mirrors expo-secure-store's `get()` fallback — see the Global-Constraints caveat). `save()` writes JSON back at the canonical `app:no-auth` alias with `kSecAttrAccessibleAfterFirstUnlock`. Consumed by Task 6 (`TokenProvider`) and the extension bootstrap (Tasks 10/11).

- [ ] **Step 1: Write the failing test** (in-memory fake keyed by `service` — the real keychain is device-validated in Task 10)

`ios/TwakeDriveFileProviderExtTests/KeychainSessionStoreTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

private final class FakeKeychain: KeychainAccess {
  var store: [String: Data] = [:]     // key = service
  private(set) var lastWriteService: String?
  private(set) var lastAccessGroup: String?
  private(set) var lastAccount: Data?
  func read(service: String, account: Data, accessGroup: String) -> Data? {
    lastAccessGroup = accessGroup; lastAccount = account
    return store[service]
  }
  func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool {
    lastWriteService = service; lastAccessGroup = accessGroup; lastAccount = account
    store[service] = value; return true
  }
}

private let sessionJSON = """
{"uri":"https://alice.twake.app","oauthOptions":{"clientID":"c","clientSecret":"s","clientName":"n","softwareID":"sw","redirectURI":"r","clientKind":"mobile","clientURI":"u","scopes":["*"],"registrationAccessToken":null},"token":{"accessToken":"at","refreshToken":"rt","tokenType":"bearer","scope":"*"}}
"""

final class KeychainSessionStoreTests: XCTestCase {
  func testLoadReadsCanonicalNoAuthAliasAndQueriesRawKey() throws {
    let kc = FakeKeychain()
    kc.store["app:no-auth"] = Data(sessionJSON.utf8)
    let store = KeychainSessionStore(access: kc)
    let s = try store.load()
    XCTAssertEqual(s?.token.accessToken, "at")
    XCTAssertEqual(kc.lastAccount, Data("twake-drive-session".utf8))   // raw UTF-8, not hashed
    XCTAssertEqual(kc.lastAccessGroup, "com.linagora.twakedrive.shared")
  }

  func testLoadFallsBackAcrossServiceAliases() throws {
    // Only the legacy "app" alias present -> still found via the fallback chain.
    let kc = FakeKeychain()
    kc.store["app"] = Data(sessionJSON.utf8)
    XCTAssertEqual(try KeychainSessionStore(access: kc).load()?.token.refreshToken, "rt")
  }

  func testLoadReturnsNilWhenAbsent() throws {
    XCTAssertNil(try KeychainSessionStore(access: FakeKeychain()).load())
  }

  func testSaveWritesCanonicalNoAuthAliasWithAfterFirstUnlock() throws {
    let kc = FakeKeychain()
    var s = try JSONDecoder().decode(Session.self, from: Data(sessionJSON.utf8))
    s.token.accessToken = "at-2"
    try KeychainSessionStore(access: kc).save(s)
    XCTAssertEqual(kc.lastWriteService, "app:no-auth")
    let readBack = try KeychainSessionStore(access: kc).load()
    XCTAssertEqual(readBack?.token.accessToken, "at-2")               // converges with the app
  }
}
```

- [ ] **Step 2: Register + run, expect fail**

Append `'KeychainSessionStore.swift'` to `SHARED_SOURCES` and `'KeychainSessionStoreTests.swift'` to `TEST_ONLY_SOURCES`, then `node scripts/ios-add-file-provider-tests.cjs` and run the `xcodebuild test` command from Task 3 Step 2. Expected: FAIL — `KeychainSessionStore`/`KeychainAccess` undefined.

- [ ] **Step 3: Minimal implementation**

`ios/TwakeDriveFileProviderExt/KeychainSessionStore.swift`:
```swift
import Foundation
import Security

/// Seam over the raw Security framework so the store is unit-testable with a fake.
protocol KeychainAccess {
  func read(service: String, account: Data, accessGroup: String) -> Data?
  func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool
}

protocol SessionStoring {
  func load() throws -> Session?
  func save(_ session: Session) throws
}

struct KeychainSessionStore: SessionStoring {
  // expo-secure-store key + its raw-UTF-8 account/generic encoding.
  private static let key = "twake-drive-session"
  // Read fallback mirrors expo-secure-store's get(): requireAuthentication=false first
  // ("app:no-auth"), then "app:auth", then the legacy un-suffixed "app".
  private static let readServices = ["app:no-auth", "app:auth", "app"]
  // Write to the canonical no-auth alias the JS side uses (requireAuthentication defaults false).
  private static let writeService = "app:no-auth"

  private let access: KeychainAccess
  private let accessGroup: String

  init(access: KeychainAccess, accessGroup: String = "com.linagora.twakedrive.shared") {
    self.access = access
    self.accessGroup = accessGroup
  }

  private var account: Data { Data(Self.key.utf8) }

  func load() throws -> Session? {
    for service in Self.readServices {
      guard let data = access.read(service: service, account: account, accessGroup: accessGroup) else { continue }
      return try JSONDecoder().decode(Session.self, from: data)
    }
    return nil
  }

  func save(_ session: Session) throws {
    let data = try JSONEncoder().encode(session)
    guard access.write(data, service: Self.writeService, account: account,
                       accessGroup: accessGroup, accessible: kSecAttrAccessibleAfterFirstUnlock) else {
      throw CozyError.serverUnreachable   // keychain write failed; surfaced as a transient error
    }
  }
}

/// Production keychain access. `read` = SecItemCopyMatching; `write` = add-or-update.
struct RealKeychainAccess: KeychainAccess {
  func read(service: String, account: Data, accessGroup: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: accessGroup,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: kCFBooleanTrue as Any,
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess else { return nil }
    return out as? Data
  }

  func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: accessGroup,
    ]
    let update: [String: Any] = [kSecValueData as String: value, kSecAttrAccessible as String: accessible]
    let status = SecItemUpdate(base as CFDictionary, update as CFDictionary)
    if status == errSecSuccess { return true }
    if status == errSecItemNotFound {
      var add = base
      add[kSecValueData as String] = value
      add[kSecAttrAccessible as String] = accessible
      return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }
    return false
  }
}
```

> **Note:** `CozyError` is introduced in Task 5. If Task 4 is executed before Task 5 in a strict TDD order, temporarily throw `NSError(domain: "keychain", code: -1)` in `save()`'s guard and swap it to `CozyError.serverUnreachable` in Task 5. (Tasks 4→5 are adjacent; the swap is one line.)

- [ ] **Step 4: Run, expect pass** — run the Task 3 Step 2 `xcodebuild test` command. Expected: `TEST SUCCEEDED`, `KeychainSessionStoreTests` green.

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/KeychainSessionStore.swift ios/TwakeDriveFileProviderExtTests/KeychainSessionStoreTests.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): read/write the shared-keychain session (expo-secure-store alias fallback)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 5: `HTTPClient` + `CozyError` + `URLProtocol` mock + `CozyFile` + `ItemMapper` (TDD)

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/HTTPClient.swift`
- Create: `ios/TwakeDriveFileProviderExt/CozyFile.swift`
- Create: `ios/TwakeDriveFileProviderExt/ItemMapper.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/MockURLProtocol.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/CozyFileTests.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/ItemMapperTests.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs`

**Interfaces:**
- Produces:
  ```swift
  protocol HTTPClient { func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) }
  struct URLSessionHTTPClient: HTTPClient { init(session: URLSession = .shared) }
  enum CozyError: Error, Equatable { case notAuthenticated, noSuchItem, filenameCollision, serverUnreachable, insufficientQuota, offline, server(Int) }
  struct CozyFile: Equatable { let id, name: String; let isDir: Bool; let dirId: String?; let size: Int64; let mime, klass: String?; let updatedAt: Date; let path: String?; var hasThumbnail: Bool { get }; static func fromAttributes(id: String, _ attrs: [String: Any]) -> CozyFile }
  struct FileProviderItem: NSFileProviderItem { /* itemIdentifier, parentItemIdentifier, filename, contentType, documentSize, contentModificationDate, capabilities, itemVersion, isTrashed */ }
  enum ItemMapper { static let rootDocID: String; static let hiddenIDs: Set<String>; static func isHidden(_ id: String) -> Bool; static func item(from file: CozyFile) -> FileProviderItem }
  ```
  `MockURLProtocol` is a test-only `URLProtocol` with a static request handler for Tasks 7/8. Consumed by Tasks 6, 7, 8, 10, 11.

- [ ] **Step 1: Write the failing tests**

`ios/TwakeDriveFileProviderExtTests/CozyFileTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

final class CozyFileTests: XCTestCase {
  func testParsesFileAttributes() {
    let attrs: [String: Any] = [
      "type": "file", "name": "report.pdf", "dir_id": "dir-1",
      "size": "20480", "mime": "application/pdf", "class": "pdf",
      "updated_at": "2026-07-05T09:30:00.000Z", "path": "/Docs/report.pdf",
    ]
    let f = CozyFile.fromAttributes(id: "file-1", attrs)
    XCTAssertEqual(f.id, "file-1")
    XCTAssertEqual(f.name, "report.pdf")
    XCTAssertFalse(f.isDir)
    XCTAssertEqual(f.dirId, "dir-1")
    XCTAssertEqual(f.size, 20480)
    XCTAssertEqual(f.mime, "application/pdf")
    XCTAssertFalse(f.hasThumbnail)
    XCTAssertGreaterThan(f.updatedAt.timeIntervalSince1970, 0)
  }

  func testDirectoryHasZeroSizeAndNilMime() {
    let f = CozyFile.fromAttributes(id: "d", ["type": "directory", "name": "Docs", "dir_id": "root"])
    XCTAssertTrue(f.isDir)
    XCTAssertEqual(f.size, 0)
    XCTAssertNil(f.mime)
  }

  func testImageClassIsThumbnailCapable() {
    let f = CozyFile.fromAttributes(id: "i", ["type": "file", "name": "p.jpg", "class": "image", "size": "1"])
    XCTAssertTrue(f.hasThumbnail)
  }
}
```

`ios/TwakeDriveFileProviderExtTests/ItemMapperTests.swift`:
```swift
import XCTest
import FileProvider
import UniformTypeIdentifiers
@testable import TwakeDriveFileProviderExt

final class ItemMapperTests: XCTestCase {
  func testMapsFolder() {
    let f = CozyFile.fromAttributes(id: "d", ["type": "directory", "name": "Docs", "dir_id": "io.cozy.files.root-dir"])
    let item = ItemMapper.item(from: f)
    XCTAssertEqual(item.itemIdentifier.rawValue, "d")
    XCTAssertEqual(item.parentItemIdentifier, .rootContainer)     // dir_id == ROOT_DOC_ID -> rootContainer
    XCTAssertEqual(item.filename, "Docs")
    XCTAssertEqual(item.contentType, .folder)
    XCTAssertTrue(item.capabilities.contains(.allowsAddingSubItems))
    XCTAssertFalse(item.isTrashed)
  }

  func testMapsFile() {
    let f = CozyFile.fromAttributes(id: "f", ["type": "file", "name": "a.pdf", "dir_id": "d", "mime": "application/pdf", "size": "10"])
    let item = ItemMapper.item(from: f)
    XCTAssertEqual(item.parentItemIdentifier.rawValue, "d")
    XCTAssertEqual(item.documentSize?.int64Value, 10)          // documentSize is NSNumber?
    XCTAssertTrue(item.capabilities.contains(.allowsWriting))
    XCTAssertTrue(item.contentType.conforms(to: .pdf))
  }

  func testMapsImageContentType() {
    let f = CozyFile.fromAttributes(id: "i", ["type": "file", "name": "p.jpg", "dir_id": "d", "mime": "image/jpeg", "class": "image", "size": "5"])
    XCTAssertTrue(ItemMapper.item(from: f).contentType.conforms(to: .image))
  }

  func testHiddenIdsAreFiltered() {
    XCTAssertTrue(ItemMapper.isHidden("io.cozy.files.trash-dir"))
    XCTAssertTrue(ItemMapper.isHidden("io.cozy.files.shared-drives-dir"))
    XCTAssertFalse(ItemMapper.isHidden("some-file"))
  }
}
```

- [ ] **Step 2: Register + run, expect fail**

Append `'HTTPClient.swift', 'CozyFile.swift', 'ItemMapper.swift'` to `SHARED_SOURCES` and `'MockURLProtocol.swift', 'CozyFileTests.swift', 'ItemMapperTests.swift'` to `TEST_ONLY_SOURCES`; `node scripts/ios-add-file-provider-tests.cjs`; run the `xcodebuild test` command. Expected: FAIL (types undefined).

- [ ] **Step 3: Minimal implementation**

`ios/TwakeDriveFileProviderExt/HTTPClient.swift`:
```swift
import Foundation

enum CozyError: Error, Equatable {
  case notAuthenticated
  case noSuchItem
  case filenameCollision
  case serverUnreachable
  case insufficientQuota
  case offline
  case server(Int)
}

protocol HTTPClient {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionHTTPClient: HTTPClient {
  let session: URLSession
  init(session: URLSession = .shared) { self.session = session }

  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw CozyError.serverUnreachable }
      return (data, http)
    } catch let e as URLError where [.notConnectedToInternet, .cannotFindHost, .timedOut, .networkConnectionLost].contains(e.code) {
      throw CozyError.offline
    }
  }
}
```

`ios/TwakeDriveFileProviderExt/CozyFile.swift`:
```swift
import Foundation

struct CozyFile: Equatable {
  let id: String
  let name: String
  let isDir: Bool
  let dirId: String?
  let size: Int64
  let mime: String?
  let klass: String?
  let updatedAt: Date
  let path: String?

  var hasThumbnail: Bool { klass == "image" }

  private static let iso: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return f
  }()

  private static func parseDate(_ s: String?) -> Date {
    guard let s, s.count >= 19 else { return Date(timeIntervalSince1970: 0) }
    return iso.date(from: String(s.prefix(19))) ?? Date(timeIntervalSince1970: 0)
  }

  /// Ports Models.kt CozyFile.fromAttributes.
  static func fromAttributes(id: String, _ a: [String: Any]) -> CozyFile {
    let isDir = (a["type"] as? String) == "directory"
    func str(_ k: String) -> String? {
      guard let v = a[k] as? String, !v.isEmpty else { return nil }
      return v
    }
    let size: Int64 = isDir ? 0 : Int64(str("size") ?? "0") ?? 0
    return CozyFile(
      id: id,
      name: str("name") ?? "",
      isDir: isDir,
      dirId: str("dir_id"),
      size: size,
      mime: str("mime"),
      klass: str("class"),
      updatedAt: parseDate(str("updated_at")),
      path: str("path")
    )
  }
}
```

`ios/TwakeDriveFileProviderExt/ItemMapper.swift`:
```swift
import Foundation
import FileProvider
import UniformTypeIdentifiers

/// Plain struct conforming to the NSFileProviderItem protocol (pure/testable — no live extension).
struct FileProviderItem: NSFileProviderItem {
  let itemIdentifier: NSFileProviderItemIdentifier
  let parentItemIdentifier: NSFileProviderItemIdentifier
  let filename: String
  let contentType: UTType
  let capabilities: NSFileProviderItemCapabilities
  let documentSize: NSNumber?
  let contentModificationDate: Date?
  let itemVersion: NSFileProviderItemVersion
  var isTrashed: Bool { false }
}

enum ItemMapper {
  static let rootDocID = "io.cozy.files.root-dir"                       // DocumentMapper.ROOT_DOC_ID
  static let hiddenIDs: Set<String> = ["io.cozy.files.trash-dir", "io.cozy.files.shared-drives-dir"]

  static func isHidden(_ id: String) -> Bool { hiddenIDs.contains(id) }

  static func identifier(for id: String) -> NSFileProviderItemIdentifier {
    id == rootDocID ? .rootContainer : NSFileProviderItemIdentifier(id)
  }

  static func item(from f: CozyFile) -> FileProviderItem {
    let parent: NSFileProviderItemIdentifier = f.dirId.map { identifier(for: $0) } ?? .rootContainer
    let type: UTType = f.isDir
      ? .folder
      : (f.mime.flatMap { UTType(mimeType: $0) } ?? .data)

    var caps: NSFileProviderItemCapabilities = [.allowsReading, .allowsDeleting, .allowsRenaming, .allowsReparenting]
    if f.isDir {
      caps.insert(.allowsAddingSubItems)
      caps.insert(.allowsContentEnumerating)
    } else {
      caps.insert(.allowsWriting)
    }

    // Version bumps when content (updated_at/size) or metadata (name/parent) changes,
    // so the system re-materializes after our own mutations (parity with notifyChange).
    let contentVersion = Data("\(Int64(f.updatedAt.timeIntervalSince1970))|\(f.size)".utf8)
    let metadataVersion = Data("\(f.name)|\(f.dirId ?? "")".utf8)

    return FileProviderItem(
      itemIdentifier: identifier(for: f.id),
      parentItemIdentifier: parent,
      filename: f.name,
      contentType: type,
      capabilities: caps,
      documentSize: f.isDir ? nil : NSNumber(value: f.size),
      contentModificationDate: f.updatedAt.timeIntervalSince1970 > 0 ? f.updatedAt : nil,
      itemVersion: NSFileProviderItemVersion(contentVersion: contentVersion, metadataVersion: metadataVersion)
    )
  }
}
```

`ios/TwakeDriveFileProviderExtTests/MockURLProtocol.swift` (test-only transport for Tasks 7/8):
```swift
import Foundation

/// URLProtocol that returns canned responses. Set `requestHandler` per test.
final class MockURLProtocol: URLProtocol {
  /// (status, headers, body) for a given request; also records the request for assertions.
  static var requestHandler: ((URLRequest) throws -> (Int, [String: String], Data))?
  static private(set) var recorded: [URLRequest] = []

  static func reset() { requestHandler = nil; recorded = [] }
  static func session() -> URLSession {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: cfg)
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    MockURLProtocol.recorded.append(request)
    guard let handler = MockURLProtocol.requestHandler else {
      client?.urlProtocol(self, didFailWithError: CocoaError(.featureUnsupported)); return
    }
    do {
      let (status, headers, body) = try handler(request)
      let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }
  override func stopLoading() {}
}
```

> Note: `MockURLProtocol` captures `httpBody` only for requests that carry an in-memory body. For `PUT`/upload tests that stream from a file URL, assert on the file contents you passed in rather than `request.httpBody` (which URLSession may present as an `httpBodyStream`). Task 8 upload tests use an in-memory `Data` body so `httpBody` is observable.

- [ ] **Step 4: Run, expect pass** — run the `xcodebuild test` command. Expected: `TEST SUCCEEDED`; `CozyFileTests` + `ItemMapperTests` green.

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/HTTPClient.swift ios/TwakeDriveFileProviderExt/CozyFile.swift \
  ios/TwakeDriveFileProviderExt/ItemMapper.swift ios/TwakeDriveFileProviderExtTests/MockURLProtocol.swift \
  ios/TwakeDriveFileProviderExtTests/CozyFileTests.swift ios/TwakeDriveFileProviderExtTests/ItemMapperTests.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): HTTP client seam, cozy file parsing, and NSFileProviderItem mapping" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 6: `TokenProvider.swift` — single-flight refresh + cross-process lock + write-back (TDD)

Ports `SessionStore.refreshAccessToken` (`android/…/SessionStore.kt:49-79`): the `@Synchronized` re-check becomes an actor + `NSFileCoordinator` cross-process lock; the write-back persists the rotated refresh token (approach A in the spec).

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/TokenProvider.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/TokenProviderTests.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/Fakes.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs`

**Interfaces:**
- Produces:
  ```swift
  actor TokenProvider {
    init(store: SessionStoring, client: HTTPClient, lockURL: URL?)
    func validAccessToken() async throws -> String
    func forceRefresh() async throws -> String
  }
  ```
  `validAccessToken()` returns the cached/stored token, refreshing if empty; `forceRefresh()` performs a single-flight, cross-process-locked, write-back refresh (`POST {baseURL}/auth/access_token`, `grant_type=refresh_token`). In production `lockURL` = a sentinel in the App Group container; tests pass `nil` (skip coordination — the file coordinator is device-exercised). Consumed by Tasks 7/8 (`CozyFilesApi`).
- Also produces `Fakes.swift` — `FakeSessionStore` + `FakeHTTPClient` reused by Tasks 6/7/8.

- [ ] **Step 1: Write the failing tests**

`ios/TwakeDriveFileProviderExtTests/Fakes.swift`:
```swift
import Foundation
@testable import TwakeDriveFileProviderExt

final class FakeSessionStore: SessionStoring {
  var current: Session?
  private(set) var saved: [Session] = []
  init(_ s: Session?) { current = s }
  func load() throws -> Session? { current }
  func save(_ session: Session) throws { current = session; saved.append(session) }
}

final class FakeHTTPClient: HTTPClient {
  /// Per-request canned responses; also counts calls for single-flight assertions.
  var handler: (URLRequest) async throws -> (Data, HTTPURLResponse)
  private(set) var callCount = 0
  private let lock = NSLock()
  init(_ handler: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse)) { self.handler = handler }
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    lock.lock(); callCount += 1; lock.unlock()
    return try await handler(request)
  }
}

func makeSession(access: String = "at-old", refresh: String = "rt-old") -> Session {
  Session(
    uri: "https://alice.twake.app",
    oauthOptions: OAuthOptions(clientID: "c", clientSecret: "s", clientName: "n", softwareID: "sw",
                               redirectURI: "r", clientKind: "mobile", clientURI: "u", scopes: ["*"],
                               registrationAccessToken: nil),
    token: OAuthToken(accessToken: access, refreshToken: refresh, tokenType: "bearer", scope: "*"))
}

func httpResponse(_ url: URL, _ status: Int, _ json: String) -> (Data, HTTPURLResponse) {
  (Data(json.utf8), HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!)
}
```

`ios/TwakeDriveFileProviderExtTests/TokenProviderTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

final class TokenProviderTests: XCTestCase {
  func testValidAccessTokenReturnsStoredWithoutNetwork() async throws {
    let store = FakeSessionStore(makeSession(access: "at-live"))
    let http = FakeHTTPClient { _ in XCTFail("no network expected"); return httpResponse(URL(string: "https://x")!, 200, "{}") }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    let token = try await tp.validAccessToken()
    XCTAssertEqual(token, "at-live")
    XCTAssertEqual(http.callCount, 0)
  }

  func testForceRefreshPostsAndWritesBackRotatedToken() async throws {
    let store = FakeSessionStore(makeSession(access: "at-old", refresh: "rt-old"))
    let http = FakeHTTPClient { req in
      XCTAssertEqual(req.url?.path, "/auth/access_token")
      XCTAssertEqual(req.httpMethod, "POST")
      let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
      XCTAssertTrue(body.contains("grant_type=refresh_token"))
      XCTAssertTrue(body.contains("refresh_token=rt-old"))
      return httpResponse(req.url!, 200, #"{"access_token":"at-new","refresh_token":"rt-new"}"#)
    }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    let token = try await tp.forceRefresh()
    XCTAssertEqual(token, "at-new")
    XCTAssertEqual(store.current?.token.accessToken, "at-new")     // write-back
    XCTAssertEqual(store.current?.token.refreshToken, "rt-new")    // rotated token persisted
  }

  func testForceRefreshIsSingleFlightUnderConcurrency() async throws {
    let store = FakeSessionStore(makeSession())
    let http = FakeHTTPClient { req in
      try? await Task.sleep(nanoseconds: 60_000_000)               // coalesce concurrent callers
      return httpResponse(req.url!, 200, #"{"access_token":"at-new"}"#)
    }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    let tokens = try await withThrowingTaskGroup(of: String.self) { group -> [String] in
      for _ in 0..<5 { group.addTask { try await tp.forceRefresh() } }
      var out: [String] = []
      for try await t in group { out.append(t) }
      return out
    }
    XCTAssertEqual(tokens, Array(repeating: "at-new", count: 5))
    XCTAssertEqual(http.callCount, 1)                              // one HTTP call for five callers
  }

  func testForceRefreshShortCircuitsWhenAnotherProcessAlreadyRotated() async throws {
    // Store already holds a token different from `previous` (rotated by the app) -> no network.
    let store = FakeSessionStore(makeSession(access: "at-fresh"))
    let http = FakeHTTPClient { _ in XCTFail("should not hit network"); return httpResponse(URL(string: "https://x")!, 200, "{}") }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    // seed the actor's `previous` as empty, so the re-read finds a non-empty, different token
    let token = try await tp.forceRefresh()
    XCTAssertEqual(token, "at-fresh")
    XCTAssertEqual(http.callCount, 0)
  }
}
```

- [ ] **Step 2: Register + run, expect fail**

Append `'TokenProvider.swift'` to `SHARED_SOURCES`; `'TokenProviderTests.swift', 'Fakes.swift'` to `TEST_ONLY_SOURCES`; run the script + `xcodebuild test`. Expected: FAIL (`TokenProvider` undefined).

- [ ] **Step 3: Minimal implementation**

`ios/TwakeDriveFileProviderExt/TokenProvider.swift`:
```swift
import Foundation

actor TokenProvider {
  private let store: SessionStoring
  private let client: HTTPClient
  private let lockURL: URL?
  private var cached: String?
  private var refreshTask: Task<String, Error>?

  init(store: SessionStoring, client: HTTPClient, lockURL: URL?) {
    self.store = store
    self.client = client
    self.lockURL = lockURL
  }

  func validAccessToken() async throws -> String {
    if let c = cached, !c.isEmpty { return c }
    if let s = try store.load(), !s.token.accessToken.isEmpty {
      cached = s.token.accessToken
      return s.token.accessToken
    }
    return try await forceRefresh()
  }

  func forceRefresh() async throws -> String {
    if let inflight = refreshTask { return try await inflight.value }   // single-flight (intra-process)
    let previous = cached
    let task = Task { try await self.performRefresh(previous: previous) }
    refreshTask = task
    defer { refreshTask = nil }
    let token = try await task.value
    cached = token
    return token
  }

  private func performRefresh(previous: String?) async throws -> String {
    if let lockURL {
      return try await Self.coordinated(lockURL) {
        try await Self.doRefresh(store: self.store, client: self.client, previous: previous)
      }
    }
    return try await Self.doRefresh(store: store, client: client, previous: previous)
  }

  // nonisolated so it runs off the actor executor (safe: touches only the injected store/client).
  nonisolated private static func doRefresh(store: SessionStoring, client: HTTPClient, previous: String?) async throws -> String {
    guard var session = try store.load() else { throw CozyError.notAuthenticated }
    // Another process refreshed while we waited on the lock (re-read short-circuit).
    if !session.token.accessToken.isEmpty && session.token.accessToken != previous {
      return session.token.accessToken
    }
    var req = URLRequest(url: URL(string: "\(session.baseURL)/auth/access_token")!)
    req.httpMethod = "POST"
    req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    let form = [
      "grant_type=refresh_token",
      "client_id=\(formEncode(session.oauthOptions.clientID))",
      "client_secret=\(formEncode(session.oauthOptions.clientSecret))",
      "refresh_token=\(formEncode(session.token.refreshToken))",
    ].joined(separator: "&")
    req.httpBody = Data(form.utf8)

    let (data, response) = try await client.send(req)
    guard response.statusCode == 200 else { throw CozyError.notAuthenticated }
    let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    guard let access = obj?["access_token"] as? String, !access.isEmpty else { throw CozyError.notAuthenticated }
    session.token.accessToken = access
    if let rotated = obj?["refresh_token"] as? String, !rotated.isEmpty {
      session.token.refreshToken = rotated
    }
    try store.save(session)     // converge app + extension on the shared keychain
    return access
  }

  nonisolated private static func formEncode(_ s: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
  }

  /// Cross-process serialize via an NSFileCoordinator write on a sentinel in the App Group container.
  /// Runs the async body to completion while holding the coordinated write.
  nonisolated private static func coordinated<T>(_ url: URL, _ body: @escaping () async throws -> T) async throws -> T {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<T, Error>) in
      DispatchQueue.global(qos: .userInitiated).async {
        let coordinator = NSFileCoordinator()
        var coordError: NSError?
        coordinator.coordinate(writingItemAt: url, options: [], error: &coordError) { _ in
          let sem = DispatchSemaphore(value: 0)
          var result: Result<T, Error>!
          Task.detached {
            do { result = .success(try await body()) } catch { result = .failure(error) }
            sem.signal()
          }
          sem.wait()               // hold the coordinated write until the refresh finishes
          cont.resume(with: result)
        }
        if let coordError { cont.resume(throwing: coordError) }
      }
    }
  }
}
```

- [ ] **Step 4: Run, expect pass** — run the `xcodebuild test` command. Expected: `TEST SUCCEEDED`; all four `TokenProviderTests` green (single-flight asserts exactly one HTTP call).

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/TokenProvider.swift ios/TwakeDriveFileProviderExtTests/TokenProviderTests.swift \
  ios/TwakeDriveFileProviderExtTests/Fakes.swift scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): single-flight, cross-process, write-back token refresh for the File Provider" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 7: `CozyFilesApi.swift` — read endpoints (TDD)

Ports the read half of `CozyStackApi` (`android/…/CozyStackApi.kt`): `get` (`:99`), `list` (`:104`, `links.next` paging), `download` (`:125`), `thumbnail` (`:135`). Bearer header + one 401→refresh→retry (ports the `AuthInterceptor`/`TokenAuthenticator`, `:26-50`).

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/CozyFilesApi.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/CozyFilesApiReadTests.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs`

**Interfaces:**
- Produces:
  ```swift
  struct CozyFilesApi {
    init(baseURL: String, tokens: TokenProvider, client: HTTPClient)
    func get(_ id: String) async throws -> CozyFile
    func list(dirId: String, page: String?) async throws -> (files: [CozyFile], nextPage: String?)
    func download(id: String, to dest: URL) async throws
    func thumbnail(id: String, to dest: URL) async throws
  }
  ```
  `list`'s `page` is `nil` for the first page (path `/files/{dirId}`) or a relative `links.next` path; it returns the next relative path or `nil`. Hidden-id filtering happens in the enumerator (Task 10), not here. Consumed by Tasks 8 (extends this struct), 9, 10.

- [ ] **Step 1: Write the failing tests**

`ios/TwakeDriveFileProviderExtTests/CozyFilesApiReadTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

final class CozyFilesApiReadTests: XCTestCase {
  private func makeApi(_ handler: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse)) -> CozyFilesApi {
    let store = FakeSessionStore(makeSession(access: "at-live"))
    let http = FakeHTTPClient(handler)
    let tokens = TokenProvider(store: store, client: http, lockURL: nil)
    return CozyFilesApi(baseURL: "https://alice.twake.app", tokens: tokens, client: http)
  }

  func testGetParsesAttributesAndSendsBearerAndAccept() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/file-1")
      XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer at-live")
      XCTAssertEqual(req.value(forHTTPHeaderField: "Accept"), "application/vnd.api+json")
      return httpResponse(req.url!, 200, #"{"data":{"id":"file-1","attributes":{"type":"file","name":"a.pdf","dir_id":"d","size":"3","mime":"application/pdf"}}}"#)
    }
    let f = try await api.get("file-1")
    XCTAssertEqual(f.name, "a.pdf")
    XCTAssertEqual(f.size, 3)
  }

  func testListParsesIncludedAndFollowsLinksNext() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/dir-1")
      let json = #"""
      {"included":[
        {"id":"c1","attributes":{"type":"file","name":"one.txt","dir_id":"dir-1","size":"1"}},
        {"id":"c2","attributes":{"type":"directory","name":"sub","dir_id":"dir-1"}}
      ],"links":{"next":"https://alice.twake.app/files/dir-1?page[cursor]=abc"}}
      """#
      return httpResponse(req.url!, 200, json)
    }
    let (files, next) = try await api.list(dirId: "dir-1", page: nil)
    XCTAssertEqual(files.map(\.id), ["c1", "c2"])
    XCTAssertEqual(next, "/files/dir-1?page[cursor]=abc")   // base stripped
  }

  func testListReturnsNilNextWhenNoLink() async throws {
    let api = makeApi { req in httpResponse(req.url!, 200, #"{"included":[]}"#) }
    let (files, next) = try await api.list(dirId: "d", page: nil)
    XCTAssertTrue(files.isEmpty)
    XCTAssertNil(next)
  }

  func testRetriesOnceOn401ThenSucceeds() async throws {
    let store = FakeSessionStore(makeSession(access: "at-old"))
    var calls = 0
    let http = FakeHTTPClient { req in
      calls += 1
      if req.url?.path == "/auth/access_token" {
        return httpResponse(req.url!, 200, #"{"access_token":"at-new"}"#)
      }
      if calls == 1 { return httpResponse(req.url!, 401, "{}") }       // first data call: 401
      XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer at-new")
      return httpResponse(req.url!, 200, #"{"data":{"id":"x","attributes":{"type":"file","name":"n","size":"0"}}}"#)
    }
    let tokens = TokenProvider(store: store, client: http, lockURL: nil)
    let api = CozyFilesApi(baseURL: "https://alice.twake.app", tokens: tokens, client: http)
    let f = try await api.get("x")
    XCTAssertEqual(f.id, "x")
  }

  func testDownloadWritesBytesToDest() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/download/file-1")
      return (Data("hello".utf8), HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
    let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try await api.download(id: "file-1", to: dest)
    XCTAssertEqual(try String(contentsOf: dest, encoding: .utf8), "hello")
  }
}
```

- [ ] **Step 2: Register + run, expect fail**

Append `'CozyFilesApi.swift'` to `SHARED_SOURCES`; `'CozyFilesApiReadTests.swift'` to `TEST_ONLY_SOURCES`; run the script + `xcodebuild test`. Expected: FAIL (`CozyFilesApi` undefined).

- [ ] **Step 3: Minimal implementation**

`ios/TwakeDriveFileProviderExt/CozyFilesApi.swift`:
```swift
import Foundation

struct CozyFilesApi {
  let baseURL: String
  let tokens: TokenProvider
  let client: HTTPClient

  // MARK: request plumbing

  enum Method: String { case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE" }

  private func request(_ path: String, method: Method, token: String,
                       accept: Bool, contentType: String? = nil, body: Data? = nil) -> URLRequest {
    // `path` may be a bare path or already-encoded query; resolve against base.
    var req = URLRequest(url: URL(string: baseURL + path)!)
    req.httpMethod = method.rawValue
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if accept { req.setValue("application/vnd.api+json", forHTTPHeaderField: "Accept") }
    if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
    if let body { req.httpBody = body }
    return req
  }

  /// Sends with the current token; on 401 force-refreshes and retries once; then maps status → CozyError.
  @discardableResult
  func send(_ path: String, method: Method, accept: Bool = true,
            contentType: String? = nil, body: Data? = nil) async throws -> Data {
    var token = try await tokens.validAccessToken()
    var (data, resp) = try await client.send(request(path, method: method, token: token, accept: accept, contentType: contentType, body: body))
    if resp.statusCode == 401 {
      token = try await tokens.forceRefresh()
      (data, resp) = try await client.send(request(path, method: method, token: token, accept: accept, contentType: contentType, body: body))
    }
    try Self.mapStatus(resp.statusCode)
    return data
  }

  static func mapStatus(_ code: Int) throws {
    switch code {
    case 200...299: return
    case 401, 403:  throw CozyError.notAuthenticated
    case 404:       throw CozyError.noSuchItem
    case 409:       throw CozyError.filenameCollision
    case 507:       throw CozyError.insufficientQuota
    default:        throw CozyError.server(code)
    }
  }

  static func encode(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: .urlQueryValueAllowed) ?? s
  }

  private func parseData(_ data: Data) throws -> CozyFile {
    guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let node = root["data"] as? [String: Any],
          let id = node["id"] as? String,
          let attrs = node["attributes"] as? [String: Any] else { throw CozyError.server(-1) }
    return CozyFile.fromAttributes(id: id, attrs)
  }

  // MARK: read

  func get(_ id: String) async throws -> CozyFile {
    try parseData(try await send("/files/\(id)", method: .get))
  }

  /// One page of children + the next relative page path (base-stripped), mirroring CozyStackApi.list.
  func list(dirId: String, page: String?) async throws -> (files: [CozyFile], nextPage: String?) {
    let path = page ?? "/files/\(dirId)"
    let data = try await send(path, method: .get)
    guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      return ([], nil)
    }
    let included = (root["included"] as? [[String: Any]]) ?? []
    let files: [CozyFile] = included.compactMap { node in
      guard let id = node["id"] as? String, let attrs = node["attributes"] as? [String: Any] else { return nil }
      return CozyFile.fromAttributes(id: id, attrs)
    }
    var next: String? = nil
    if let links = root["links"] as? [String: Any], let raw = links["next"] as? String, !raw.isEmpty {
      next = raw.hasPrefix(baseURL) ? String(raw.dropFirst(baseURL.count)) : raw
    }
    return (files, next)
  }

  func download(id: String, to dest: URL) async throws {
    let data = try await send("/files/download/\(id)", method: .get, accept: false)
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: dest, options: .atomic)
  }

  func thumbnail(id: String, to dest: URL) async throws {
    let data = try await send("/files/\(id)/thumbnails/medium", method: .get, accept: false)
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: dest, options: .atomic)
  }
}

extension CharacterSet {
  /// Query-value safe set (encodes `&`, `=`, `/`, `?`, space) for Name=/Path= params.
  static let urlQueryValueAllowed: CharacterSet = {
    var set = CharacterSet.alphanumerics
    set.insert(charactersIn: "-._~")
    return set
  }()
}
```

- [ ] **Step 4: Run, expect pass** — run the `xcodebuild test` command. Expected: `TEST SUCCEEDED`; all `CozyFilesApiReadTests` green (get/list/paging/401-retry/download).

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/CozyFilesApi.swift ios/TwakeDriveFileProviderExtTests/CozyFilesApiReadTests.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): cozy files read API (get/list paging/download/thumbnail + 401 retry)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 8: `CozyFilesApi.swift` — write endpoints (TDD)

Ports the write half of `CozyStackApi`: `createDirectory` (`:172`), `createFile` (`:176`), `upload` (`:180`), `rename` (`:205`, PATCH attrs), `move`'s plain PATCH (`:221-233` minus the 409 branch — that moves to Task 9), `trash` (`:208`), `statByPath` (`:216`).

**Files:**
- Modify: `ios/TwakeDriveFileProviderExt/CozyFilesApi.swift` (add a `// MARK: write` section)
- Create: `ios/TwakeDriveFileProviderExtTests/CozyFilesApiWriteTests.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs` (test file only — `CozyFilesApi.swift` is already a member)

**Interfaces:**
- Produces (added to `CozyFilesApi`):
  ```swift
  func upload(id: String, from src: URL, mime: String) async throws -> CozyFile
  func createFile(parentId: String, name: String, mime: String) async throws -> CozyFile
  func createDirectory(parentId: String, name: String) async throws -> CozyFile
  func rename(id: String, name: String) async throws -> CozyFile
  func move(id: String, toParent parentId: String) async throws -> CozyFile   // plain PATCH; 409 handled by ConflictResolver
  func trash(id: String) async throws
  func statByPath(_ path: String) async throws -> CozyFile?                    // nil on 404
  ```
  Consumed by Tasks 9 (`ConflictResolver`), 11 (write glue).

- [ ] **Step 1: Write the failing tests**

`ios/TwakeDriveFileProviderExtTests/CozyFilesApiWriteTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

final class CozyFilesApiWriteTests: XCTestCase {
  private func makeApi(_ handler: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse)) -> CozyFilesApi {
    let store = FakeSessionStore(makeSession(access: "at-live"))
    let http = FakeHTTPClient(handler)
    return CozyFilesApi(baseURL: "https://alice.twake.app",
                        tokens: TokenProvider(store: store, client: http, lockURL: nil), client: http)
  }
  private let ok = #"{"data":{"id":"new-1","attributes":{"type":"file","name":"n","size":"0"}}}"#

  func testCreateDirectoryPostsTypeDirectory() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "POST")
      XCTAssertEqual(req.url?.path, "/files/parent-1")
      let q = req.url?.query ?? ""
      XCTAssertTrue(q.contains("Type=directory"))
      XCTAssertTrue(q.contains("Name=My%20Folder"))            // space percent-encoded by CozyFilesApi.encode
      return httpResponse(req.url!, 201, #"{"data":{"id":"d","attributes":{"type":"directory","name":"My Folder"}}}"#)
    }
    let f = try await api.createDirectory(parentId: "parent-1", name: "My Folder")
    XCTAssertTrue(f.isDir)
  }

  func testCreateFilePostsTypeFileWithMime() async throws {
    let api = makeApi { req in
      XCTAssertTrue((req.url?.query ?? "").contains("Type=file"))
      XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "text/plain")
      return httpResponse(req.url!, 201, self.ok)
    }
    _ = try await api.createFile(parentId: "p", name: "a.txt", mime: "text/plain")
  }

  func testUploadPutsBytes() async throws {
    let src = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try Data("payload".utf8).write(to: src)
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "PUT")
      XCTAssertEqual(req.url?.path, "/files/file-1")
      XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/octet-stream")
      XCTAssertEqual(req.httpBody, Data("payload".utf8))
      return httpResponse(req.url!, 200, self.ok)
    }
    _ = try await api.upload(id: "file-1", from: src, mime: "application/octet-stream")
  }

  func testRenamePatchesNameAttribute() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "PATCH")
      XCTAssertEqual(req.url?.path, "/files/file-1")
      let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
      XCTAssertTrue(body.contains("\"name\":\"renamed.txt\""))
      XCTAssertTrue(body.contains("\"type\":\"io.cozy.files\""))
      return httpResponse(req.url!, 200, self.ok)
    }
    _ = try await api.rename(id: "file-1", name: "renamed.txt")
  }

  func testMovePatchesDirId() async throws {
    let api = makeApi { req in
      let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
      XCTAssertTrue(body.contains("\"dir_id\":\"target-1\""))
      return httpResponse(req.url!, 200, self.ok)
    }
    _ = try await api.move(id: "file-1", toParent: "target-1")
  }

  func testMoveThrowsFilenameCollisionOn409() async throws {
    let api = makeApi { req in httpResponse(req.url!, 409, "{}") }
    do { _ = try await api.move(id: "f", toParent: "t"); XCTFail("expected throw") }
    catch { XCTAssertEqual(error as? CozyError, .filenameCollision) }
  }

  func testTrashSendsDelete() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "DELETE")
      XCTAssertEqual(req.url?.path, "/files/file-1")
      return httpResponse(req.url!, 200, "{}")
    }
    try await api.trash(id: "file-1")
  }

  func testStatByPathReturnsNilOn404() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/metadata")
      XCTAssertTrue((req.url?.query ?? "").contains("Path="))
      return httpResponse(req.url!, 404, "{}")
    }
    let r = try await api.statByPath("/Docs/x.txt")
    XCTAssertNil(r)
  }
}
```

- [ ] **Step 2: Register + run, expect fail**

Append `'CozyFilesApiWriteTests.swift'` to `TEST_ONLY_SOURCES` (do **not** re-add `CozyFilesApi.swift`); run the script + `xcodebuild test`. Expected: FAIL (write methods undefined).

- [ ] **Step 3: Minimal implementation** — append to `CozyFilesApi` in `ios/TwakeDriveFileProviderExt/CozyFilesApi.swift`:
```swift
extension CozyFilesApi {
  // MARK: write

  func createDirectory(parentId: String, name: String) async throws -> CozyFile {
    let data = try await send("/files/\(parentId)?Type=directory&Name=\(Self.encode(name))",
                              method: .post)
    return try parseData(data)
  }

  func createFile(parentId: String, name: String, mime: String) async throws -> CozyFile {
    let data = try await send("/files/\(parentId)?Type=file&Name=\(Self.encode(name))",
                              method: .post, contentType: mime, body: Data())
    return try parseData(data)
  }

  func upload(id: String, from src: URL, mime: String) async throws -> CozyFile {
    let bytes = try Data(contentsOf: src)
    let data = try await send("/files/\(id)", method: .put, accept: true, contentType: mime, body: bytes)
    return try parseData(data)
  }

  private func patch(_ id: String, attributes: [String: Any]) async throws -> CozyFile {
    let payload: [String: Any] = ["data": ["type": "io.cozy.files", "id": id, "attributes": attributes]]
    let body = try JSONSerialization.data(withJSONObject: payload)
    let data = try await send("/files/\(id)", method: .patch, contentType: "application/vnd.api+json", body: body)
    return try parseData(data)
  }

  func rename(id: String, name: String) async throws -> CozyFile {
    try await patch(id, attributes: ["name": name])
  }

  /// Plain reparent PATCH. A 409 surfaces as CozyError.filenameCollision; ConflictResolver (Task 9) resolves it.
  func move(id: String, toParent parentId: String) async throws -> CozyFile {
    try await patch(id, attributes: ["dir_id": parentId])
  }

  func trash(id: String) async throws {
    _ = try await send("/files/\(id)", method: .delete)
  }

  func statByPath(_ path: String) async throws -> CozyFile? {
    do {
      let data = try await send("/files/metadata?Path=\(Self.encode(path))", method: .get)
      return try parseData(data)
    } catch CozyError.noSuchItem {
      return nil
    }
  }
}
```

> The `rename` body encodes JSON via `JSONSerialization`, which does not guarantee key order; the test asserts on substring presence (`"name":"renamed.txt"` and `"type":"io.cozy.files"`), not full-string equality, so it is order-independent.

- [ ] **Step 4: Run, expect pass** — run the `xcodebuild test` command. Expected: `TEST SUCCEEDED`; all `CozyFilesApiWriteTests` green.

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/CozyFilesApi.swift ios/TwakeDriveFileProviderExtTests/CozyFilesApiWriteTests.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): cozy files write API (create/upload/rename/move/trash/statByPath)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 9: `ConflictResolver.swift` — move 409 → statByPath → trash → retry (TDD)

Ports the 409 branch of `CozyStackApi.move` (`android/…/CozyStackApi.kt:221-234`): on a collision, resolve the destination path, trash the conflicting entry, retry the move.

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/ConflictResolver.swift`
- Create: `ios/TwakeDriveFileProviderExtTests/ConflictResolverTests.swift`
- Modify: `scripts/ios-add-file-provider-tests.cjs`

**Interfaces:**
- Produces:
  ```swift
  protocol MoveConflictOps {
    func move(id: String, toParent parentId: String) async throws -> CozyFile
    func get(_ id: String) async throws -> CozyFile
    func statByPath(_ path: String) async throws -> CozyFile?
    func trash(id: String) async throws
  }
  extension CozyFilesApi: MoveConflictOps {}
  struct ConflictResolver { init(api: MoveConflictOps); func move(id: String, toParent parentId: String) async throws -> CozyFile }
  ```
  The protocol seam lets tests drive the branches with a scripted fake. Consumed by Task 11 (`modifyItem` reparent).

- [ ] **Step 1: Write the failing tests**

`ios/TwakeDriveFileProviderExtTests/ConflictResolverTests.swift`:
```swift
import XCTest
@testable import TwakeDriveFileProviderExt

private final class ScriptedApi: MoveConflictOps {
  var moveResults: [Result<CozyFile, Error>]           // consumed in order per move() call
  var getById: [String: CozyFile] = [:]
  var statByPathResult: CozyFile?
  private(set) var trashed: [String] = []
  private(set) var moveCalls = 0
  private(set) var statedPaths: [String] = []
  init(moveResults: [Result<CozyFile, Error>]) { self.moveResults = moveResults }

  func move(id: String, toParent parentId: String) async throws -> CozyFile {
    defer { moveCalls += 1 }
    switch moveResults[moveCalls] { case .success(let f): return f; case .failure(let e): throw e }
  }
  func get(_ id: String) async throws -> CozyFile {
    guard let f = getById[id] else { throw CozyError.noSuchItem }
    return f
  }
  func statByPath(_ path: String) async throws -> CozyFile? { statedPaths.append(path); return statByPathResult }
  func trash(id: String) async throws { trashed.append(id) }
}

private func file(_ id: String, name: String, path: String? = nil, dir: Bool = false) -> CozyFile {
  CozyFile(id: id, name: name, isDir: dir, dirId: nil, size: 0, mime: nil, klass: nil,
           updatedAt: Date(timeIntervalSince1970: 0), path: path)
}

final class ConflictResolverTests: XCTestCase {
  func testPlainMoveSucceedsWithoutConflict() async throws {
    let moved = file("f", name: "a.txt")
    let api = ScriptedApi(moveResults: [.success(moved)])
    let r = try await ConflictResolver(api: api).move(id: "f", toParent: "t")
    XCTAssertEqual(r.id, "f")
    XCTAssertEqual(api.moveCalls, 1)
    XCTAssertTrue(api.trashed.isEmpty)
  }

  func test409TrashesConflictAtDestPathThenRetries() async throws {
    let api = ScriptedApi(moveResults: [.failure(CozyError.filenameCollision), .success(file("f", name: "a.txt"))])
    api.getById["f"] = file("f", name: "a.txt")               // moving item (for its name)
    api.getById["t"] = file("t", name: "Target", path: "/Docs/Target", dir: true)  // dest dir (for its path)
    api.statByPathResult = file("dup", name: "a.txt")         // conflicting entry at dest
    let r = try await ConflictResolver(api: api).move(id: "f", toParent: "t")
    XCTAssertEqual(r.id, "f")
    XCTAssertEqual(api.statedPaths, ["/Docs/Target/a.txt"])   // dest path + moving name
    XCTAssertEqual(api.trashed, ["dup"])                       // conflict trashed
    XCTAssertEqual(api.moveCalls, 2)                           // retried
  }

  func test409WithNoConflictingEntryStillRetries() async throws {
    let api = ScriptedApi(moveResults: [.failure(CozyError.filenameCollision), .success(file("f", name: "a.txt"))])
    api.getById["f"] = file("f", name: "a.txt")
    api.getById["t"] = file("t", name: "T", path: "/Docs/T", dir: true)
    api.statByPathResult = nil                                 // nothing to trash
    _ = try await ConflictResolver(api: api).move(id: "f", toParent: "t")
    XCTAssertTrue(api.trashed.isEmpty)
    XCTAssertEqual(api.moveCalls, 2)
  }

  func testNonCollisionErrorPropagates() async throws {
    let api = ScriptedApi(moveResults: [.failure(CozyError.notAuthenticated)])
    do { _ = try await ConflictResolver(api: api).move(id: "f", toParent: "t"); XCTFail("expected throw") }
    catch { XCTAssertEqual(error as? CozyError, .notAuthenticated) }  // not swallowed by the 409 path
  }
}
```

- [ ] **Step 2: Register + run, expect fail**

Append `'ConflictResolver.swift'` to `SHARED_SOURCES`; `'ConflictResolverTests.swift'` to `TEST_ONLY_SOURCES`; run the script + `xcodebuild test`. Expected: FAIL (`ConflictResolver`/`MoveConflictOps` undefined).

- [ ] **Step 3: Minimal implementation**

`ios/TwakeDriveFileProviderExt/ConflictResolver.swift`:
```swift
import Foundation

/// The subset of CozyFilesApi the resolver needs — a seam so it is unit-testable.
protocol MoveConflictOps {
  func move(id: String, toParent parentId: String) async throws -> CozyFile
  func get(_ id: String) async throws -> CozyFile
  func statByPath(_ path: String) async throws -> CozyFile?
  func trash(id: String) async throws
}

extension CozyFilesApi: MoveConflictOps {}

struct ConflictResolver {
  let api: MoveConflictOps

  /// Move with cozy-web's moveEntry semantics: on a 409 collision, trash the
  /// conflicting destination entry then retry once (ports CozyStackApi.move :221-234).
  func move(id: String, toParent parentId: String) async throws -> CozyFile {
    do {
      return try await api.move(id: id, toParent: parentId)
    } catch CozyError.filenameCollision {
      let moving = try await api.get(id)
      let parent = try await api.get(parentId)
      guard let base = parent.path?.trimmedTrailingSlash, !base.isEmpty else {
        throw CozyError.filenameCollision            // can't resolve dest path — surface the collision
      }
      if let conflict = try await api.statByPath("\(base)/\(moving.name)") {
        try await api.trash(id: conflict.id)
      }
      return try await api.move(id: id, toParent: parentId)
    }
  }
}

private extension String {
  var trimmedTrailingSlash: String {
    hasSuffix("/") ? String(dropLast()) : self
  }
}
```

- [ ] **Step 4: Run, expect pass** — run the `xcodebuild test` command. Expected: `TEST SUCCEEDED`; all `ConflictResolverTests` green (plain move, 409-with-conflict, 409-no-conflict, non-collision propagation).

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/ConflictResolver.swift ios/TwakeDriveFileProviderExtTests/ConflictResolverTests.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): move conflict resolver (409 → statByPath → trash → retry)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

---

### Task 10: `FileProviderEnumerator` + read-path glue (build + device)

Wires the pure layer into `NSFileProvider`: enumeration (paged, hidden-filtered), `item(for:)`, `fetchContents`, `fetchThumbnails`. Ports `queryChildDocuments`/`links.next` (`CozyStackApi.kt:108-120`) and `openDocument`/`openDocumentThumbnail` (`TwakeDocumentsProvider.kt:60-84`). Glue = device-validated (not in the test target).

**Files:**
- Create: `ios/TwakeDriveFileProviderExt/FileProviderEnumerator.swift`
- Modify: `ios/TwakeDriveFileProviderExt/FileProviderExtension.swift` (fill read methods + a `makeApi(from:)` factory)
- Modify: `scripts/ios-add-file-provider.cjs` — add `'FileProviderEnumerator.swift'` to `sourceFiles` **and** re-run so it joins the ext target. (Alternatively add it once via the tests script's ext-membership path; keep it **out** of `SHARED_SOURCES` — it imports the live extension and must not be in the test bundle.)

**Interfaces:**
- Consumes: `CozyFilesApi`, `ItemMapper`, `KeychainSessionStore`, `TokenProvider` (Tasks 3–8).
- Produces:
  ```swift
  final class FileProviderEnumerator: NSObject, NSFileProviderEnumerator {
    init(containerIdentifier: NSFileProviderItemIdentifier, api: CozyFilesApi)
  }
  ```
  and a filled `item(for:)`, `fetchContents`, `fetchThumbnails`, `enumerator(for:)` on `FileProviderExtension`. Consumed by Task 11 (write glue reuses `makeApi`).

- [ ] **Step 1: Add `FileProviderEnumerator.swift` to the ext target only**

`ios-add-file-provider.cjs` has an idempotency guard that aborts once the target exists, so do **not** re-run it. Instead extend the tests script with an `EXT_ONLY_SOURCES` array synced to the **ext** target only (it imports the live extension, so it must stay **out** of the test bundle). In `scripts/ios-add-file-provider-tests.cjs`, add the array and a sync loop after the existing SHARED/TEST loops, then re-run it:
```js
const EXT_ONLY_SOURCES = ['FileProviderEnumerator.swift'];
// ...after the SHARED_SOURCES and TEST_ONLY_SOURCES loops:
for (const f of EXT_ONLY_SOURCES) { ensureMembership(ensureFileRef(f, EXT_GROUP), f, EXT_TARGET); }
```
Run: `node scripts/ios-add-file-provider-tests.cjs`.

- [ ] **Step 2: Write the enumerator**

`ios/TwakeDriveFileProviderExt/FileProviderEnumerator.swift`:
```swift
import FileProvider

final class FileProviderEnumerator: NSObject, NSFileProviderEnumerator {
  private let containerIdentifier: NSFileProviderItemIdentifier
  private let api: CozyFilesApi
  private static let maxPages = 50            // safety cap (parity with CozyStackApi.list :119)

  init(containerIdentifier: NSFileProviderItemIdentifier, api: CozyFilesApi) {
    self.containerIdentifier = containerIdentifier
    self.api = api
  }

  func invalidate() {}

  private var dirId: String {
    containerIdentifier == .rootContainer ? ItemMapper.rootDocID : containerIdentifier.rawValue
  }

  func enumerateItems(for observer: NSFileProviderEnumerationObserver, startingAt page: NSFileProviderPage) {
    let isInitial = page.rawValue == NSFileProviderPage.initialPageSortedByName.rawValue
      || page.rawValue == NSFileProviderPage.initialPageSortedByDate.rawValue
    let pagePath: String? = isInitial ? nil : String(data: page.rawValue, encoding: .utf8)

    Task {
      do {
        let (files, next) = try await api.list(dirId: dirId, page: pagePath)
        let items = files
          .filter { !ItemMapper.isHidden($0.id) }        // hide trash + shared-drives (DocumentMapper.HIDDEN_IDS)
          .map { ItemMapper.item(from: $0) }
        observer.didEnumerate(items)
        if let next, let data = next.data(using: .utf8) {
          observer.finishEnumerating(upTo: NSFileProviderPage(data))
        } else {
          observer.finishEnumerating(upTo: nil)
        }
      } catch {
        observer.finishEnumeratingWithError(FileProviderExtension.mapError(error))
      }
    }
  }

  func enumerateChanges(for observer: NSFileProviderChangeObserver, from anchor: NSFileProviderSyncAnchor) {
    // MVP: no delta feed. Bump the anchor so the system re-enumerates on demand; our own
    // mutations are pushed via signalEnumerator (parity with Android notifyChange).
    observer.finishEnumeratingChanges(upTo: currentAnchor(), moreComing: false)
  }

  func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
    completionHandler(currentAnchor())
  }

  private func currentAnchor() -> NSFileProviderSyncAnchor {
    NSFileProviderSyncAnchor(Data("\(Date().timeIntervalSince1970)".utf8))
  }
}
```

- [ ] **Step 3: Fill the read glue + factory in `FileProviderExtension.swift`**

Replace the `item(for:)`, `fetchContents(for:)`, `enumerator(for:)` stubs and add `fetchThumbnails`, the `makeApi(from:)` factory, and the `mapError` helper:
```swift
import FileProvider
import UniformTypeIdentifiers

final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
  private let domain: NSFileProviderDomain
  private let api: CozyFilesApi

  required init(domain: NSFileProviderDomain) {
    self.domain = domain
    self.api = FileProviderExtension.makeApi()
    super.init()
  }

  func invalidate() {}

  /// Builds the cozy client from the shared keychain session + App Group lock file.
  static func makeApi() -> CozyFilesApi {
    let store = KeychainSessionStore(access: RealKeychainAccess())
    let baseURL = (try? store.load())?.baseURL ?? ""
    let lockURL = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: "group.com.linagora.twakedrive")?
      .appendingPathComponent("token-refresh.lock")
    let tokens = TokenProvider(store: store, client: URLSessionHTTPClient(), lockURL: lockURL)
    return CozyFilesApi(baseURL: baseURL, tokens: tokens, client: URLSessionHTTPClient())
  }

  static func mapError(_ error: Error) -> NSError {
    let code: NSFileProviderError.Code
    switch error {
    case CozyError.notAuthenticated:  code = .notAuthenticated
    case CozyError.noSuchItem:        code = .noSuchItem
    case CozyError.filenameCollision: code = .filenameCollision
    case CozyError.insufficientQuota: code = .insufficientQuota
    case CozyError.offline, CozyError.serverUnreachable: code = .serverUnreachable
    default:                          code = .serverUnreachable
    }
    return NSError(domain: NSFileProviderErrorDomain, code: code.rawValue,
                   userInfo: [NSUnderlyingErrorKey: error])
  }

  func item(for identifier: NSFileProviderItemIdentifier,
            request: NSFileProviderRequest,
            completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void) -> Progress {
    Task {
      do {
        let id = identifier == .rootContainer ? ItemMapper.rootDocID : identifier.rawValue
        let file = try await api.get(id)
        completionHandler(ItemMapper.item(from: file), nil)
      } catch {
        completionHandler(nil, Self.mapError(error))
      }
    }
    return Progress()
  }

  func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier,
                     version requestedVersion: NSFileProviderItemVersion?,
                     request: NSFileProviderRequest,
                     completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) -> Progress {
    Task {
      do {
        let file = try await api.get(itemIdentifier.rawValue)
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try await api.download(id: itemIdentifier.rawValue, to: dest)
        completionHandler(dest, ItemMapper.item(from: file), nil)
      } catch {
        completionHandler(nil, nil, Self.mapError(error))
      }
    }
    return Progress()
  }

  func fetchThumbnails(for itemIdentifiers: [NSFileProviderItemIdentifier],
                       requestedSize size: CGSize,
                       perThumbnailCompletionHandler: @escaping (NSFileProviderItemIdentifier, Data?, Error?) -> Void,
                       completionHandler: @escaping (Error?) -> Void) -> Progress {
    Task {
      for id in itemIdentifiers {
        do {
          let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
          try await api.thumbnail(id: id.rawValue, to: dest)
          perThumbnailCompletionHandler(id, try? Data(contentsOf: dest), nil)
        } catch {
          perThumbnailCompletionHandler(id, nil, Self.mapError(error))
        }
      }
      completionHandler(nil)
    }
    return Progress()
  }

  func enumerator(for containerItemIdentifier: NSFileProviderItemIdentifier,
                  request: NSFileProviderRequest) throws -> NSFileProviderEnumerator {
    FileProviderEnumerator(containerIdentifier: containerItemIdentifier, api: api)
  }

  // createItem / modifyItem / deleteItem remain the Task-1 stubs until Task 11.
}
```
Keep the Task-1 `createItem`/`modifyItem`/`deleteItem` stubs in the file (unchanged) so it still compiles; Task 11 replaces them.

- [ ] **Step 4: Build both targets (Simulator) + run the logic suite**

```bash
node scripts/ios-add-file-provider-tests.cjs
cd ios && pod install && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
xcodebuild test -project TwakeDrive.xcodeproj -scheme TwakeDriveFileProviderExtTests \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```
Expected: app `** BUILD SUCCEEDED **` (the `.appex` now contains the enumerator + read glue); `TEST SUCCEEDED` (logic suite unaffected — glue is not in the test bundle).

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/FileProviderEnumerator.swift ios/TwakeDriveFileProviderExt/FileProviderExtension.swift \
  scripts/ios-add-file-provider-tests.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): File Provider read path (enumerate/item/fetchContents/thumbnails)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

- [ ] **Step 6: Device validation (after Task 13's signed build reaches TestFlight; check these off then)**

Requires a **real device** (File Provider extensions do not run in the Simulator's Files app reliably; the domain is registered in Task 12). On the device, in the Files app → Browse → **Twake Drive**:
1. The **Twake Drive** location appears under "Locations".
2. Tapping it lists the **root** folder contents; **Trash** and **Shared drives** do **not** appear (hidden ids filtered).
3. Navigate into a **subfolder** — its children load (paging works on a folder with >100 items: scroll to the bottom, more load).
4. Tap a **PDF/image** file — it downloads and opens in Quick Look.
5. An **image** file shows a **thumbnail** in the grid view (not a generic icon).
6. Airplane-mode → tap an un-cached file → a "cannot connect"/offline error (mapped `.serverUnreachable`), not a crash.

---

### Task 11: Write-path glue — create / modify / delete + signal (build + device)

Fills `createItem`/`modifyItem`/`deleteItem`, wraps reparent in `ConflictResolver`, and signals the enumerator after each mutation (parity with Android `notifyChange`, `TwakeDocumentsProvider.kt:141-145`). Ports `createDocument` (`:127`), `renameDocument`/`moveDocument`/`openForWrite` (`:86-163`), `deleteDocument` (`:165`).

**Files:**
- Modify: `ios/TwakeDriveFileProviderExt/FileProviderExtension.swift`

**Interfaces:**
- Consumes: `CozyFilesApi` (write), `ConflictResolver`, `ItemMapper`, `NSFileProviderManager`.
- Produces: full read-write parity; each mutation returns the mapped `NSFileProviderItem` and signals the affected parent container.

- [ ] **Step 1: Add the ConflictResolver + a signal helper to the extension**

In `FileProviderExtension`, store a resolver alongside `api` and add the signal helper:
```swift
  private let resolver: ConflictResolver
  // in init(domain:), after `self.api = ...`:
  //   self.resolver = ConflictResolver(api: self.api)

  private func signal(_ container: NSFileProviderItemIdentifier) {
    NSFileProviderManager(for: domain)?.signalEnumerator(for: container) { _ in }
  }
```
(Update `required init(domain:)` to set `resolver = ConflictResolver(api: api)` before `super.init()`.)

- [ ] **Step 2: Replace the create/modify/delete stubs**

```swift
  func createItem(basedOn itemTemplate: NSFileProviderItem,
                  fields: NSFileProviderItemFields,
                  contents url: URL?,
                  options: NSFileProviderCreateItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    let parent = itemTemplate.parentItemIdentifier
    let parentId = parent == .rootContainer ? ItemMapper.rootDocID : parent.rawValue
    let name = itemTemplate.filename
    let isFolder = itemTemplate.contentType == .folder
    Task {
      do {
        let created: CozyFile
        if isFolder {
          created = try await api.createDirectory(parentId: parentId, name: name)
        } else {
          let mime = itemTemplate.contentType?.preferredMIMEType ?? "application/octet-stream"
          let stub = try await api.createFile(parentId: parentId, name: name, mime: mime)
          created = url != nil ? try await api.upload(id: stub.id, from: url!, mime: mime) : stub
        }
        signal(parent)
        completionHandler(ItemMapper.item(from: created), [], false, nil)
      } catch {
        completionHandler(nil, [], false, Self.mapError(error))
      }
    }
    return Progress()
  }

  func modifyItem(_ item: NSFileProviderItem,
                  baseVersion version: NSFileProviderItemVersion,
                  changedFields: NSFileProviderItemFields,
                  contents newContents: URL?,
                  options: NSFileProviderModifyItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    let id = item.itemIdentifier.rawValue
    Task {
      do {
        var current = try await api.get(id)
        // 1. content upload (bytes changed)
        if changedFields.contains(.contents), let src = newContents {
          let mime = current.mime ?? item.contentType?.preferredMIMEType ?? "application/octet-stream"
          current = try await api.upload(id: id, from: src, mime: mime)
        }
        // 2. rename
        if changedFields.contains(.filename) {
          current = try await api.rename(id: id, name: item.filename)
        }
        // 3. reparent (with 409 conflict resolution)
        if changedFields.contains(.parentItemIdentifier) {
          let newParent = item.parentItemIdentifier
          let targetId = newParent == .rootContainer ? ItemMapper.rootDocID : newParent.rawValue
          current = try await resolver.move(id: id, toParent: targetId)
        }
        signal(item.parentItemIdentifier)
        completionHandler(ItemMapper.item(from: current), [], false, nil)
      } catch {
        completionHandler(nil, [], false, Self.mapError(error))
      }
    }
    return Progress()
  }

  func deleteItem(identifier: NSFileProviderItemIdentifier,
                  baseVersion version: NSFileProviderItemVersion,
                  options: NSFileProviderDeleteItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (Error?) -> Void) -> Progress {
    Task {
      do {
        let file = try? await api.get(identifier.rawValue)     // capture parent to signal
        try await api.trash(id: identifier.rawValue)
        let parent = file?.dirId.map { ItemMapper.identifier(for: $0) } ?? .rootContainer
        signal(parent)
        completionHandler(nil)
      } catch {
        completionHandler(Self.mapError(error))
      }
    }
    return Progress()
  }
```

- [ ] **Step 3: Build (Simulator) + logic suite**

```bash
cd ios && pod install && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
xcodebuild test -project TwakeDrive.xcodeproj -scheme TwakeDriveFileProviderExtTests \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```
Expected: `** BUILD SUCCEEDED **` and `TEST SUCCEEDED`.

- [ ] **Step 4: Commit**

```bash
git add ios/TwakeDriveFileProviderExt/FileProviderExtension.swift
git commit -m "feat(ios): File Provider write path (create/modify/delete + conflict + signal)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

- [ ] **Step 5: Device validation (after Task 13's signed build; check off then)** — real device, Files → Twake Drive:
1. **Create folder**: long-press empty area → New Folder → "Test" → it appears and persists after pull-to-refresh (created on the server).
2. **Upload**: from another app (Photos/Pages) → Share/Save to Files → **Twake Drive** → pick a folder → the file appears in the web UI too.
3. **Rename**: long-press a file → Rename → new name sticks after refresh.
4. **Move**: drag a file into a subfolder → it moves (verify in the web UI).
5. **Move onto an existing same-name file**: confirm it resolves (old one trashed, moved one present) — no stuck "conflict" error (ConflictResolver path).
6. **Delete**: swipe/delete a file → it disappears here and lands in the **web Trash** (soft-delete).
7. **Token rotation**: leave the app killed for >token TTL, then browse/download in Files → still works (extension refreshed via the shared refresh token + write-back), and the RN app on next cold launch is still authenticated.

---

### Task 12: `FileProviderDomainModule` — domain register/unregister at login/logout (JS TDD + build + device)

Adds an `NSFileProviderDomain` when a session is saved (login) and removes it on logout, so the Twake Drive location appears/disappears in Files — mirroring the Android auth-lifecycle mirroring (`src/native/twakeAuthBridge.ts`, wired in `src/auth/tokenStorage.ts`).

**Files:**
- Create: `ios/TwakeDrive/FileProviderDomainModule.swift`
- Create: `ios/TwakeDrive/FileProviderDomainModule.m`
- Create: `src/native/fileProviderBridge.ts`
- Create: `src/native/fileProviderBridge.test.ts`
- Modify: `src/auth/tokenStorage.ts` (call register/unregister)
- Modify: `src/auth/tokenStorage.test.ts` (assert the calls)
- Create: `scripts/ios-add-domain-module.cjs` (add the two native files to the **main app** target)

**Interfaces:**
- Produces:
  ```ts
  // src/native/fileProviderBridge.ts
  export const registerFileProviderDomain: () => Promise<void>
  export const unregisterFileProviderDomain: () => Promise<void>
  ```
  Native `FileProviderDomainModule` exposes `register()`/`unregister()` promises. iOS-only guards (no-op off iOS or if the module is absent), like `twakeAuthBridge.ts:19`.

- [ ] **Step 1: Write the failing JS tests**

`src/native/fileProviderBridge.test.ts`:
```ts
jest.mock('react-native', () => ({
  NativeModules: {
    FileProviderDomainModule: {
      register: jest.fn(async () => true),
      unregister: jest.fn(async () => true)
    }
  },
  Platform: { OS: 'ios' }
}))

import { NativeModules } from 'react-native'
import { registerFileProviderDomain, unregisterFileProviderDomain } from './fileProviderBridge'

const { register, unregister } = NativeModules.FileProviderDomainModule as {
  register: jest.Mock
  unregister: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

test('register delegates to the native module on iOS', async () => {
  await registerFileProviderDomain()
  expect(register).toHaveBeenCalledTimes(1)
})

test('unregister delegates to the native module on iOS', async () => {
  await unregisterFileProviderDomain()
  expect(unregister).toHaveBeenCalledTimes(1)
})
```

Add to `src/auth/tokenStorage.test.ts` (the file already mocks `expo-secure-store` and `@/native/twakeAuthBridge`; add a mock for the new bridge and two assertions):
```ts
jest.mock('@/native/fileProviderBridge', () => ({
  registerFileProviderDomain: jest.fn(async () => {}),
  unregisterFileProviderDomain: jest.fn(async () => {})
}))
import { registerFileProviderDomain, unregisterFileProviderDomain } from '@/native/fileProviderBridge'

it('saveSession registers the File Provider domain', async () => {
  await saveSession(session)
  expect(registerFileProviderDomain).toHaveBeenCalledTimes(1)
})
it('clearSession unregisters the File Provider domain', async () => {
  await clearSession()
  expect(unregisterFileProviderDomain).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run, expect fail** — `npx jest src/native/fileProviderBridge.test.ts src/auth/tokenStorage.test.ts`. Expected: FAIL (module missing; tokenStorage doesn't call it yet).

- [ ] **Step 3: Implement the JS bridge + wiring**

`src/native/fileProviderBridge.ts`:
```ts
import { NativeModules, Platform } from 'react-native'

interface FileProviderDomainNative {
  register: () => Promise<boolean>
  unregister: () => Promise<boolean>
}

const native: FileProviderDomainNative | undefined = NativeModules.FileProviderDomainModule as
  | FileProviderDomainNative
  | undefined

/** Add the Twake Drive NSFileProviderDomain so it appears in Files. No-op off iOS. */
export const registerFileProviderDomain = async (): Promise<void> => {
  if (Platform.OS !== 'ios' || !native) return
  try {
    await native.register()
  } catch (err) {
    console.warn('[fileProviderBridge] register failed', err)
  }
}

/** Remove the domain (logout). No-op off iOS. */
export const unregisterFileProviderDomain = async (): Promise<void> => {
  if (Platform.OS !== 'ios' || !native) return
  try {
    await native.unregister()
  } catch (err) {
    console.warn('[fileProviderBridge] unregister failed', err)
  }
}
```

In `src/auth/tokenStorage.ts`, import and call the bridge (alongside the existing Android `mirrorSessionToNative`/`clearNativeSession`):
```ts
import { registerFileProviderDomain, unregisterFileProviderDomain } from '@/native/fileProviderBridge'
// saveSession(): after mirrorSessionToNative(session):
await registerFileProviderDomain()
// clearSession(): after clearNativeSession():
await unregisterFileProviderDomain()
```

- [ ] **Step 4: Run JS tests + typecheck** — `npx jest src/native/fileProviderBridge.test.ts src/auth/tokenStorage.test.ts && npm run typecheck`. Expected: PASS, 0 type errors.

- [ ] **Step 5: Write the native module**

`ios/TwakeDrive/FileProviderDomainModule.swift`:
```swift
import Foundation
import FileProvider

@objc(FileProviderDomainModule)
class FileProviderDomainModule: NSObject {
  private static let domainID = NSFileProviderDomainIdentifier(rawValue: "TwakeDrive")

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(register:rejecter:)
  func register(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let domain = NSFileProviderDomain(identifier: Self.domainID, displayName: "Twake Drive")
    NSFileProviderManager.add(domain) { error in
      if let error { reject("register_failed", error.localizedDescription, error) }
      else { resolve(true) }
    }
  }

  @objc(unregister:rejecter:)
  func unregister(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    NSFileProviderManager.getDomainsWithCompletionHandler { domains, _ in
      let mine = domains.first { $0.identifier == Self.domainID }
      guard let mine else { resolve(true); return }
      NSFileProviderManager.remove(mine) { error in
        if let error { reject("unregister_failed", error.localizedDescription, error) }
        else { resolve(true) }
      }
    }
  }
}
```

`ios/TwakeDrive/FileProviderDomainModule.m` (exposes the Swift class to the RN bridge):
```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FileProviderDomainModule, NSObject)
RCT_EXTERN_METHOD(register:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(unregister:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
```

- [ ] **Step 6: Add the two files to the MAIN app target (committed pbxproj, no prebuild)**

`scripts/ios-add-domain-module.cjs`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const PBX = path.join(__dirname, '..', 'ios', 'TwakeDrive.xcodeproj', 'project.pbxproj');
const project = xcode.project(PBX);
project.parseSync();
const objects = project.hash.project.objects;

const MAIN = 'TwakeDrive';
const GROUP = 'TwakeDrive';                 // folder ios/TwakeDrive/
const FILES = ['FileProviderDomainModule.swift', 'FileProviderDomainModule.m'];

function groupByName(name) {
  const groups = objects.PBXGroup || {};
  const key = Object.keys(groups).find((k) => groups[k] && typeof groups[k] === 'object' && groups[k].name === name);
  return groups[key] ? { key, group: groups[key] } : null;
}
function ensureRef(basename, ext) {
  const refs = objects.PBXFileReference || {};
  let key = Object.keys(refs).find((k) => !/_comment$/.test(k) && refs[k] && refs[k].path === basename);
  if (key) return key;
  key = project.generateUuid();
  const type = ext === 'm' ? 'sourcecode.c.objc' : 'sourcecode.swift';
  refs[key] = { isa: 'PBXFileReference', lastKnownFileType: type, path: basename, sourceTree: '"<group>"' };
  refs[`${key}_comment`] = basename;
  const g = groupByName(GROUP);
  g.group.children = g.group.children || [];
  if (!g.group.children.some((c) => c.value === key)) g.group.children.push({ value: key, comment: basename });
  return key;
}
function sourcesPhase(targetName) {
  const t = project.pbxTargetByName(targetName);
  const bp = t.buildPhases.find((p) => p.comment === 'Sources');
  return objects.PBXSourcesBuildPhase[bp.value];
}
function ensureMembership(refKey, basename) {
  const phase = sourcesPhase(MAIN);
  phase.files = phase.files || [];
  const bfs = objects.PBXBuildFile || {};
  if (phase.files.some((f) => bfs[f.value] && bfs[f.value].fileRef === refKey)) return;
  const k = project.generateUuid();
  bfs[k] = { isa: 'PBXBuildFile', fileRef: refKey, fileRef_comment: basename };
  bfs[`${k}_comment`] = `${basename} in Sources`;
  phase.files.push({ value: k, comment: `${basename} in Sources` });
}

for (const f of FILES) {
  if (f.endsWith('.m')) { ensureMembership(ensureRef(f, 'm'), f); }         // .m compiles; .swift compiles
  else { ensureMembership(ensureRef(f, 'swift'), f); }
}
// .swift needs to be a source too:
ensureMembership(ensureRef('FileProviderDomainModule.swift', 'swift'), 'FileProviderDomainModule.swift');

fs.writeFileSync(PBX, project.writeSync());
console.log('[ios-add-domain-module] added', FILES.join(' + '), 'to', MAIN);
```
Run: `node scripts/ios-add-domain-module.cjs`. (The bridging header already exists; `RCT_EXTERN_MODULE` in the `.m` makes the Swift class visible to the RN bridge — no bridging-header edit needed. `FileProvider.framework` auto-links from `import FileProvider`.)

- [ ] **Step 7: Build the app (Simulator) to verify the module compiles + links**

```bash
cd ios && pod install && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
```
Expected: `** BUILD SUCCEEDED **` (the app now contains `FileProviderDomainModule`).

- [ ] **Step 8: Commit**

```bash
git add src/native/fileProviderBridge.ts src/native/fileProviderBridge.test.ts \
  src/auth/tokenStorage.ts src/auth/tokenStorage.test.ts \
  ios/TwakeDrive/FileProviderDomainModule.swift ios/TwakeDrive/FileProviderDomainModule.m \
  scripts/ios-add-domain-module.cjs ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): register/unregister the File Provider domain at login/logout" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

- [ ] **Step 9: Device validation (after Task 13's signed build):**
1. Fresh install, **logged out** → Files has **no** Twake Drive location.
2. **Log in** → within a few seconds, **Twake Drive** appears in Files → Browse → Locations.
3. **Log out** → the location disappears.
4. Log back in → it reappears (register is idempotent — no duplicate location).

---

### Task 13: Signing + CI + signed release

Signs the new `.appex` with its own `match` profile, runs the Swift logic suite in CI, and cuts the signed TestFlight build for the full device pass.

**Files:**
- Modify: `ios/fastlane/Fastfile`
- Modify: `scripts/ios-set-extension-signing.cjs`
- Modify: `.github/workflows/build-ios.yml` (add a `fileprovider-tests` job)

**Interfaces:**
- Consumes: the `TwakeDriveFileProviderExt` target (T1), the logic test target (T2), the user portal/match prereqs.
- Produces: a signed IPA embedding `TwakeDriveFileProviderExt.appex`, a green CI unit-test job, and the TestFlight build used by the device checklists in Tasks 10–12.

- [ ] **Step 1: Per-target manual signing for the new extension**

In `scripts/ios-set-extension-signing.cjs`, add to `TARGETS`:
```js
const TARGETS = {
  TwakeDrive: 'match AppStore com.linagora.twakedrive',
  TwakeDriveShareExt: 'match AppStore com.linagora.twakedrive.ShareExt',
  TwakeDriveFileProviderExt: 'match AppStore com.linagora.twakedrive.FileProvider'
}
```
Run: `node scripts/ios-set-extension-signing.cjs`. Expected: `per-target signing set for TwakeDrive + TwakeDriveShareExt + TwakeDriveFileProviderExt`.

- [ ] **Step 2: Fetch + apply the new profile in the Fastfile**

In `ios/fastlane/Fastfile`, add `"#{APP_IDENTIFIER}.FileProvider"` to the `match` `app_identifier` array **and** to `gym` `export_options.provisioningProfiles`:
```ruby
# match(...):
app_identifier: [APP_IDENTIFIER, "#{APP_IDENTIFIER}.ShareExt", "#{APP_IDENTIFIER}.FileProvider"],
# gym export_options.provisioningProfiles:
provisioningProfiles: {
  APP_IDENTIFIER => "match AppStore #{APP_IDENTIFIER}",
  "#{APP_IDENTIFIER}.ShareExt" => "match AppStore #{APP_IDENTIFIER}.ShareExt",
  "#{APP_IDENTIFIER}.FileProvider" => "match AppStore #{APP_IDENTIFIER}.FileProvider"
}
```
Run: `ruby -c ios/fastlane/Fastfile`. Expected: `Syntax OK`.

- [ ] **Step 3: Add the Swift logic-test CI job**

Append a job to `.github/workflows/build-ios.yml` (same macOS runner + Node/Pods caching policy; runs on main + dispatch, in line with the repo's macOS-minutes policy). No `pod install` needed — the logic bundle has no pods:
```yaml
  fileprovider-tests:
    runs-on: macos-15
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Run File Provider Swift logic tests
        run: |
          DEST=$(xcrun simctl list devices available | grep -m1 -oE 'iPhone [0-9]+' || echo 'iPhone 15')
          cd ios && xcodebuild test \
            -project TwakeDrive.xcodeproj \
            -scheme TwakeDriveFileProviderExtTests \
            -destination "platform=iOS Simulator,name=$DEST"
```

- [ ] **Step 4: USER portal + match prerequisites** (see the top-of-plan Prerequisites — do these before the signed build):
  - On App ID `com.linagora.twakedrive.FileProvider`: enable **App Groups** (Edit → assign "Twake Drive" → Continue → **Save**; reload to confirm it persisted) + **Keychain Sharing**.
  - `cd ios && fastlane match appstore --git_url git@github.com:mmaudet/twake-certs.git --app_identifier com.linagora.twakedrive.FileProvider --force`
  - **Verify the profile carries the App Group** (dotted-key `plutil -extract` silently returns empty — never use `plutil -extract "Entitlements.com.apple.security.application-groups"`):
    ```bash
    security cms -D -i ~/Library/MobileDevice/Provisioning\ Profiles/<uuid>.mobileprovision \
      | plutil -extract Entitlements xml1 -o - - | grep group.com.linagora.twakedrive
    ```
    Expected: a line printing `group.com.linagora.twakedrive`. If empty, the capability was not saved on the App ID — re-do the portal step and re-run `match --force`.

- [ ] **Step 5: Commit the signing/CI changes**

```bash
git add scripts/ios-set-extension-signing.cjs ios/fastlane/Fastfile .github/workflows/build-ios.yml \
  ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "ci(ios): sign the File Provider extension + run its Swift logic tests in CI" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Et9sGrbwAbgEQydQsSAjzG"
```

- [ ] **Step 6: Open the PR + green CI**

Push the branch to `fork`, open the PR to `main`. Expected: `lint`/`typecheck`/`test` green (new jest bridge test included); on merge to `main`, `build-ios` compiles the `.appex` and `fileprovider-tests` runs the Swift logic suite green.

- [ ] **Step 7: Cut the signed TestFlight build**

After merge: `gh workflow run release-ios.yml --repo mmaudet/twake-drive-mobile --ref main` (or push a `vX.Y.Z` tag). Expected: green — the signed IPA embeds `TwakeDriveFileProviderExt.appex` (signed with `match AppStore com.linagora.twakedrive.FileProvider`) and uploads to TestFlight.

- [ ] **Step 8: Full on-device validation (real device from TestFlight)**

Run every device checklist gated in the earlier tasks, in order:
  1. **Domain lifecycle** (Task 12 Step 9): login → location appears; logout → disappears; re-login → single location.
  2. **Read** (Task 10 Step 6): browse root (Trash/Shared-drives hidden), subfolder paging, download+open, image thumbnail, offline error.
  3. **Write** (Task 11 Step 5): create folder, upload from another app, rename, move, move-onto-conflict resolves, delete→web Trash, token-rotation-after-kill.

  When all boxes are checked, Lot C is complete. Update the memory note (iOS File Provider = device-validated) and mark the tracking task done.

---

## Self-Review

- **Spec coverage:**
  - Pure components → TDD tasks: `Session`→T3, `KeychainSessionStore`→T4, `HTTPClient`/`CozyFile`/`ItemMapper`→T5, `TokenProvider`→T6, `CozyFilesApi` (read/write)→T7/T8, `ConflictResolver`→T9.
  - Glue → device tasks: `FileProviderEnumerator` + read glue→T10, write glue→T11.
  - RN domain lifecycle → T12. Target injection→T1, XCTest target→T2, signing/CI/release→T13.
  - Operations→cozy-stack parity table: every row is implemented — `item`/`get`(T7), `enumerate`/`list`+paging(T7/T10), `fetchContents`/`download`(T7/T10), `createItem` file+folder(T8/T11), `modifyItem` content/rename/reparent(T8/T9/T11), `deleteItem`/`trash`(T8/T11), `fetchThumbnails`/`thumbnail`(T7/T10), `statByPath`(T8), token refresh(T6).
  - Token Refresh approach A (single-flight + cross-process `NSFileCoordinator` lock + re-read + write-back of rotated token) → T6, with the documented MVP limitation noted in the spec.
  - Error mapping (`.notAuthenticated`/`.noSuchItem`/`.filenameCollision`/`.serverUnreachable`/`.insufficientQuota`) → `FileProviderExtension.mapError` (T10) exercised by T10/T11.
  - Testing plan (logic-only XCTest bundle, no `TEST_HOST`, dual target membership; `URLProtocol` mock; device checklist) → T2 + per-task TDD + T10–T13 device steps. CI Swift job → T13.
  - CI/signing/user-prereqs incl. the `security cms | plutil -extract Entitlements` verification (never dotted key) → T13 + Prerequisites.
- **No placeholders:** every code step is complete — full XCTest + full Swift for T3–T9; complete plist/entitlements/skeleton/scripts for T1/T2/T12/T13; the pbxproj mutations are concrete `xcode`-lib operations, not hand-fabricated diffs.
- **Signature consistency across tasks:** `Session.baseURL`, `SessionStoring`/`KeychainAccess`, `HTTPClient.send`, `CozyError` cases, `CozyFile.fromAttributes`, `ItemMapper.item(from:)`/`isHidden`/`identifier(for:)`, `TokenProvider(store:client:lockURL:)`/`validAccessToken`/`forceRefresh`, `CozyFilesApi(baseURL:tokens:client:)` + its read/write methods, `MoveConflictOps`/`ConflictResolver(api:)` are declared once and consumed identically downstream (see each task's **Interfaces** block).
- **Deliberate deviation flagged (load-bearing):** the Global Constraints keep the spec's verbatim `kSecAttrService="app"`, but T4 reads via the real expo-secure-store@15.0.8 alias fallback (`app:no-auth`→`app:auth`→`app`) and writes at `app:no-auth`. Verified against `node_modules/expo-secure-store/ios/SecureStoreModule.swift`. Without this, the extension reads a nil session and the Files location never appears — the single most important on-device correctness detail, called out at the top of the plan and in T4.
- **Verification-only tasks (intentional):** T1/T2/T10/T11/T12(native)/T13 are build- + device-verified (native `NSFileProvider` glue isn't unit-testable); T3–T9 and the T12 JS bridge are TDD. Consistent with the Lot A/B plan's approach.

