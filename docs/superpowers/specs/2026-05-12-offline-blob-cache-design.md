# Offline blob cache — "Keep offline" for files and folders

> **Status:** spec approved. Next step: `superpowers:writing-plans` to produce the implementation plan.

## 1. Context and goal

The current offline cache (merged PRs #4, #5, #6) covers file **metadata** via PouchDB + cozy-pouch-link: users can browse folders offline, see file names, sizes, dates, and cached thumbnails. But the **blobs themselves** (file contents) aren't pre-downloaded — they're fetched on open into a temporary cache (`cacheDirectory/twake-drive/...`) that iOS/Android can purge at any time.

Consequence: offline, users see files but can't open them (except for ones opened recently before the OS purged the temp cache).

**Goal:** let the user explicitly mark files / folders as "Keep offline". Those items are downloaded in the background to a persistent location, reused on open for instant access, and automatically re-synced when the server has a newer version.

**Framing decisions:**
- No hard cap on cache size (user: "we don't have a disk limit").
- Auto re-sync on reconnect via existing pouch sync events (reactive, no dedicated polling).
- Background downloads = v2 (foreground only for v1).
- No Range/resume support — restart from zero on interruption (cozy-stack support not confirmed).
- No offline write queue (sharing/rename/delete actions stay disabled offline — already the case).

## 2. High-level architecture

```
                  ┌─────────────────────────────────┐
                  │     UI (FileRow, FolderRow,     │
                  │   FileMetadataSheet, Settings)  │
                  └────────────┬────────────────────┘
                               │ pin/unpin actions
                               │ + useOfflineState(fileId)
                               ▼
                  ┌─────────────────────────────────┐
                  │      OfflineFilesStore           │
                  │  - MMKV index (state per file)   │
                  │  - emits state changes           │
                  └──┬────────────┬──────────────────┘
                     │            │
            enqueue  │            │ observed by
                     ▼            │
        ┌──────────────────┐      │
        │    Downloader    │      │
        │  - max 4 conc.   │      │
        │  - pause/cancel  │      │
        │  - backoff retry │      │
        └────────┬─────────┘      │
                 │                │
                 │  writes blobs  │
                 ▼                │
        ┌──────────────────┐      │
        │ FileSystemRepo   │      │
        │ documentDirectory│      │
        │   /offline/{id}  │      │
        └──────────────────┘      │
                                  │
              subscribes to       │
              PouchDB changes     │
              feed                │
                     ▲            │
                     │            │
        ┌──────────────────┐      │
        │   pinReactor     │──────┘
        │ - md5sum change  │
        │ - trash detect   │
        │ - folder live    │
        └──────────────────┘
                ▲
                │ db.changes({ since, live })
                │
        ┌──────────────────┐
        │  cozy-pouch-link │  (existing)
        │  + cozy-client   │
        └──────────────────┘
```

### Modules to create (under `src/offline/`)

- `OfflineFilesStore.ts` — facade on top of MMKV. API: `pin(fileId, meta)`, `pinFolder(dirId)`, `unpin(fileId)`, `unpinFolder(dirId)`, `purge(fileId)`, `getState(fileId)`, `isPinnedAndDownloaded(fileId)`, plus an observable for state changes (used by `useOfflineState`).
- `Downloader.ts` — FIFO queue, max 4 in-flight, map of active `DownloadResumable` instances (from `expo-file-system` legacy), backoff (2s, 8s, 30s), respects the WiFi-only toggle, exposes a progress observable. API: `enqueue(fileId, sizeHint?)`, `cancel(fileId)`, `pauseAll()`, `resumeAll()`.
- `FileSystemRepo.ts` — abstraction on top of `expo-file-system` (legacy). Provides `localPath(fileId)`, `exists(fileId)`, `delete(fileId)`, `totalBytes()` (sum across the offline dir). Handles `NSURLIsExcludedFromBackupKey` on iOS for the `offline/` directory and Android scoped storage equivalents.
- `pinReactor.ts` — singleton initialized at drive layout mount. Subscribes to the PouchDB `io.cozy.files` database changes feed via `db.changes({ since: 'now', live: true, include_docs: true })` and reacts to: (a) `md5sum` change on a pinned file → enqueue re-download, (b) `trashed: true` or `dir_id` move into trash on a pinned file → purge, (c) new doc with `dir_id` matching a pinned folder → pin + enqueue.
- `OnlineMonitor.ts` — plain (non-hook) observable that wraps NetInfo + the reachability probe. Singleton with `.subscribe(listener)`, `.getCurrent()`, `.getNetType()`. **The existing `useIsOnline` hook is refactored to delegate to this monitor** so both React components (via the hook) and non-React modules (like the Downloader) read the same source of truth.
- `useOfflineState.ts` — React hook reading `OfflineFilesStore.getState(fileId)` and re-rendering on change.
- `useOfflineActions.ts` — hook exposing `pin`, `pinFolder`, `unpin`, `unpinFolder` with confirmation modal handling for large folders.
- `offlineSettings.ts` — separate MMKV instance `offline-settings`: `wifiOnly: boolean`.
- `OfflineStorageScreen.tsx` — the dedicated Settings view (see section 6).
- `PinnedBadge.tsx` — visual state component (see section 5).

### Existing modules to modify

- `src/files/openFile.ts` — in `openFileNatively`, check `OfflineFilesStore.isPinnedAndDownloaded(file._id)` before falling back to the stack download.
- `src/ui/FileRow.tsx` — add `PinnedBadge` in the left slot and `onTogglePin` in the 3-dot menu.
- `src/ui/FolderRow.tsx` (or equivalent) — same as FileRow with aggregated state.
- `src/ui/FileMetadataSheet.tsx` — add a "Keep offline" toggle at the top of the action list.
- `src/network/useIsOnline.ts` — refactored to subscribe to `OnlineMonitor`. Public API unchanged.
- `app/(drive)/_layout.tsx` — mount `pinReactor` (one-time init at login).
- `app/(drive)/settings/...` — add the Settings entry and route to `OfflineStorageScreen`.

### Tech stack

- **Index:** `react-native-mmkv@4.x` (already installed, Nitro Modules, sync). Dedicated instance `MMKV({ id: 'offline-files' })` for per-file entries, and `MMKV({ id: 'offline-settings' })` for toggles.
- **Blobs:** `expo-file-system` legacy import. Use `createDownloadResumable(uri, localPath, options, progressCallback)` — `downloadAsync` does **not** expose a progress callback. Stored under `documentDirectory/offline/{fileId}` (no extension — mimeType comes from pouch metadata).
- **iOS:** set `NSURLIsExcludedFromBackupKey` on the `offline/` directory so iCloud Backup doesn't ingest the cache. Sandbox + data protection at lock screen apply by default.
- **Android:** `documentDirectory` maps to `Context.getFilesDir()` (scoped storage). Configure `allowBackup=false` in `AndroidManifest.xml` plus a `data_extraction_rules.xml` excluding `files/offline/`.
- **Network:** `OnlineMonitor` wraps NetInfo + reachability probe. The Downloader subscribes to it directly (no React hook involved).

## 3. Data model (MMKV)

### Per-file entry — `offline:file:{fileId}`

```ts
type OfflineFileEntry = {
  fileId: string
  state: 'pending' | 'downloading' | 'downloaded' | 'failed' | 'paused-auth'
  rev: string              // pouch _rev at last sync — kept for diagnostics
  md5sum: string           // io.cozy.files.md5sum — primary signal for "blob changed"
  size: number             // bytes, from pouch metadata
  bytesDownloaded?: number // progress (only while state === 'downloading')
  localPath: string        // documentDirectory/offline/{fileId}
  pinnedAt: number         // ms timestamp
  isDirectPin: boolean     // true if user pinned this file explicitly (vs only via a folder)
  parentFolderPins: string[]  // dir_ids of pinned ancestor folders that include this file (can be empty)
  retryCount?: number      // 0..3
  lastError?: string       // for UI surfacing on 'failed'
}
```

**Why `md5sum` is the change detector**, not `_rev`: a pouch `_rev` bump happens on any metadata write (rename, share permission update, referenced_by change), most of which don't touch the blob. Comparing `md5sum` (which `io.cozy.files` carries and which only changes when the blob is rewritten) avoids gratuitous re-downloads. This matches what `twake-drive-web` does.

### Per-folder entry — `offline:folder:{dirId}`

```ts
type OfflineFolderEntry = {
  dirId: string
  pinnedAt: number
  name: string  // snapshot for Settings display
}
```

**Known limitation (v1):** `name` is a snapshot. If the user renames the folder on the web, the Settings screen shows the stale name until the user unpins/re-pins. Refreshing it would require listening to folder doc changes in the pinReactor (currently only files are observed). Accepted for v1 — fix in v2 if anyone complains.

Files under a pinned folder get an `offline:file:{id}` entry with `parentFolderPins: [dirId]` and `isDirectPin: false`. If a file already has a parent folder pin AND the user pins it directly, `isDirectPin` flips to `true` (both reasons coexist). If a file lives under two separately-pinned ancestor folders, both `dirId`s appear in `parentFolderPins`.

### Settings — `offline-settings` MMKV

```ts
type OfflineSettings = {
  wifiOnly: boolean  // default: false
}
```

Plus a transient diagnostic flag in the same store:
```ts
type OfflineStatus = {
  diskFull: boolean  // set when ENOSPC is hit, cleared on user unpin / "delete all"
}
```

## 4. Data flows

### 4.1 Pin a file (user online)

```
UI tap → useOfflineActions.pin(fileId)
 → OfflineFilesStore.pin(fileId, { rev, md5sum, size, name })
    → MMKV write offline:file:{fileId} { state: 'pending', ... }
    → emit change → useOfflineState re-renders → badge visible
    → Downloader.enqueue(fileId)
 → Downloader pulls from queue (up to max 4 concurrent)
    → MMKV update state: 'downloading', bytesDownloaded: 0
    → const resumable = FileSystem.createDownloadResumable(url, localPath, opts, progressCb)
       → progressCb → MMKV update bytesDownloaded (throttled to ~500ms)
    → on success: MMKV update state: 'downloaded', clear bytesDownloaded
    → on error: retry logic (see section 7)
```

The `DownloadResumable` instance is stored in a `Map<fileId, DownloadResumable>` inside the Downloader so it can be canceled (`.cancelAsync()`) or paused (`.pauseAsync()`) on network loss / unpin. Pause returns a `savable` string which we intentionally **discard** in v1 (no resume — restart from zero on reconnect, matching the v1 scope).

### 4.2 Pin a folder (live follow)

```
UI tap → useOfflineActions.pinFolder(dirId)
 → confirmation modal if folder has > 1000 children
 → OfflineFilesStore.pinFolder(dirId)
    → MMKV write offline:folder:{dirId}
    → query pouch for current children: Q('io.cozy.files').where({ dir_id: dirId })
    → for each file child: OfflineFilesStore.pin(child._id, { addParentFolderPin: dirId })
       (if entry already exists, push dirId into parentFolderPins instead of creating new)
    → for each subfolder: recursive pinFolder
 → returns immediately, downloads run in background via Downloader
```

**N+1 cost note:** the recursive pouch query is one query per nested folder. For a one-time pin action this is acceptable (a folder tree with 10 nested dirs = 10 pouch queries, all hitting local SQLite — milliseconds). If profiling shows it's an issue in deep trees, a future optimization is to use a single `Q('io.cozy.files').where({ path: { $regex: '^/Absolute/Path/' } })` query — but the `path` field is only set on files cached from the stack and isn't part of the pouch find indexes by default, so this is a v2 consideration.

### 4.3 Sync: pouch receives changes (re-download, trash, live-add)

`pinReactor` subscribes to the local PouchDB changes feed for `io.cozy.files` via `db.changes({ since: 'now', live: true, include_docs: true })`. The pouch DB instance is reached via the existing `getPouchLink(client)` helper + its internal manager. **This is the same pattern `twake-drive-web` uses** for offline reactivity — we mirror it rather than relying on `client.on('pouchlink:sync:end')` events (which carry no payload).

```
for each change.doc on the feed:
  case (a) — pinned file, blob changed:
    if offline:file:{doc._id} exists
       AND doc.md5sum !== entry.md5sum:
       → MMKV update { rev: doc._rev, md5sum: doc.md5sum, state: 'pending' }
       → Downloader.enqueue(doc._id)

  case (b) — pinned file, trashed or moved to trash:
    if offline:file:{doc._id} exists
       AND (doc.trashed === true OR doc.dir_id matches trash root):
       → OfflineFilesStore.purge(doc._id)

  case (c) — new file in pinned folder:
    if doc.type === 'file'
       AND doc.dir_id ∈ pinned folder ids
       AND offline:file:{doc._id} does NOT exist:
       → OfflineFilesStore.pin(doc._id, { addParentFolderPin: doc.dir_id })

  case (d) — file moved out of pinned folder:
    if offline:file:{doc._id} exists
       AND doc.dir_id is no longer in parentFolderPins
       AND that parentFolderPin's dirId no longer ancestor of doc.dir_id:
       → remove that dirId from parentFolderPins
       → if parentFolderPins becomes empty AND isDirectPin === false:
          → OfflineFilesStore.purge(doc._id)
```

(Case (d) is the "user moved a file out of a pinned folder on the web" path. Optional polish for v1 — list as nice-to-have in the plan.)

### 4.4 Unpin file / folder

```
unpin(fileId):
  if isDirectPin === true:
    → set isDirectPin = false
  if parentFolderPins.length > 0:
    → keep the entry (still pinned via folder); just reset isDirectPin
    → done
  else:
    → Downloader.cancel(fileId) if in-flight (abort + remove from queue)
    → FileSystemRepo.delete(fileId)
    → MMKV delete offline:file:{fileId}

unpinFolder(dirId):
  → MMKV delete offline:folder:{dirId}
  → for each offline:file:* where parentFolderPins contains dirId:
    → remove dirId from parentFolderPins
    → if parentFolderPins becomes empty AND isDirectPin === false:
       → full purge (Downloader.cancel + FS delete + MMKV delete)
    → else: keep the entry (still pinned via direct pin or another folder)
```

### 4.5 Open a pinned file

```
openFileNatively(file):
  if OfflineFilesStore.isPinnedAndDownloaded(file._id):
    → FileViewer.open(FileSystemRepo.localPath(file._id))
  else if online:
    → existing flow (download to cacheDirectory + open)
  else (offline + not pinned):
    → snackbar "File not available offline"
```

### 4.6 App boot

```
OfflineFilesStore.init() (mounted at login):
 → enumerate all MMKV keys 'offline:file:*'
 → for each entry:
    → if state === 'downloading' → reset to 'pending' (kill recovery)
    → if state === 'downloaded' BUT FileSystemRepo.exists(id) === false:
       → state = 'pending' (iPhone restore / OS cleanup / corruption)
    → if state === 'pending' AND online → Downloader.enqueue(id)
    → if state === 'failed' → leave as-is (manual retry only, see 7.1)
    → if state === 'paused-auth' → reset to 'pending' (re-login on this boot is implied
       by being past the login gate); enqueue only if online (same gate as 'pending')
 → mount pinReactor to start observing the pouch changes feed
```

### 4.7 Network state change

The Downloader subscribes to `OnlineMonitor` + the `wifiOnly` setting + NetInfo `type`:

```
online && (!wifiOnly || netType === 'wifi') → process queue
offline → pauseAll
  (each in-flight resumable.cancelAsync(); state reverts to 'pending' in MMKV)
wifiOnly && netType === 'cellular' → pauseAll
```

When the network comes back, pinReactor naturally sees a backlog of pouch changes flow through (cozy-pouch-link will replicate then push them into the local DB), driving cases (a)/(b)/(c) above. The Downloader resumes its own queue independently.

### 4.8 Pin while offline (rejected)

`useOfflineActions.pin` / `pinFolder` are **disabled while offline**. The 3-dot menu item and the `FileMetadataSheet` toggle have `disabled={!isOnline}` with helper text "Reconnect to enable offline mode".

`unpin` actions remain available offline (purely local — no network required).

## 5. UI affordances

### 5.1 Pin toggle — entry points

**(a) 3-dot menu on a row** (`FileRow` and `FolderRow`)

```tsx
{onTogglePin ? (
  <Menu.Item
    leadingIcon={isPinned ? 'cloud-off-outline' : 'cloud-download-outline'}
    title={t(isPinned ? 'drive.offline.unpin' : 'drive.offline.pin')}
    disabled={!isPinned && !isOnline}
    onPress={() => { setMenuVisible(false); onTogglePin(file) }}
  />
) : null}
```

**(b) `FileMetadataSheet`** — a switch at the top of the action list (above Share / Rename / etc.): "Keep offline". Disabled offline for activation; enabled offline for deactivation (unpin).

### 5.2 PinnedBadge on rows

Rendered in the `left` slot of `<List.Item>`, next to the existing `SharedBadge`. Visual states:

| State | Icon | Color | Row description |
|---|---|---|---|
| `downloaded` | `cloud-check` | `theme.colors.primary` | unchanged (`size · date`) |
| `downloading` | `cloud-download` | `theme.colors.primary` | `formatBytes(received)/formatBytes(total) · 42%` |
| `pending` | `cloud-outline` | `theme.colors.outline` | unchanged |
| `failed` | `cloud-alert` | `theme.colors.error` | unchanged; tap the badge to retry |
| `paused-auth` | `cloud-clock` | `theme.colors.outline` | unchanged |

### 5.3 Folder rows — aggregated state

| State | Icon | Display |
|---|---|---|
| All downloaded | `cloud-check` | normal |
| In progress | `cloud-sync` | "12/45 files" in description |
| Partial errors | `cloud-alert` | "2 failures" in description |

### 5.4 Behavior on `openFile`

- Pinned + downloaded → instant open from local blob
- Pinned + still downloading, online → fall through to existing flow (download temp + open)
- Not pinned + offline → snackbar "File not available offline"
- Not pinned + online → existing flow

### 5.5 Translations (FR/EN)

New i18n keys to add under `i18n/locales/{fr,en}.json`:

```
drive.offline.pin                  "Garder hors-ligne"            / "Keep offline"
drive.offline.unpin                "Retirer du hors-ligne"        / "Remove from offline"
drive.offline.keepOffline          "Garder hors-ligne"            / "Keep offline"   (sheet toggle)
drive.offline.disabledOffline      "Reconnectez-vous pour activer le mode hors-ligne" / "Reconnect to enable offline mode"
drive.offline.downloading          "Téléchargement..."            / "Downloading..."
drive.offline.downloaded           "Disponible hors-ligne"        / "Available offline"
drive.offline.failed               "Échec du téléchargement"      / "Download failed"
drive.offline.notAvailableOffline  "Fichier non disponible hors-ligne" / "File not available offline"
drive.offline.folderPartial        "{count}/{total} fichiers"     / "{count}/{total} files"
drive.offline.folderConfirm        "Ce dossier contient {count} fichiers (~{size}). Continuer ?" / "This folder contains {count} files (~{size}). Continue?"
drive.offline.bigFolderTitle       "Confirmer le téléchargement"  / "Confirm download"
drive.offline.diskFull             "Stockage de l'appareil plein. Supprimez des fichiers pour libérer de l'espace." / "Device storage full. Remove items to free up space."
drive.offline.deleteAllConfirm     "Supprimer {count} fichiers ({size}) ? Cette action est irréversible." / "Remove {count} files ({size})? This cannot be undone."
```

## 6. Settings — "Offline storage" view

**Access:** Settings → "Offline storage" (new item in the existing Settings list).
**Route:** `app/(drive)/settings/offline-storage.tsx` (or equivalent depending on current Settings structure).

### Layout

**Header**
- Total used: `formatBytes(FileSystemRepo.totalBytes())`
- "Delete all" button → confirmation modal "Remove {count} files ({size})? This cannot be undone."

**Toggle section**
- Switch "Download on WiFi only" — persisted to `offline-settings.wifiOnly`. Default `false`.

**Status section** (only visible when active)
- If downloads in progress: "Downloading: {done}/{total} files" + global `<ProgressBar>` + Pause/Resume button
- If errors > 0: "{n} failures" → tap opens detailed view listing failed files with per-item retry
- If `diskFull` flag set: persistent banner with the `drive.offline.diskFull` copy

**"Folders" section**
- List of `offline:folder:*`
- Each item: folder name (snapshot, see section 3 limitation), aggregated size (sum of `offline:file` entries where `parentFolderPins` contains this dirId), state (downloaded/partial/error), "Remove" button
- Sort: `pinnedAt` desc

**"Files" section**
- List of `offline:file:*` where `isDirectPin === true` (files pinned only via a folder don't show separately — they're counted under their parent folder)
- Each item: name, size, state, "Remove" button
- Sort: `pinnedAt` desc

## 7. Error handling

### 7.1 Download failure (network / 5xx / timeout)

Retry with exponential backoff, max 3 attempts per file. Delays: 2s, 8s, 30s. Beyond that → `state: 'failed'` persisted, badge `cloud-alert`, listed in the Offline Storage view.

Manual retry: tap the `cloud-alert` badge or "Retry" button in the failure list (resets `retryCount` to 0 and calls `Downloader.enqueue`).

### 7.2 401 / expired token

The download promise's rejection is inspected; on `unauthorized`, we emit to the existing session manager (same flow as `revokeClient`). The download enters `paused-auth`. No retries until the user re-authenticates. On reconnection → reset state to `pending` + re-enqueue automatically.

### 7.3 404 (file deleted on the server)

Treated like a remote trash: `OfflineFilesStore.purge(fileId)`. No error UI (pouch sync would have done the same thing eventually).

### 7.4 Disk full (ENOSPC)

`createDownloadResumable.downloadAsync()` rejects → catch, stop the queue, set the transient `offline-settings.diskFull` flag. Persistent banner in the Offline Storage view: "Device storage full. Remove items to free up space." Flag reset: triggered by any user action that frees space (`unpin`, `unpinFolder`, "Delete all") — we clear the flag and call `Downloader.resumeAll()`. No auto-retry before user action (avoid a failure loop).

### 7.5 Blob missing on open

If `openFile` sees MMKV `state === 'downloaded'` but `FileSystemRepo.exists(id) === false`: flip to `pending`, enqueue, and fall through to the online flow (temp cache + open). Offline → snackbar "File unavailable, will be re-downloaded on next connection".

### 7.6 MMKV corruption

On parse fail of an entry → delete the entry and log. No app crash. (Very rare with MMKV in practice.)

### 7.7 App killed mid-download

At boot, entries in state `downloading` reset to `pending` → re-enqueue. No Range/resume attempt — restart from zero (decision documented in section 1).

### 7.8 Giant folder pin

If folder has > 1000 files → confirmation dialog with count + estimated size (sum of `size` from pouch metadata). User confirms → proceed.

## 8. Test strategy

The repo uses Jest (`jest@29` + `jest-expo`) with the alias `@/` → `src/`. Existing `*.test.ts(x)` files live next to their implementations. We add unit tests for the pure / mockable modules and rely on manual device passes for integration and platform-specific behavior (real downloads, real filesystem, real backup exclusion).

### 8.1 Unit tests (Jest)

Unit-test targets and the behaviors each covers:

- `OfflineFilesStore.test.ts` — pin/unpin/purge transitions; `parentFolderPins` array add/remove; `isDirectPin` flag interaction; idempotency of double-pin; observable emits on state change. MMKV is mocked.
- `Downloader.test.ts` — queue ordering, max-4 concurrency, cancel removes from queue + aborts in-flight, backoff schedule (2s / 8s / 30s), respects WiFi-only flag, transitions `pending` → `downloading` → `downloaded` / `failed` via the store. `createDownloadResumable` and the OnlineMonitor are mocked.
- `pinReactor.test.ts` — given a fake changes feed: md5sum change → enqueue; trash → purge; new doc in pinned folder → pin+enqueue; metadata-only `_rev` bump (same md5sum) → NO enqueue.
- `OnlineMonitor.test.ts` — subscription/unsubscription, listener fan-out, NetInfo + probe OR-merge.
- `useOfflineState.test.tsx` — hook re-renders when store emits.
- `PinnedBadge.test.tsx` — renders correct icon per state.
- `useIsOnline.test.ts` — the existing test still passes after the refactor to delegate to `OnlineMonitor`.

### 8.2 Manual test plan

Coverage on iOS simulator + physical iPhone + Android (at least simulator).

**Pin file (online)**
- [ ] Pin a 5 MB PDF → progress visible → `cloud-check` badge at the end
- [ ] Pin a file already in temp cache → no-op for the download (idempotent)
- [ ] Quick pin / unpin → no orphan blob (check `FileSystemRepo.totalBytes()`)

**Pin folder (online)**
- [ ] Pin a folder with 10 files + 2 subfolders → all downloaded
- [ ] Confirmation dialog when > 1000 files
- [ ] Nested subfolders → also pinned

**Live follow**
- [ ] Add a file on the web inside a pinned folder → within ~30s the file appears + downloads locally

**Update**
- [ ] Modify a pinned file on the web → md5sum-driven re-download on next sync (badge cycles `cloud-sync` → `cloud-check`)
- [ ] Rename a pinned file on the web (no blob change) → NO re-download (md5sum unchanged, only `_rev` bumped)

**Server-side trash**
- [ ] Trash a pinned file on the web → local blob removed + pin gone + no badge on the trash row

**Open**
- [ ] Pinned file online → instant open (time the diff vs temp cache flow)
- [ ] Pinned file offline → instant open
- [ ] Non-pinned offline → "not available" snackbar

**Network**
- [ ] In-flight download + airplane mode ON → pause (state reverts to `pending`)
- [ ] Airplane mode OFF → auto-resume
- [ ] WiFi-only ON on cellular → queue paused
- [ ] WiFi-only OFF → queue resumes

**Settings**
- [ ] Total bytes correct (verify byte-exact on 3 known files)
- [ ] "Delete all" → blobs + entries purged, disk freed
- [ ] Sort by pin date desc
- [ ] Pin toggle disabled offline + helper text visible

**Errors**
- [ ] Drop network mid-download → retry x3 in logs → state failed
- [ ] Manual retry → success
- [ ] Saturated disk (simulate by spamming huge files) → diskFull banner

**Boot**
- [ ] Kill app during download → relaunch → restart from zero of the file in progress
- [ ] Boot offline with existing pins → no crash; blobs open fine

**Android specifics**
- [ ] Backup exclusion: verify `data_extraction_rules.xml` excludes `files/offline/` (trigger a local backup and check the size)

**iOS specifics**
- [ ] `NSURLIsExcludedFromBackupKey` set on the offline directory (verify the folder doesn't grow the iCloud Backup size)

## 9. Out of scope (v1)

Explicitly **not** covered by this feature, deferred to v2+:

1. **Background downloads** — v1 is foreground only on iOS + Android. v2 = `BGTaskScheduler` (iOS) + `WorkManager` (Android) + URLSession background config.
2. **Resume with Range requests** — restart from zero on interruption. The `savable` string from `pauseAsync` is discarded. v2 if cozy-stack confirms support.
3. **Offline editing / write queue** — no offline mutation queue. Sharing/rename/delete actions stay disabled offline (already the case).
4. **Multi-select pin/unpin batch** — v1: one item at a time.
5. **Configurable quotas / limits** — no cap. Total visible in Settings.
6. **Smart pre-fetch** (recents / frequents / shared) — explicit pinning only.
7. **At-rest blob encryption** — relies on iOS sandbox + Android scoped storage. No application-level encryption.
8. **Compression / dedup** — no compression. Same fileId = same entry (free dedup), but no logical dedup on byte-identical duplicates.
9. **Global tab bar / header indicator** — status surfaces only in Settings + on individual rows.
10. **Offline sharing** — no offline link generation.
11. **Folder rename reflected in Settings** — folder `name` is a one-time snapshot at pin time; see section 3.
12. **File moved out of a pinned folder (case 4.3 (d))** — optional polish for v1; can defer if it complicates the changes feed handling.

## 10. Suggested task decomposition for writing-plans

Independent tasks for the implementation plan:

1. `FileSystemRepo` + manual tests of `localPath`/`exists`/`delete` + iOS `NSURLIsExcludedFromBackupKey` + Android backup rules
2. `OnlineMonitor` extraction + refactor `useIsOnline` to delegate to it
3. `OfflineFilesStore` (MMKV CRUD + observable)
4. `Downloader` (queue + concurrency + `createDownloadResumable` + cancel + backoff, no UI integration yet)
5. `pinReactor` (subscribe to PouchDB changes feed via `getPouchLink(client)` + cases a/b/c)
6. `useOfflineState` + `useOfflineActions`
7. `PinnedBadge` + integration into `FileRow` / `FolderRow`
8. Toggle in `FileMetadataSheet` + 3-dot menu item
9. `openFile.ts`: check pinned-and-downloaded fast path
10. `OfflineStorageScreen` (Settings) + route + Settings list entry
11. FR/EN translations
12. WiFi-only toggle + Downloader subscription to `OnlineMonitor` + network type
13. Confirmation modal for big folder pin
14. Manual test pass (see section 8) on iOS sim + physical iPhone + Android
