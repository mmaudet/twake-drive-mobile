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

- **Swipe left / right in viewer to navigate between files.** When viewing a file inside a folder, swipe horizontally should jump to the previous / next file of the same folder context (without going back to the list). Needs the viewer to know its sibling list + index, and a horizontal pager (e.g. `react-native-pager-view` or `FlatList horizontal pagingEnabled`) wrapping the per-kind preview. Keep the vertical swipe-down dismiss intact.

## Features

- **Receive shared content from the OS** (Share Extension). User taps a photo in Photos → "Share" → Twake Drive → file lands in a target folder. Requires:
  - iOS: a Share Extension target (separate bundle); needs config plugin + native code
  - Android: an intent filter for `ACTION_SEND` / `ACTION_SEND_MULTIPLE` in the main activity
  - In-app: a destination picker (which folder to drop into) + an upload pipeline
  - Probably worth its own design doc.

- **Move files / folders inside the drive.** Long-press → "Move…" → folder picker → confirm. Requires a `moveEntry` helper (mirror twake-drive-web's `client.collection('io.cozy.files').updateAttributes(id, { dir_id })`) + a folder-picker UI. Multi-select integration too.

## Bugs

- **Trash empty doesn't refresh client-side.** Emptying the trash from the
  web shows the bin empty there, but the mobile Trash tab keeps showing the
  same files. Even pull-to-refresh doesn't catch up — suggests the
  `empty trash` cozy-stack operation isn't reflected in the local pouch
  replication, or our trash query bypasses the replicated state. Repro:
  empty the trash on web → open Twake Drive mobile → Trash tab still full.
  Need to investigate whether the bulk delete emits a doc-level change the
  pouch sync picks up.

- **Shared drives are poorly implemented.** The Shared Drives tab currently
  reuses the regular drive listing pipeline but doesn't really account for
  shared-drive specifics (membership, root listing, permissions, navigation).
  Needs a proper audit against twake-drive-web's behaviour — how the root is
  fetched, how each shared drive is entered, how the breadcrumb / back stack
  behaves, and how sharing/permission-only actions are gated.

- **Video PiP stays inside the preview modal.** When PiP is triggered, the
  picture-in-picture window remains visually pinned inside the page-sheet
  modal instead of detaching to a system-level floating window. Result: the
  modal still covers the drive content, so the user can't continue browsing
  while watching the video. Investigate `expo-video` PiP detach behaviour
  on iOS and whether dismissing the modal (while keeping playback alive) is
  the right pattern.

- **`.ogg` audio files don't play (v1 fix shipped, real fix pending).**
  iOS AVPlayer refuses to parse the Ogg container, even when the codec
  inside is Opus (which iOS would otherwise decode natively since iOS 11).
  Confirmed example in the wild: Twake Meetings transcripts —
  `file Réunion_…ogg` reports `Ogg data, Opus audio, 48000 Hz`. v1 fix:
  detect `audio/ogg` in the audio preview and render an explicit
  "format unsupported on this device" state with an "Open with…" button
  that triggers `openFileNatively` (downloads + delegates to the OS share
  sheet so VLC / another app can take over). Real fix options for v2,
  ordered by long-term value:

  1. **Server-side remux on cozy-stack.** Expose a content-negotiation
     endpoint (e.g. `GET /files/<id>/audio?container=caf`) that demuxes
     the Ogg pages and rewraps the Opus packets into CAF/m4a — zero
     re-encoding, zero quality loss, sub-second op. One fix benefits
     mobile + web + future clients (Safari has the same Ogg restriction).
     Around ~20 lines of Go with an `oggopus` library.

  2. **`ffmpeg-kit-react-native` on the mobile side.**
     `ffmpeg -i input.ogg -c:a copy output.caf` does the remux locally
     before handing the file to expo-audio. Adds ~20-30 MB to the iOS
     bundle. Works offline (pinned transcripts stay playable without
     network). Use this if (1) is not on the roadmap.

  3. **Pure-JS remuxer.** Ogg → CAF is ~200 lines of TS (parse Ogg pages,
     emit a CAF header + Opus packet stream). Zero native deps, no bundle
     size hit, but maintenance burden + edge-case risk on large files.
     Only worth it if (1) and (2) are both off the table.

  4. **`react-native-vlc-media-player`.** Embeds MobileVLCKit (+50 MB) and
     plays Ogg natively. Disproportionate now that we know the inner
     codec is Opus (a container-only problem). Listed for completeness.

  Reco: aim for (1). Ship v1 as the fallback UI. Track the backend PR
  separately.

## Known limitations from prior sessions

- **iOS `NSURLIsExcludedFromBackupKey` on `documentDirectory/offline/`** — currently NOT set, so the offline cache grows the iCloud backup size. Needs a small native module. Documented as `TODO(offline-v1.5)` in `src/offline/FileSystemRepo.ts`.

- **Android backup rules** — `data_extraction_rules.xml` should exclude `files/offline/`. Requires a custom expo config plugin since `android/` is prebuild-managed. Same TODO marker.

- **Background downloads** — v1 is foreground-only. v2 should use `BGTaskScheduler` (iOS) + `WorkManager` (Android) for downloads that complete while the app is backgrounded.

- **Range / resume on download interruption** — restart from zero on interruption. v2 once cozy-stack confirms `Range:` request support.
