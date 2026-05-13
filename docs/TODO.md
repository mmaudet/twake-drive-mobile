# Twake Drive Mobile — Backlog

Items to pick up later, captured in conversation. Order is rough, not strict.

## UX / viewer

- **Migrate all sheets to native `pageSheet` modals.** The image / video / PDF preview screens use expo-router's `presentation: 'pageSheet'` and the native iOS swipe-down dismiss feels great. Apply the same pattern to:
  - `FileMetadataSheet` (currently `@gorhom/bottom-sheet`) → "Details" modal route
  - `ShareSheet` (currently `@gorhom/bottom-sheet`) → "Share" modal route
  - Office docs viewer (`/onlyoffice/[fileId]`) — already a screen, just needs `presentation: 'pageSheet'` on its Stack.Screen entry + dropping any internal AppBar header
  - Cozy notes / Docs notes / other per-file viewers — same treatment
  - Goal: one consistent dismissal pattern (swipe down) across the whole "view a file" surface.

- **Pagination on file lists.** Long folders (>100 items) probably need infinite scroll or page-based loading. Currently we fetch everything via `client.query(folderFilesQuery(...))` without `limitBy`/`skip`. Add cursor-based pagination using cozy-client's `fetchMore` and a sentinel "loading more…" row at the bottom of the FlatList. Mirror twake-drive-web's behaviour.

## Features

- **Receive shared content from the OS** (Share Extension). User taps a photo in Photos → "Share" → Twake Drive → file lands in a target folder. Requires:
  - iOS: a Share Extension target (separate bundle); needs config plugin + native code
  - Android: an intent filter for `ACTION_SEND` / `ACTION_SEND_MULTIPLE` in the main activity
  - In-app: a destination picker (which folder to drop into) + an upload pipeline
  - Probably worth its own design doc.

- **Move files / folders inside the drive.** Long-press → "Move…" → folder picker → confirm. Requires a `moveEntry` helper (mirror twake-drive-web's `client.collection('io.cozy.files').updateAttributes(id, { dir_id })`) + a folder-picker UI. Multi-select integration too.

## Known limitations from prior sessions

- **iOS `NSURLIsExcludedFromBackupKey` on `documentDirectory/offline/`** — currently NOT set, so the offline cache grows the iCloud backup size. Needs a small native module. Documented as `TODO(offline-v1.5)` in `src/offline/FileSystemRepo.ts`.

- **Android backup rules** — `data_extraction_rules.xml` should exclude `files/offline/`. Requires a custom expo config plugin since `android/` is prebuild-managed. Same TODO marker.

- **Background downloads** — v1 is foreground-only. v2 should use `BGTaskScheduler` (iOS) + `WorkManager` (Android) for downloads that complete while the app is backgrounded.

- **Range / resume on download interruption** — restart from zero on interruption. v2 once cozy-stack confirms `Range:` request support.
