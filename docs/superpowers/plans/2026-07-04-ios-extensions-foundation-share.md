# iOS Extensions — Foundation + Share Extension (Lot A+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "Share to Drive" on iOS via a native Share Extension, on a reusable foundation (App Group + shared-keychain auth + a committed-pbxproj way to add `.appex` targets without `expo prebuild`).

**Architecture:** The app writes the cozy session into a shared **Keychain access group** that Swift extensions read directly (no RN bridge); an **App Group** carries the shared file; the Share Extension target is **hand-added to the committed `ios/` project** (model generated offline with `@bacons/apple-targets`, ported in by hand). The Share Extension reuses `expo-share-intent`'s iOS template so the existing `useIncomingShare.ts` JS hook is unchanged.

**Tech Stack:** Expo bare RN (SDK 54, New Arch, iOS 16 floor), Swift, `expo-secure-store` (already supports `accessGroup`), `expo-share-intent`, fastlane match.

## Global Constraints

- **NEVER run `expo prebuild`** against the real repo. `ios/` is committed + hand-maintained. `@bacons/apple-targets` / config plugins may run **only in a throwaway clone** to generate boilerplate to copy in.
- Bundle IDs: app `com.linagora.twakedrive`; share ext `com.linagora.twakedrive.ShareExt`. Team `KUT463DS29`.
- App Group `group.com.linagora.twakedrive` (files). Keychain access group `$(AppIdentifierPrefix)com.linagora.twakedrive.shared` (token). Different namespaces — both required.
- Extensions contain **no CocoaPods / no RN runtime**; they are **not** added to the `Podfile`.
- Keychain contract the extension must match exactly: class `kSecClassGenericPassword`, `kSecAttrService = "app"`, `kSecAttrAccount = kSecAttrGeneric = Data("twake-drive-session".utf8)`, `kSecAttrAccessGroup = "<team>.com.linagora.twakedrive.shared"`.
- Work on branch `feat/ios-extensions-foundation-share`. Claude does all code; the user does portal + match + device steps (below).

## Prerequisites (USER — before the *signed* validation; not needed for the Simulator compile)

- **Portal:** enable **App Groups** + **Keychain Sharing** on App IDs `com.linagora.twakedrive` and `com.linagora.twakedrive.ShareExt` (create the latter), both joined to `group.com.linagora.twakedrive`.
- **match:** `fastlane match appstore --git_url git@github.com:mmaudet/twake-certs.git --app_identifier com.linagora.twakedrive.ShareExt --readonly false` (adds the profile using the shared cert `N74WH43FDM`).

## File Structure

- `src/auth/tokenStorage.ts` — MODIFY: write/read/clear the session with `accessGroup` + `keychainAccessible`.
- `src/auth/tokenStorage.test.ts` — CREATE/MODIFY: assert the shared-keychain options are passed.
- `ios/TwakeDrive/TwakeDrive.entitlements` — MODIFY: add App Group + keychain-access-group.
- `ios/TwakeDriveShareExt/` — CREATE: `Info.plist`, `TwakeDriveShareExt.entitlements`, `ShareViewController.swift` (from expo-share-intent), `MainInterface.storyboard` if the template needs it.
- `ios/TwakeDrive.xcodeproj/project.pbxproj` — MODIFY: new `TwakeDriveShareExt` app-extension target + Embed Foundation Extensions phase on the app target.
- `ios/Podfile` — MODIFY: ensure the `expo-share-intent` pod links into the **main** target.
- `ios/fastlane/Fastfile` — MODIFY: add the ShareExt provisioning profile to `gym` `export_options`.

---

### Task 1: Shared-keychain session storage

**Files:**
- Modify: `src/auth/tokenStorage.ts`
- Test: `src/auth/tokenStorage.test.ts`

**Interfaces:**
- Produces: the cozy session is stored in the iOS Keychain under access group `com.linagora.twakedrive.shared` with accessibility `AFTER_FIRST_UNLOCK`, so native extensions can read it. No exported-signature change; behavior change only.

- [ ] **Step 1: Confirm the expo-secure-store option names**

Run: `grep -nE "accessGroup|keychainAccessible|AFTER_FIRST_UNLOCK" node_modules/expo-secure-store/build/SecureStore.d.ts`
Expected: shows `accessGroup?: string`, `keychainAccessible?: KeychainAccessibilityConstant`, and the `AFTER_FIRST_UNLOCK` export. If the option is named differently, use the actual name throughout this task.

- [ ] **Step 2: Write the failing test**

In `src/auth/tokenStorage.test.ts` (mock `expo-secure-store`), assert the shared options are passed on save/get/clear:
```ts
import * as SecureStore from 'expo-secure-store'
import { saveSession, getSession, clearSession } from './tokenStorage'

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK'
}))

const SHARED = { accessGroup: 'com.linagora.twakedrive.shared', keychainAccessible: 'AFTER_FIRST_UNLOCK' }

test('saveSession writes to the shared keychain group, unlocked-after-first-unlock', async () => {
  await saveSession({ any: 'session' } as never)
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('twake-drive-session', expect.any(String), SHARED)
})
test('getSession reads from the shared keychain group', async () => {
  await getSession()
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('twake-drive-session', SHARED)
})
test('clearSession deletes from the shared keychain group', async () => {
  await clearSession()
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('twake-drive-session', SHARED)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/auth/tokenStorage.test.ts`
Expected: FAIL — the calls currently omit the options object.

- [ ] **Step 4: Implement**

In `src/auth/tokenStorage.ts`, add a shared constant and pass it to all three SecureStore calls (keep the existing `SESSION_KEY = 'twake-drive-session'`):
```ts
const SHARED_KEYCHAIN: SecureStore.SecureStoreOptions = {
  // Native extensions (Share, later File Provider) read the SAME item directly.
  // The system prepends the team's $(AppIdentifierPrefix); pass the bare group.
  accessGroup: 'com.linagora.twakedrive.shared',
  // Default WHEN_UNLOCKED would be unreadable while the device is locked,
  // breaking the File Provider's background reads.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
}
// saveSession:  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), SHARED_KEYCHAIN)
// getSession:   const raw = await SecureStore.getItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
// clearSession: await SecureStore.deleteItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/auth/tokenStorage.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/auth/tokenStorage.ts src/auth/tokenStorage.test.ts
git commit -m "feat(ios): store the cozy session in a shared keychain access group"
```

---

### Task 2: App entitlements (App Group + keychain group)

**Files:**
- Modify: `ios/TwakeDrive/TwakeDrive.entitlements`

**Interfaces:**
- Produces: the main app declares `group.com.linagora.twakedrive` and keychain group `$(AppIdentifierPrefix)com.linagora.twakedrive.shared`, matching what `tokenStorage.ts` (Task 1) and the extension (Task 4) use.

- [ ] **Step 1: Replace the empty entitlements with the two groups**

`ios/TwakeDrive/TwakeDrive.entitlements`:
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

- [ ] **Step 2: Validate the plist**

Run: `plutil -lint ios/TwakeDrive/TwakeDrive.entitlements`
Expected: `OK`.

- [ ] **Step 3: Verify the Simulator build still compiles (entitlements aren't enforced unsigned)**

Run:
```bash
cd ios && pod install && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add ios/TwakeDrive/TwakeDrive.entitlements
git commit -m "feat(ios): add App Group + shared keychain group to the app entitlements"
```

---

### Task 3: Inject the Share Extension target into the committed pbxproj

**Files:**
- Create: `ios/TwakeDriveShareExt/Info.plist`, `ios/TwakeDriveShareExt/TwakeDriveShareExt.entitlements`, `ios/TwakeDriveShareExt/ShareViewController.swift` (stub for now — real logic in Task 4)
- Modify: `ios/TwakeDrive.xcodeproj/project.pbxproj`

**Interfaces:**
- Produces: an app-extension target `TwakeDriveShareExt` (bundle `com.linagora.twakedrive.ShareExt`, iOS 16, team `KUT463DS29`), embedded into the app via an "Embed Foundation Extensions" phase. Consumed by Task 4 (fills the Swift) and Task 5 (signing).

- [ ] **Step 1: Generate a correct model OFFLINE (never touches the real ios/)**

```bash
TMP=$(mktemp -d)
git clone --depth 1 "file://$(git rev-parse --show-toplevel)" "$TMP/clone"
cd "$TMP/clone" && npm ci
npx create-target share   # from @bacons/apple-targets, run in the clone only
# or: npx expo prebuild -p ios --no-install  (clone only) then inspect the generated Share Extension target
```
Expected: a generated Share Extension target with a valid `Info.plist` (`NSExtension` → `NSExtensionPointIdentifier = com.apple.share-services`), an `.entitlements`, and the pbxproj objects. Keep this clone open as the reference.

- [ ] **Step 2: Create the committed extension folder**

Copy the generated `Info.plist` + `.entitlements` into `ios/TwakeDriveShareExt/` (rename to `TwakeDriveShareExt`), and add a compiling stub `ShareViewController.swift`:
```swift
import UIKit
import Social

// Replaced in Task 4 by expo-share-intent's controller. Stub so the target compiles.
class ShareViewController: SLComposeServiceViewController {}
```
`TwakeDriveShareExt.entitlements` must contain the App Group + the same keychain group as the app:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.application-groups</key><array><string>group.com.linagora.twakedrive</string></array>
  <key>keychain-access-groups</key><array><string>$(AppIdentifierPrefix)com.linagora.twakedrive.shared</string></array>
</dict></plist>
```

- [ ] **Step 3: Port the target into the committed pbxproj**

Add to `ios/TwakeDrive.xcodeproj/project.pbxproj`, mirroring the generated model: a `PBXNativeTarget` `TwakeDriveShareExt` (productType `com.apple.product-type.app-extension`) with Debug/Release `XCBuildConfiguration` (set `PRODUCT_BUNDLE_IDENTIFIER = com.linagora.twakedrive.ShareExt`, `IPHONEOS_DEPLOYMENT_TARGET = 16.0`, `DEVELOPMENT_TEAM = KUT463DS29`, `CODE_SIGN_ENTITLEMENTS = TwakeDriveShareExt/TwakeDriveShareExt.entitlements`, `INFOPLIST_FILE = TwakeDriveShareExt/Info.plist`, `PRODUCT_NAME = TwakeDriveShareExt`, `SWIFT_VERSION = 5.0`), its `XCConfigurationList`, `Sources`/`Frameworks`/`Resources` phases, the `.appex` product `PBXFileReference`, a `PBXTargetDependency` + `PBXContainerItemProxy` on the app target, and on the **app** target a `PBXCopyFilesBuildPhase` named "Embed Foundation Extensions" (`dstSubfolderSpec = 13`, `ATTRIBUTES = (RemoveHeadersOnCopy,)`) that copies the `.appex`. Do **not** add the target to the `Podfile`.

- [ ] **Step 4: Verify pods + Simulator build compile the new target**

Run:
```bash
cd ios && pod install && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
```
Expected: `** BUILD SUCCEEDED **`, and `TwakeDriveShareExt.appex` present under `build/Build/Products/Release-iphonesimulator/TwakeDrive.app/PlugIns/`.

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveShareExt ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "feat(ios): add the TwakeDriveShareExt app-extension target (hand-ported, no prebuild)"
```

---

### Task 4: Port expo-share-intent's iOS Share Extension + wire its pod

**Files:**
- Modify: `ios/TwakeDriveShareExt/ShareViewController.swift` (+ any template files it needs), `ios/TwakeDriveShareExt/Info.plist`
- Modify: `ios/Podfile`

**Interfaces:**
- Consumes: the `TwakeDriveShareExt` target from Task 3, the App Group + keychain entitlements.
- Produces: the extension writes the shared item into `group.com.linagora.twakedrive` and reopens the app via `twakedrive://`, which the already-wired `useShareIntent()` in `src/share/useIncomingShare.ts` surfaces. No JS change.

- [ ] **Step 1: Copy expo-share-intent's iOS extension template into the target**

Inspect `node_modules/expo-share-intent/plugin/build/ios/` (`writeIosShareExtensionFiles.js` + template sources). Copy its `ShareViewController.swift` (+ `ShareExtension-Info.plist` keys, `MainInterface.storyboard` / `PrivacyInfo` if present) into `ios/TwakeDriveShareExt/`, adapting the App Group id to `group.com.linagora.twakedrive` and the host-app URL scheme to `twakedrive`. Ensure `Info.plist` `NSExtension` has `NSExtensionPointIdentifier = com.apple.share-services` and an `NSExtensionActivationRule` accepting files/URLs/text (copy the template's rule).

- [ ] **Step 2: Ensure the expo-share-intent pod links into the MAIN target**

Confirm `use_expo_modules!`/autolinking pulls `ExpoShareIntent` into the `TwakeDrive` target. If it is absent from `ios/Podfile.lock` after `pod install`, add its pod explicitly inside `target 'TwakeDrive'` per the package's README. The extension target gets **no** pods.

- [ ] **Step 3: Build (Simulator) to verify it compiles + links**

Run: `cd ios && pod install && grep -q ExpoShareIntent Podfile.lock && echo "pod linked" && xcodebuild -workspace TwakeDrive.xcworkspace -scheme TwakeDrive -configuration Release -sdk iphonesimulator -derivedDataPath build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build`
Expected: `pod linked` then `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Confirm the JS hook is untouched and still green**

Run: `npx jest src/share && npm run typecheck`
Expected: PASS — `useIncomingShare`/`PendingShareProvider` tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add ios/TwakeDriveShareExt ios/Podfile ios/Podfile.lock
git commit -m "feat(ios): implement the Share Extension via expo-share-intent's template"
```

---

### Task 5: Wire the ShareExt provisioning profile into the release Fastfile

**Files:**
- Modify: `ios/fastlane/Fastfile`

**Interfaces:**
- Consumes: the ShareExt App ID + its match profile (user prerequisite). Produces: `gym` signs the app + the embedded `.appex` with manual match profiles.

- [ ] **Step 1: Add the extension profile mapping**

In `ios/fastlane/Fastfile`, in the `gym` `export_options.provisioningProfiles`, add:
```ruby
"com.linagora.twakedrive.ShareExt" => "match AppStore com.linagora.twakedrive.ShareExt"
```
(keep the existing app-id mapping).

- [ ] **Step 2: Ruby syntax check**

Run: `ruby -c ios/fastlane/Fastfile`
Expected: `Syntax OK`.

- [ ] **Step 3: Commit**

```bash
git add ios/fastlane/Fastfile
git commit -m "ci(ios): sign the Share Extension profile in gym export options"
```

---

### Task 6: On-device validation (USER-driven functional test)

**Interfaces:** Consumes everything above + the user prerequisites (portal capabilities, `match` seeded for `.ShareExt`).

- [ ] **Step 1: Open the PR + let CI compile**

Push the branch, open the PR to `main`. The unsigned `build-ios.yml` (main) + PR CI compile the new target (catches build breakage).

- [ ] **Step 2: Cut a signed build to TestFlight**

After merge, `gh workflow run release-ios.yml --repo mmaudet/twake-drive-mobile --ref main` (or a `vX.Y.Z` tag). Expected: green — the signed IPA now embeds `TwakeDriveShareExt.appex` and uploads to TestFlight.

- [ ] **Step 3: Device test (user)**

Install from TestFlight on a device. From Files/Photos/Safari, tap Share → **Twake Drive**. Expected: the app opens on the `/import` screen with the shared file, pick a Drive folder, upload succeeds.

- [ ] **Step 4: Mark Lot A+B done**

Update tasks #20/#21 complete; note Lot C (File Provider) is the next spec.

---

## Self-Review

- **Spec coverage:** A1 portal → Prerequisites; A2 entitlements → Task 2; A3 tokenStorage → Task 1; A4 target injection → Task 3; A5 signing → Task 5 + Prereq match; B1–B3 share ext → Task 4; B4 flow → Task 4 step 4 + Task 6. All spec sections covered.
- **No placeholders:** every step has a command or code block; the pbxproj task references the offline-generated model rather than a fabricated diff (honest given the mechanism).
- **Consistency:** `com.linagora.twakedrive.ShareExt`, `group.com.linagora.twakedrive`, `com.linagora.twakedrive.shared`, key `twake-drive-session`, service `"app"` — used identically in Tasks 1–5.
- **Known verification-only tasks:** Tasks 2–5 are build/lint-verified (native iOS isn't unit-testable); Task 1 is jest-TDD; Task 6 is device-functional. This is intentional and flagged.
