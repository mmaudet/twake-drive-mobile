# iOS File Provider (Lot C) — Design

**Goal:** Ship a native iOS **File Provider** extension (`NSFileProviderReplicatedExtension`) that exposes the user's Twake Drive as a browsable, **read-write** location in the iOS Files app, at full parity with the Android `TwakeDocumentsProvider`.

**Architecture:** A new committed-pbxproj app-extension target reads the cozy session from the shared iOS Keychain (built in Lot A) and talks to cozy-stack's `io.cozy.files` API over URLSession. All branching logic — session decode, token refresh, HTTP client, item mapping, conflict resolution — lives in **pure** files with no `NSFileProvider` dependency and is unit-tested via an injected XCTest target. The thin NSFileProvider "glue" is device-validated in the Files app. Reuses the Lot A/B foundation verbatim: shared Keychain access group, App Group, `xcode`-lib target injection (no prebuild), and per-target `match` signing.

**Tech stack:** Swift 5.0, `NSFileProviderReplicatedExtension` (iOS 16+), `URLSession` async/await, `XCTest`; the `xcode` npm lib for pbxproj injection; fastlane `match` for signing. Reference port: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/` (`TwakeDocumentsProvider`, `CozyStackApi`, `SessionStore`, `DocumentMapper`, `Models`, `DocumentCache`).

---

## Global Constraints

- **Never `expo prebuild`.** `ios/` is hand-maintained. The extension target **and** the XCTest target are injected into the committed `ios/TwakeDrive.xcodeproj/project.pbxproj` by Node scripts (clone of `scripts/ios-add-share-extension.cjs`).
- **iOS 16.0** deployment floor (`NSFileProviderReplicatedExtension` requires 16+).
- Bundle id **`com.linagora.twakedrive.FileProvider`** (App ID already reserved: `docs/ci-cd-signed-release.md:30`).
- App Group **`group.com.linagora.twakedrive`**; shared Keychain access group **`com.linagora.twakedrive.shared`**.
- Session item (verified against `node_modules/expo-secure-store@15.0.8/ios/SecureStoreModule.swift:172-189`): Keychain `kSecClassGenericPassword`; `kSecAttrService = "app:no-auth"` — expo appends `:no-auth` when `requireAuthentication` is false (our case, since `tokenStorage.ts` does not set it), so **reads must try `app:no-auth` then `app:auth`** (expo's own getItem fallback, `:74-79`), and **write-back targets `app:no-auth`** so expo's getItem sees it; `kSecAttrAccount = kSecAttrGeneric = Data("twake-drive-session".utf8)` (raw UTF-8, **not** hashed); `kSecAttrAccessGroup = "com.linagora.twakedrive.shared"` (the **bare** value `tokenStorage.ts` passes — the same `$(AppIdentifierPrefix)com.linagora.twakedrive.shared` entitlement resolves it identically in app + extension); `kSecAttrAccessible = AfterFirstUnlock`. Value = the nested `Session` JSON. **⚠️ Cross-process shared-keychain reads have never been exercised** (the Share Extension used App Group UserDefaults, not the keychain) → Lot C device-validates "the extension can read the session" as its **first** device checkpoint; if the bare access group turns out not to share, the fallback is to fix `tokenStorage.ts` to the team-prefixed group.
- Auth: `Authorization: Bearer {accessToken}` on every call; reads also send `Accept: application/vnd.api+json`.
- Apple team **`KUT463DS29`**; signing via `match` (repo `twake-certs`), **per-target manual**.
- Push to `fork`; commit trailer + PR footer as usual. Code/commits in English.

---

## Session shape (decode target)

The Keychain item under `twake-drive-session` is the JS `Session` (`src/auth/types.ts:31-35`), stored as the **full nested** object (NOT the Android-flattened `{uri,clientId,...}`):

```
Session      { uri: String, oauthOptions: OAuthOptions, token: OAuthToken }
OAuthOptions { clientID, clientSecret, clientName, softwareID, redirectURI,
               clientKind, clientURI, scopes: [String], registrationAccessToken? }
OAuthToken   { accessToken, refreshToken, tokenType, scope }
```

Swift `Codable` structs mirror these with the **exact camelCase keys as written** (`oauthOptions`, `clientID`, `clientSecret`, `accessToken`, `refreshToken`). For cozy calls: base URL = `session.uri`; bearer = `session.token.accessToken`; refresh via `session.oauthOptions.clientID`/`clientSecret` + `session.token.refreshToken`.

---

## Components

### Pure logic — unit-tested (no `NSFileProvider` import)

- **`Session.swift`** — `Codable` structs above. Sole responsibility: decode/encode the shared-Keychain JSON. *Test:* round-trip a fixture JSON captured from a real session.
- **`KeychainSessionStore.swift`** — `protocol SessionStoring { func load() throws -> Session?; func save(_:) throws }` + a `KeychainSessionStore` implementing it against the shared access group. Reads and (for token write-back) updates the session item. *Test:* seam the raw keychain behind a `KeychainAccess` protocol; unit-test load/save/decode against an in-memory fake (real keychain is device-validated).
- **`TokenProvider.swift`** — `actor TokenProvider`. `validAccessToken() async throws -> String` returns the cached token or refreshes; `forceRefresh() async throws -> String` for a 401. Refresh = **single-flight + write-back** (see Token Refresh below). Ports `SessionStore.refreshAccessToken` (`SessionStore.kt:49-79`). *Test:* inject a mock `HTTPClient` + fake `SessionStoring`; assert single-flight (one HTTP call under concurrency), 401→refresh→retry, and that a rotated refresh token is written back.
- **`CozyFilesApi.swift`** — `struct CozyFilesApi` over `URLSession`, injected `TokenProvider` + `HTTPClient`. Methods (each ports the Android `CozyStackApi` call of the same name, see the parity table): `get`, `list(dirId:page:)`, `download(id:to:)`, `upload(id:from:mime:)`, `createFile`, `createDirectory`, `rename`, `move`, `trash`, `statByPath`, `thumbnail`. Adds the bearer header and retries once on 401 via `TokenProvider.forceRefresh()`. *Test:* `URLProtocol` mock returning canned cozy JSON per endpoint; assert method+path+body+headers and response parsing.
- **`CozyFile.swift` + `ItemMapper.swift`** — `CozyFile.fromAttributes` parses cozy `data.attributes` (`type,name,dir_id,size,mime,class,updated_at,path`) → a value type; `ItemMapper` maps it to a `FileProviderItem: NSFileProviderItem` (identifier = cozy id, parentItemIdentifier, filename, contentType via UTType, documentSize, contentModificationDate, capabilities, isTrashed=false). Hides `HIDDEN_IDS` (trash + shared-drives) like `DocumentMapper.kt:8-11`. `FileProviderItem` is a plain struct (`NSFileProviderItem` is a protocol), so it's pure/testable. *Test:* map fixtures for a folder, a file, an image (thumbnail-capable), and a hidden dir.
- **`ConflictResolver.swift`** — the `move` HTTP-409 path: `statByPath(destPath)` → if a conflicting item exists, `trash` it → retry the move (ports `CozyStackApi.move` `:221-234`). *Test:* drive it with a scripted `CozyFilesApi` fake through the 409→resolve→retry branches.

### NSFileProvider glue — device-validated

- **`FileProviderExtension.swift`** — `NSFileProviderReplicatedExtension`. `item(for:request:)` → `CozyFilesApi.get` + `ItemMapper`; `fetchContents(for:request:)` → `download` to a temp URL the system ingests; `createItem(basedOn:fields:contents:)` → `createDirectory` (folder) or `createFile`+`upload` (file); `modifyItem(...)` → `rename`/`move` (+`ConflictResolver`) and/or content `upload` when `.contents` changed; `deleteItem(...)` → `trash`; `enumerator(for:request:)` → `FileProviderEnumerator`. Maps thrown errors to `NSFileProviderError` (see Error Handling). Signals the enumerator after each successful mutation via `NSFileProviderManager`.
- **`FileProviderEnumerator.swift`** — `NSFileProviderEnumerator` per container. `enumerateItems(for:startingAt:)` → `CozyFilesApi.list` paged, turning cozy `links.next` into an `NSFileProviderPage` (mirrors `queryChildDocuments`/`links.next` `CozyStackApi.kt:108-120`). `enumerateChanges(for:from:)` → MVP: re-enumerate + bump the sync anchor (external changes surface on refresh; our own mutations are pushed via `signalEnumerator`). `currentSyncAnchor` returned opaque.

### RN native module — domain lifecycle

- **`FileProviderDomainModule`** (native module + `src/native/fileProviderBridge.ts`) — `register()` adds an `NSFileProviderDomain` (single domain, display name "Twake Drive"); `unregister()` removes it. Called from the auth lifecycle: **register when a session is saved** (login), **unregister on logout** (alongside `clearSession`). This makes the location appear/disappear in Files. iOS-only guard (like `twakeAuthBridge.ts:19`).

---

## Operations → cozy-stack (full parity table)

Base URL = `session.uri`. Header `Authorization: Bearer {accessToken}` on all; `Accept: application/vnd.api+json` on reads.

| NSFileProvider surface | CozyFilesApi | cozy-stack call |
|---|---|---|
| `item(for:)` | `get(id)` | `GET /files/{id}` → `data.attributes` |
| `enumerateItems` | `list(dirId,page)` | `GET /files/{dirId}` → `included[]`, follow `links.next` |
| `fetchContents` | `download(id,to)` | `GET /files/download/{id}` (streamed) |
| `createItem` (file) | `createFile(parent,name,mime)` + `upload` | `POST /files/{parent}?Type=file&Name={name}` then `PUT /files/{id}` |
| `createItem` (folder) | `createDirectory(parent,name)` | `POST /files/{parent}?Type=directory&Name={name}` |
| `modifyItem` (content) | `upload(id,from,mime)` | `PUT /files/{id}` (body = bytes) |
| `modifyItem` (rename) | `rename(id,name)` | `PATCH /files/{id}` attrs `{name}` |
| `modifyItem` (reparent) | `move(id,parent)` + `ConflictResolver` | `PATCH /files/{id}` attrs `{dir_id}`; 409 → statByPath → trash → retry |
| `deleteItem` | `trash(id)` | `DELETE /files/{id}` (soft-delete to trash) |
| `fetchThumbnails` | `thumbnail(id,to)` | `GET /files/{id}/thumbnails/medium` (only when `class=="image"`) |
| conflict stat | `statByPath(path)` | `GET /files/metadata?Path={path}` |
| token refresh | — | `POST {uri}/auth/access_token` (grant_type=refresh_token) |

---

## Token Refresh (approach A — robust)

Both the app and the File Provider mint access tokens from the **same** shared refresh token, and the File Provider frequently runs while the app is dead. To stay correct even if cozy-stack **rotates** refresh tokens:

1. **Single-flight + cross-process lock.** Before refreshing, `TokenProvider` acquires a cross-process lock — `NSFileCoordinator` coordinated write on a sentinel file in the App Group container (`group.com.linagora.twakedrive`). Within the actor this also serializes intra-process callers.
2. **Re-read under the lock.** After acquiring the lock, reload the `Session` from the Keychain. If another process already refreshed (access token differs / not expired), use it and skip the network call. (Mirrors the Android `@Synchronized` re-check, `SessionStore.kt:52-53`.)
3. **Refresh.** `POST {uri}/auth/access_token` form `grant_type=refresh_token, client_id, client_secret, refresh_token`.
4. **Write-back.** Persist the updated `Session` (new `accessToken`, and the rotated `refreshToken` if the response carries one) to the shared Keychain via `KeychainSessionStore.save`, so app + extension converge.

**Known limitation (MVP, documented):** a *running* RN app caches the token in memory (cozy-client) and does not use the same file-coordinated lock, so a token the File Provider rotates is only observed by the app on its next cold read. Keychain writes are atomic per item (no corruption); the residual is a rare lost-update if app and extension refresh in the exact same instant. Acceptable for the MVP; a fully-coordinated shared refresher is a follow-up.

---

## Error Handling

`CozyFilesApi` throws typed errors; `FileProviderExtension` maps them to `NSFileProviderError`:

- Refresh fails / 401 after retry → `.notAuthenticated` (Files shows "sign in"; the app re-auth restores it).
- 404 / trashed → `.noSuchItem`.
- 409 on create/move not resolvable → `.filenameCollision`.
- Offline / DNS / timeout → `.serverUnreachable`.
- 507 / quota → `.insufficientQuota`.
- Anything else → `.serverUnreachable` with the underlying error attached for logs.

---

## Enumeration & identifiers

- `NSFileProviderItemIdentifier` = the cozy file id string. `.rootContainer` ⇄ `io.cozy.files.root-dir` (`DocumentMapper.ROOT_DOC_ID`).
- Hidden: trash dir + shared-drives dir (`HIDDEN_IDS`) are filtered from enumeration.
- Paging: cozy `links.next` ⇄ `NSFileProviderPage` (opaque); cap mirrors Android (50 pages / 500 items safety cap).
- Change tracking: on-demand enumeration + `signalEnumerator` after our own mutations (parity with Android `notifyChange`). Cross-device delta sync is out of scope (see below).

---

## Testing

- **XCTest target `TwakeDriveFileProviderExtTests`** injected into the committed pbxproj (a second injection script). It is a **logic-only** unit-test bundle (`com.apple.product-type.bundle.unit-test`, **no `TEST_HOST`**): the pure `.swift` files (`Session`, `KeychainSessionStore`, `TokenProvider`, `CozyFilesApi`, `CozyFile`/`ItemMapper`, `ConflictResolver`) are shared by **target membership** — compiled into both the extension target and the test target — so tests run on the Simulator without launching the extension. The glue files (`FileProviderExtension`, `FileProviderEnumerator`) are NOT in the test target.
- **Unit-tested (pure):** `Session` decode round-trip; `ItemMapper` (folder/file/image/hidden fixtures); `CozyFilesApi` (one `URLProtocol`-mocked test per endpoint asserting method/path/body/headers + parsing); `TokenProvider` (single-flight under concurrency, 401→refresh→retry, rotated-token write-back); `ConflictResolver` (409 → statByPath → trash → retry).
- **Device-validated (glue):** browse the Drive tree in Files; download (open a file); upload (save a file into Twake Drive from another app); create folder; rename; move; delete → trash. Uses the TestFlight build (needs a **real iOS device**).
- CI runs the Swift unit tests as a new job (`xcodebuild test` on the logic target) alongside the existing `build-ios` compile; jest suite unaffected.

---

## CI / signing / user prerequisites

- **`ios/fastlane/Fastfile`**: add `"#{APP_IDENTIFIER}.FileProvider"` to the `match` `app_identifier` array and to `gym` `export_options.provisioningProfiles`.
- **`scripts/ios-set-extension-signing.cjs`**: add `TwakeDriveFileProviderExt: 'match AppStore com.linagora.twakedrive.FileProvider'` to `TARGETS`.
- **User portal prereqs** (mirror the ShareExt): on App ID `com.linagora.twakedrive.FileProvider`, enable **App Groups** (Edit → assign "Twake Drive" → Continue → **Save**, confirm it persists on a fresh reload) + **Keychain Sharing**, then `fastlane match appstore --git_url git@github.com:mmaudet/twake-certs.git --app_identifier com.linagora.twakedrive.FileProvider --force`. **Verify the profile carries the App Group** with `security cms -D -i <profile> | plutil -extract Entitlements xml1 -o - - | grep group.com.linagora.twakedrive` — **never** `plutil -extract "Entitlements.com.apple.security.application-groups"` (dots in the key are read as keypath separators → false empty; this cost an evening on Lot A+B).

---

## Out of scope (this lot)

- Cross-device **delta sync** / `NSFileProviderChangeObserver` beyond on-demand re-enumeration + own-mutation signalling (parity with Android; a real changes-feed is a later enhancement).
- Offline **pinning** / "keep downloaded" and the RN-pinned `filesFn/offline/{id}` fast-path Android has (`DocumentCache.kt`) — the replicated extension manages its own materialization cache.
- Shared drives / trash **browsing** (both hidden, as on Android).
- A fully cross-process-coordinated token refresher shared with the running RN app (MVP uses write-back + best-effort; see Token Refresh limitation).

---

## Phasing (for the implementation plan)

1. Inject the extension target + skeleton `FileProviderExtension` + Info.plist/entitlements → compiles in CI (empty provider).
2. `Session` + `KeychainSessionStore` + `TokenProvider` + `CozyFilesApi` + `ItemMapper` + `ConflictResolver` (pure, TDD with the XCTest target).
3. **Read path:** `enumerator` + `item(for:)` + `fetchContents` → device: browse + download works.
4. **Write path:** `createItem` / `modifyItem` / `deleteItem` (+ conflict) → device: full read-write parity.
5. `FileProviderDomainModule` register/unregister at login/logout.
6. Signing (Fastfile + script) + signed release + device validation of every operation.
