# iOS Extensions — Foundation + Share Extension (Lot A+B) — Design

**Goal:** Bring the "Share to Drive" feature to iOS by adding a native **Share Extension**, on top of a reusable **extensions foundation** (App Group + shared-keychain auth + a repeatable way to inject `.appex` targets into the committed Xcode project). This unblocks — and is the prerequisite for — the iOS **File Provider** extension, which is a separate later spec (Lot C).

**Architecture (one line):** the app writes the cozy session into a **shared Keychain access group** that native Swift extensions read directly (no RN bridge); an **App Group** carries non-secret file payloads; extension targets are **hand-added to the committed `ios/` project** (never via `expo prebuild`).

**Tech stack:** Expo bare RN (SDK 54, New Arch ON, iOS 16 floor), Swift extensions (no CocoaPods/RN inside them), `expo-secure-store` (already supports keychain access groups), `expo-share-intent` (already a dependency, JS hook already wired), fastlane match signing.

## Global Constraints (bind every task)

- **NEVER run `expo prebuild`.** `ios/` is committed and hand-maintained. All native changes are hand-edited and committed. `@bacons/apple-targets` and Expo config plugins may be used **only offline in a throwaway clone** to generate correct boilerplate to copy in — never in the build pipeline.
- Bundle IDs: app `com.linagora.twakedrive`; share extension `com.linagora.twakedrive.ShareExt`; file provider (Lot C) `com.linagora.twakedrive.FileProvider`. Apple team `KUT463DS29`.
- App Group: `group.com.linagora.twakedrive` (files only). Keychain access group: `$(AppIdentifierPrefix)com.linagora.twakedrive.shared` (token only). These are **different namespaces** — both are needed.
- Extensions contain **no CocoaPods / no React Native runtime**. They are pure Swift. They are **not** added to the `Podfile`.
- The signed release build uses fastlane **match** with **manual** signing; adding an extension means match must have a profile for its App ID and `gym`'s `export_options.provisioningProfiles` must map it.
- Division of labor: **Claude** writes all Swift/config/pbxproj/JS on a feature branch → PR. **User** performs the Apple Developer **portal** capability registrations and **on-device** testing (extensions do not run meaningfully on the Simulator).

## Scope

- **In scope (this spec):** Lot A (foundation) + Lot B (Share Extension), delivering working "share a file from any iOS app → Twake Drive".
- **Out of scope (Lot C, separate spec):** the File Provider extension's target + Swift logic (`NSFileProviderReplicatedExtension`, Swift port of `CozyStackApi`/`SessionStore`, `NSFileProviderDomain` registration). The foundation here (App Group, shared keychain, injection mechanism, portal App ID) is designed so Lot C reuses it directly.

---

## Lot A — Foundation

### A1. Apple Developer portal (USER) — capabilities & App IDs

Under team `KUT463DS29`, register/enable:
- **App Group** `group.com.linagora.twakedrive` (Identifiers → App Groups).
- Three **App IDs** with **App Groups** + **Keychain Sharing** capabilities enabled, each joined to the App Group:
  - `com.linagora.twakedrive` (exists) — add App Groups + Keychain Sharing.
  - `com.linagora.twakedrive.ShareExt` (new).
  - `com.linagora.twakedrive.FileProvider` (new, forward-looking for Lot C).

Success = the three App IDs list App Groups + Keychain Sharing as enabled, all bound to `group.com.linagora.twakedrive`.

### A2. Entitlements (CLAUDE)

`ios/TwakeDrive/TwakeDrive.entitlements` (currently empty `<dict/>`) gains:
- `com.apple.security.application-groups` → `[group.com.linagora.twakedrive]`
- `keychain-access-groups` → `[$(AppIdentifierPrefix)com.linagora.twakedrive.shared]`

The Share Extension target gets its own `.entitlements` with the same two keys (created with the target in A4).

### A3. Shared-keychain session write (CLAUDE)

`src/auth/tokenStorage.ts` `saveSession`/`getSession`/`clearSession` currently call `SecureStore` with only the key `twake-drive-session`. Change all three to pass:
```ts
{ accessGroup: 'com.linagora.twakedrive.shared', keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }
```
- `accessGroup` writes the item into the shared group (native `kSecAttrAccessGroup`; the `$(AppIdentifierPrefix)` team prefix is applied automatically by the system — pass the bare group string).
- `AFTER_FIRST_UNLOCK` is required so the (later) File Provider can read the token while the device is locked; the default `WHEN_UNLOCKED` would return nothing when locked.

**Keychain contract the Swift extensions must match** (verified against `expo-secure-store` `SecureStoreModule.swift`): `kSecClass = kSecClassGenericPassword`, `kSecAttrService = "app"` (the module's default, since no `keychainService` is passed), `kSecAttrAccount = kSecAttrGeneric = Data("twake-drive-session".utf8)` (raw UTF-8, not hashed), `kSecAttrAccessGroup = "<team>.com.linagora.twakedrive.shared"`. This contract is documented here so Lot B/C read the exact same item.

**Migration:** items previously written without `accessGroup` live in the default group and are invisible to extensions. `saveSession` runs on every login/refresh, so the token re-lands in the shared group on the next auth cycle; the Share Extension only needs the token opportunistically, so no forced re-save is required for Lot B (revisit for Lot C).

### A4. Inject the Share Extension target into the committed pbxproj (CLAUDE)

Hand-edit `ios/TwakeDrive.xcodeproj/project.pbxproj`, de-risked by generating a **correct model offline**: in a throwaway clone, use `@bacons/apple-targets` (or a scoped `expo prebuild`) to emit a valid Share Extension target + `NSExtension` Info.plist + entitlements, then port those objects/files into the committed project. The committed project must gain:
- A new `PBXNativeTarget` `TwakeDriveShareExt` (productType `com.apple.product-type.app-extension`), bundle id `com.linagora.twakedrive.ShareExt`, deployment target 16.0, team `KUT463DS29`, its own `.entitlements` and `Info.plist`.
- Its Debug/Release `XCBuildConfiguration` + `XCConfigurationList`, and `Sources`/`Frameworks`/`Resources` build phases.
- The product `.appex` `PBXFileReference` + a `PBXTargetDependency`/`PBXContainerItemProxy` from the app target, and on the **app** target an **Embed Foundation Extensions** `PBXCopyFilesBuildPhase` (`dstSubfolderSpec = 13`).
- **Not** added to the `Podfile`; the extension links no RN/Expo pods.

Success = `xcodebuild`/`pod install` still succeed and the app scheme builds + embeds the `.appex` (verified by the unsigned Simulator CI build compiling the new target).

### A5. Signing wiring for the new App ID (CLAUDE + USER)

- **(User)** seed match for the share extension id: `fastlane match appstore --git_url git@github.com:mmaudet/twake-certs.git --app_identifier com.linagora.twakedrive.ShareExt --readonly false` (reuses `N74WH43FDM`, adds the profile to `twake-certs`).
- **(Claude)** `ios/fastlane/Fastfile` `gym` `export_options.provisioningProfiles` gains `"com.linagora.twakedrive.ShareExt" => "match AppStore com.linagora.twakedrive.ShareExt"`.

---

## Lot B — Share Extension

### B1–B3. Reuse expo-share-intent's iOS extension (CLAUDE)

`expo-share-intent@5.1.1` is installed and its JS hook `useShareIntent()` is **already** consumed by `src/share/useIncomingShare.ts`, but its iOS native side has never been built (config plugin needs prebuild; the pod is absent from `Podfile.lock`). Rather than a bespoke extension (which would force rewriting the JS hook), **port its iOS pieces by hand**:
- Copy its Share Extension Swift templates + `NSExtension` Info.plist (with `NSExtensionActivationRule` covering files/URLs/text) from `node_modules/expo-share-intent/plugin/build/ios/` into the `TwakeDriveShareExt` target created in A4.
- Add the `expo-share-intent` pod to the **main** app target (its runtime module) so `useShareIntent()` resolves natively. The extension itself stays pod-free.
- Extension entitlements carry the App Group (writes the shared item into `group.com.linagora.twakedrive`) and, if the template requires it, the keychain group.

### B4. Flow validation (no JS change)

End-to-end: OS share sheet → `TwakeDriveShareExt` copies the item into the App Group container and reopens the app via `twakedrive://` → the existing `useIncomingShare()` → `PendingShareProvider` → `/import` folder-picker + `uploadSharedFile` path (all already cross-platform) takes over. **No JS changes beyond A3** are expected; `useIncomingShare.ts` should surface the share unchanged.

Success = on a device, sharing a file from Files/Photos/Safari to "Twake Drive" opens the app's import screen and uploads to the chosen Drive folder.

---

## Testing

- **Compile-level:** the unsigned Simulator CI (`build-ios.yml`) compiles the new target on every `main` push — catches pbxproj/build breakage.
- **Functional:** signed build → TestFlight → **real device** (extensions don't run meaningfully on Simulator). The user installs from TestFlight and exercises the share sheet.
- No automated UI test for the extension in this lot (device-only feature); JS-side `useIncomingShare`/`PendingShareProvider` keep their existing jest coverage.

## Risks

1. **Accidental `expo prebuild`** wipes the hand-added target — the no-prebuild rule is the mitigation; targets live only in the committed pbxproj.
2. **Signing/capabilities:** the two App IDs (`.ShareExt` now, `.FileProvider` later) must have App Group + Keychain Sharing registered, and match must hold their profiles, or `gym` fails.
3. **Keychain query mismatch:** the extension must match `service="app"`, `account=UTF8("twake-drive-session")`, class genericpassword, and the exact access group — otherwise reads silently return nothing.
4. **pbxproj surgery fragility:** mitigated by porting an @bacons-generated model rather than hand-synthesizing; verified by the Simulator CI build.
5. **expo-share-intent pod integration** on the main target (New Arch) — must appear in `Podfile.lock` and not conflict with the embedded dynamic frameworks.

## Out of scope (Lot C — separate spec)

File Provider extension target + Swift `NSFileProviderReplicatedExtension`, Swift ports of `CozyStackApi`/`SessionStore` (URLSession + shared keychain), `NSFileProviderDomain` registration on login, refresh-token rotation handling across processes. Reuses this lot's App Group, shared keychain contract, injection mechanism, and (already-registered) `.FileProvider` App ID.
