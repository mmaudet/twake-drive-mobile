# Viewer Modal Refactor — Design Spec

**Status:** approved
**Owner:** quentin.valmori@gmail.com
**Date:** 2026-05-18
**Scope:** Phase A of the post-launch TODO (`docs/TODO.md`) — unify the
"view a file" surface around native iOS `pageSheet` modals + fix iOS PiP
detach.

## Goal

Give every per-file viewer the same dismissal pattern: native iOS
`pageSheet` modal with swipe-down dismiss. Today, `app/preview/[fileId]`
already uses this pattern and the UX is the agreed reference. The metadata
sheet, share sheet, OnlyOffice / Cozy Notes / Docs WebView screens, and the
new-Docs screen all use a different shell (gorhom bottom-sheet or in-app
tab stack with an AppBar), which creates two competing dismissal models in
the same app.

In the same refactor, fix the iOS Picture-in-Picture bug where the PiP
window stays painted inside the `pageSheet` modal instead of detaching to a
system-level floating window — root-caused to PiP not being able to detach
from a presented page-sheet view controller.

Out of scope:
- Horizontal swipe between files inside a folder (deferred — was
  initially in Phase A, removed during brainstorming).
- `.ogg` audio playback (Phase B in `docs/TODO.md`).
- Shared-drives audit (Phase D).

## Background

`docs/TODO.md` opens with:

> **Migrate all sheets to native `pageSheet` modals.** The image / video /
> PDF preview screens use expo-router's `presentation: 'pageSheet'` and
> the native iOS swipe-down dismiss feels great. Apply the same pattern to
> [FileMetadataSheet, ShareSheet, OnlyOffice, Cozy/Docs notes]. Goal: one
> consistent dismissal pattern (swipe down) across the whole "view a file"
> surface.

And later, under Bugs:

> **Video PiP stays inside the preview modal.** When PiP is triggered, the
> picture-in-picture window remains visually pinned inside the page-sheet
> modal instead of detaching to a system-level floating window. Result: the
> modal still covers the drive content, so the user can't continue browsing
> while watching the video.

The two items are coupled — PiP detach requires re-thinking how the video
preview controller is presented, which overlaps with the modal refactor.

## Architecture

Three orthogonal changes:

1. **Sheet → route migration.** `FileMetadataSheet` and `ShareSheet` become
   first-class expo-router routes (`app/metadata/[fileId]`,
   `app/share/[fileId]`) presented as `pageSheet` modals from the root
   stack. The imperative `ref.current.present(file)` API is replaced by
   declarative `router.push('/metadata/' + fileId)` calls. Mutations and
   their snackbars move into the route; callers re-fetch via
   `useFocusEffect`. Result: `@gorhom/bottom-sheet` becomes unused and is
   removed.

2. **WebView screens move to root stack.** `OnlyOffice`, `Cozy Notes`,
   `Docs`, and `Docs new` move from `app/(drive)/<kind>/[fileId]` to
   `app/<kind>/[fileId]`, declared on the root stack with
   `presentation: 'pageSheet'`. Their internal `<AppBar>` is removed
   (chromeless), matching the existing image / video / PDF preview kinds.

3. **PiP fix via root-level `PiPSession` context.** A new singleton context
   monted at the root holds the active `VideoPlayer`. The `VideoPreview`
   subscribes to this context instead of creating its own player. On
   `onPictureInPictureStart` the preview modal calls `router.back()` —
   which dismisses the page-sheet and lets the OS take over PiP at system
   level. On `onPictureInPictureStop`, an heuristic (`player.playing`)
   distinguishes "restore" (re-push the preview route, the same player is
   re-attached) from "close" (release the player). The player survives
   modal unmount/remount because it lives in the root-level context.

```
                        ┌─────────────────────────────────────┐
                        │            app/_layout.tsx           │
                        │  ┌───────────────────────────────┐  │
                        │  │      PiPSessionProvider       │  │
                        │  │  ┌─────────────────────────┐  │  │
                        │  │  │         Stack            │  │  │
                        │  │  │  • (auth)                │  │  │
                        │  │  │  • (drive)               │  │  │
                        │  │  │  • preview/[fileId]      │  │  │ pageSheet
                        │  │  │  • metadata/[fileId]     │  │  │ pageSheet (new)
                        │  │  │  • share/[fileId]        │  │  │ pageSheet (new)
                        │  │  │  • onlyoffice/[fileId]   │  │  │ pageSheet (moved)
                        │  │  │  • note/[fileId]         │  │  │ pageSheet (moved)
                        │  │  │  • docs/[fileId]         │  │  │ pageSheet (moved)
                        │  │  │  • docs/new/[folderId]   │  │  │ pageSheet (moved)
                        │  │  └─────────────────────────┘  │  │
                        │  └───────────────────────────────┘  │
                        └─────────────────────────────────────┘
```

## Components

### `src/preview/PiPSession.tsx` (new)

Root-level context exposing a single active video player session.

```tsx
interface PiPSession {
  fileId: string
  source: StreamSource
  player: VideoPlayer
}

const PiPSessionContext = createContext<{
  activeSession: PiPSession | null
  claim: (fileId: string, source: StreamSource) => VideoPlayer
  release: () => void
}>(...)
```

- `claim(fileId, source)` — returns the existing player if `fileId` matches
  the active session; otherwise releases the old one and creates a new
  player via `useVideoPlayer` (wrapped to allow imperative creation).
- `release()` — stops + nullifies the active player.
- One active session at a time. Switching to a new fileId implicitly
  releases the old session.

### `src/preview/VideoPreview.tsx` (new — extracted from `app/preview/[fileId].tsx`)

Receives `source` + `fileId`, calls `usePiPSession().claim(fileId, source)`
to get the player, renders `<VideoView>` with:

```tsx
<VideoView
  player={player}
  allowsPictureInPicture
  startsPictureInPictureAutomatically
  onPictureInPictureStart={() => {
    // Dismiss the page-sheet modal so iOS can detach PiP to system level.
    router.back()
  }}
  onPictureInPictureStop={() => {
    if (player.playing) router.push(`/preview/${fileId}`)
    else release()
  }}
/>
```

The reason `router.back()` must fire on PiP start: AVPictureInPictureController
on iOS cannot detach to system level from a view controller presented as a
form sheet / page sheet. The page-sheet must be dismissed before the OS
PiP window takes over.

### `app/metadata/[fileId].tsx` (new — replaces `src/ui/FileMetadataSheet.tsx`)

Page-sheet modal route. Reads `fileId` from URL params, queries the file
via `fileByIdQuery`, and renders the same UI as today's
`FileMetadataSheet`:

- Header: thumbnail (or local image if pinned-and-downloaded) + name.
- "Keep offline" toggle (calls `useOfflineActions().pin/unpin`).
- Metadata rows (mime, size, modified, path, owner).
- Footer actions: Open, Share, Rename, Delete, Close.

Differences from today:
- Open: stays identical (route push to per-kind viewer, or
  `openFileNatively` for unsupported types) but calls `router.dismiss()`
  before navigating.
- Share: `router.replace('/share/' + fileId)` — replaces the current
  modal with the share modal (no stacking).
- Rename: opens an in-route `<RenameDialog>`. On submit, calls
  `renameEntry` directly, shows snackbar, then `router.back()`.
- Delete: opens an in-route `<ConfirmDeleteDialog>`. On confirm, calls
  `softDeleteEntry`, shows snackbar, then `router.back()`.
- Snackbar: rendered locally in the route, visible during the page-sheet
  dismiss animation (~300ms is enough to read).

### `app/share/[fileId].tsx` (new — replaces `src/ui/ShareSheet.tsx`)

1:1 migration. Same internal sections (`PublicLinkSection`,
`RecipientsSection`, `ContactAutocomplete`, etc.) — no UX redesign in this
refactor. The component reads `fileId` from URL params and uses
`useFileSharing(fileId)` exactly as today.

### `app/onlyoffice/[fileId].tsx`, `app/note/[fileId].tsx`, `app/docs/[fileId].tsx`, `app/docs/new/[folderId].tsx`

Identical to today's `app/(drive)/<kind>/[fileId].tsx` minus the
`<AppBar>` — they become chromeless. The internal WebView already has the
editor's own header (OnlyOffice / Notes / Docs all show the doc name at
the top of their web UI), so removing the native AppBar doesn't lose
information.

The page-sheet grabber on iOS handles discoverability of the dismiss
gesture.

### `app/_layout.tsx` (modified)

- Remove `<BottomSheetModalProvider>` and the gorhom import.
- Wrap `<Stack>` in `<PiPSessionProvider>`.
- Declare the new / moved routes with `presentation: 'pageSheet'`:
  - `metadata/[fileId]`
  - `share/[fileId]`
  - `onlyoffice/[fileId]`
  - `note/[fileId]`
  - `docs/[fileId]`
  - `docs/new/[folderId]`

### `app/(drive)/_layout.tsx` (modified)

Remove the four `<Tabs.Screen href:null>` entries for `onlyoffice`,
`note`, `docs`, `docs/new`. They no longer live in the drive tab stack.

### List screens (modified — 5 files)

`app/(drive)/files/[...path].tsx`, `recent.tsx`, `trash.tsx`,
`shared/[...path].tsx`, `shareddrives/[...path].tsx`:

- Remove `useRef<FileMetadataSheetHandle>`, `useRef<ShareSheetHandle>`,
  and their rendered components.
- Replace `sheetRef.current?.present(file)` →
  `router.push('/metadata/' + file._id)`.
- Replace `shareRef.current?.present(file)` →
  `router.push('/share/' + file._id)`.
- Update navigation paths: `/(drive)/onlyoffice/...` → `/onlyoffice/...`
  (same for note, docs, docs/new).
- Add `useFocusEffect` that re-fetches folder + file queries on focus
  return.
- Keep `<ConfirmDeleteDialog>` for bulk delete (multi-select feature
  unaffected by this refactor) and `<RenameDialog>` for rename triggered
  from row 3-dot menu (single-row rename can go through the metadata
  route, but bulk + row-menu paths stay native to the list screen).

### `src/files/openFromList.ts` (modified)

Path updates: `/(drive)/onlyoffice/` → `/onlyoffice/`, same for note, docs.

## Data flow

### Today (impérative)

```
Tap row → FilesScreen.renderItem.onPress
       → sheetRef.current?.present(file)   ┐
       → FileMetadataSheet shows           │ in-screen
       → user taps "Share"                 │
       → onShareRequested(file)            │
       → shareRef.current?.present(file)   ┘
       → ShareSheet shows
       → user taps backdrop
       → ShareSheet closes (gorhom)
       → user taps backdrop
       → FileMetadataSheet closes
```

### Tomorrow (déclarative)

```
Tap row → FilesScreen.renderItem.onPress
       → router.push('/metadata/' + fileId)   → root stack pushes pageSheet
       → MetadataScreen renders               (queries fileByIdQuery)
       → user taps "Share"
       → router.replace('/share/' + fileId)  → swap top route
       → ShareScreen renders
       → user swipes down
       → ShareScreen pops (OS gesture)
       → focus returns to FilesScreen
       → useFocusEffect re-fetches queries
```

### PiP flow

```
Preview open with video
       → PiPSession.claim(fileId, source) → creates VideoPlayer, stores it
       → user taps PiP button (or auto-start fires)
       → VideoView.onPictureInPictureStart
       → router.back()                       → modal dismisses
       → iOS detaches PiP to system level    → floating window survives
       → PiPSession still holds player

User browses drive, then taps PiP "restore"
       → VideoView.onPictureInPictureStop (player.playing === true)
       → router.push('/preview/' + fileId)
       → PreviewScreen re-mounts
       → VideoPreview.claim(fileId, source) → returns existing player
       → playback continues seamlessly

User taps PiP "close"
       → VideoView.onPictureInPictureStop (player.playing === false)
       → PiPSession.release()
       → no navigation
```

## Error handling

- **Metadata / Share route loads with no `fileId` or query failure**: render
  `<ErrorState message=t('drive.preview.loadFailed') onRetry={...} />`.
  Same pattern as `app/preview/[fileId].tsx`.
- **Rename / Delete mutation failure**: snackbar with generic error key
  (`drive.rename.errorGeneric`, `drive.delete.errorGeneric`), modal stays
  open so the user can retry.
- **PiP restore but `PiPSession` no longer has a session**: very rare race
  (user kills app, OS doesn't fire stop). Fallback: the route re-mounts as
  if fresh — `claim()` creates a new player from `source`, video re-buffers
  from start. Not ideal but not broken.
- **`router.back()` fired while not on the preview route** (PiP start
  arrives late): no-op safety check via `router.canGoBack()`.

## Testing

### Unit (Jest)

- `src/preview/PiPSession.test.tsx` — claim returns same player for same
  fileId, claim of new fileId releases old, release clears state.
- `src/preview/VideoPreview.test.tsx` — onPictureInPictureStart calls
  `router.back()`; onPictureInPictureStop with `playing` calls
  `router.push`; without `playing` calls `release()`.
- `app/metadata/[fileId].test.tsx` — present with valid fileId renders all
  rows; toggle pin calls store; rename + confirm calls `renameEntry`;
  delete + confirm calls `softDeleteEntry`; share button calls
  `router.replace('/share/' + id)`.
- `app/share/[fileId].test.tsx` — port of existing `ShareSheet.test.tsx`
  if any (none committed today, but the route logic is testable with the
  same fixtures).

### Manual smoke (iOS)

- Tap file → metadata pageSheet opens → swipe down → list snackbar absent
  (no mutation), focus returns, no re-fetch needed visually.
- Tap file → metadata → Share button → share pageSheet replaces metadata
  (no stacking visible) → swipe down → returns to list.
- Tap file → metadata → Rename → submit → snackbar appears → modal closes →
  list shows new name (refetched on focus).
- Tap OnlyOffice file → pageSheet opens chromeless → editor loads → swipe
  down → returns to list.
- Tap video file → preview opens → tap PiP → modal dismisses, PiP floats
  → browse drive freely → tap PiP "restore" → preview re-opens with video
  playing.
- Tap video file → preview opens → tap PiP → modal dismisses → tap PiP
  "close" → no modal re-opens, playback stops.

### Manual smoke (Android)

Same as iOS minus PiP (Android PiP is out of scope of this fix — the bug
was iOS-specific; Android PiP behavior is unchanged).

## Implementation plan (split across 3 PRs)

### PR 1 — `fix/video-pip-detach` (commits 1–2)

1. `feat(preview): add PiPSession context at root`
2. `fix(preview): detach video PiP via PiPSession + auto-dismiss`

### PR 2 — `refactor/sheets-to-routes` (commits 3–8 + 11)

3. `feat(metadata): add /metadata/[fileId] modal route`
4. `refactor(drive): list screens push /metadata instead of presenting sheet`
5. `chore(ui): remove unused FileMetadataSheet component`
6. `feat(share): add /share/[fileId] modal route`
7. `refactor(drive): list screens push /share instead of presenting sheet`
8. `chore(ui): remove unused ShareSheet component`
11. `chore(deps): remove @gorhom/bottom-sheet`

Commit 11 is the natural last act of PR 2: after commit 8, the package
has no consumers left.

### PR 3 — `refactor/webview-screens-pagesheet` (commits 9–10)

9. `refactor(routing): move WebView screens to root stack as pageSheet`
10. `refactor(viewer): chromeless onlyoffice/note/docs screens`

PR 3 depends on PR 2 being merged (the metadata route pushes
`/onlyoffice/`, `/note/`, `/docs/` paths, and we want the move to root
stack to happen before users rely on those paths from the new metadata
route — although both old `/(drive)/onlyoffice/` and new `/onlyoffice/`
paths can coexist briefly during the rollout).

## Rollout & rollback

- Each commit leaves the app green (TS + Jest + lint + iOS / Android
  build). No flags needed; the refactor is internal.
- Rollback granularity: per PR. If PR 1 surfaces a PiP regression on a
  device class, revert PR 1 alone — PR 2 and PR 3 do not depend on
  `PiPSession`.

## Done criteria

- `@gorhom/bottom-sheet` removed from `package.json` and `app/_layout.tsx`.
- All file-viewer surfaces (metadata, share, onlyoffice, notes, docs,
  preview) dismiss via swipe-down on iOS.
- Tapping PiP button on a video preview detaches the PiP window to the
  system level; the user can browse the drive while the video continues
  playing in the floating window; tapping "restore" re-opens the preview
  modal with the video resumed in place.
- All existing Jest tests pass; new tests for `PiPSession`, `VideoPreview`,
  `app/metadata/[fileId]`, `app/share/[fileId]` added and green.
- Manual smoke list above green on iOS (Android = same minus PiP).
