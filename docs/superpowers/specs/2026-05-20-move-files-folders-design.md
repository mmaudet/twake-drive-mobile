# Move Files & Folders — Design Spec

**Status:** approved
**Owner:** quentin.valmori@gmail.com
**Date:** 2026-05-20
**Scope:** Add Move action (single + bulk) for files and folders in the Cozy
drive, including in-place new-folder creation in the picker. Reuses the
page-sheet modal pattern shipped in Phase A.

## Goal

Let the user move a file or folder to a different destination through a
native iOS page-sheet folder picker. Three entry points:

- The row 3-dot menu (single item).
- The bulk action bar shown when multi-select is active.
- The "Move…" button in the existing metadata page-sheet modal.

Mirror twake-drive-web's UX and API surface as closely as makes sense for
mobile.

Out of scope:
- Shared drives navigation as destinations (Phase D of `docs/TODO.md` —
  shared drives are flagged as needing a broader rework).
- Nextcloud destinations.
- The web's "moving in/out of a shared folder" confirmation sub-modals.
- An "Annuler" snackbar action for the file overwritten on a 409 conflict
  (file is recoverable from the trash; can be added in v2).

## Background

`docs/TODO.md` says:

> Move files / folders inside the drive. Long-press → "Move…" → folder
> picker → confirm. Requires a `moveEntry` helper (mirror twake-drive
> web's `client.collection('io.cozy.files').updateAttributes(id,
> { dir_id })`) + a folder-picker UI. Multi-select integration too.

The Phase A refactor (PRs #20, #21, #22, all merged) made page-sheet
modal routes the standard pattern for any per-file UI surface. Move
naturally fits this pattern: a new `app/move/[ids].tsx` route presented
as a page-sheet.

We also want the `FolderPicker` UI to be reusable: when the Share
Extension lands later, it will need to ask the user which folder to drop
the incoming file into, which is structurally the same picker.

## Reference: twake-drive-web

Inspected and used as the canonical reference:

- `MoveModal.jsx` — orchestrator that holds the `FolderPicker` plus a
  set of edge-case sub-modals for sharing constraints we are skipping.
- `FolderPicker.tsx` — full-screen dialog. Internal `folder` state, drill
  in via `navigateTo()`. Header / topbar / body / footer split into
  separate components.
- `FolderPickerContentCozy.tsx` — body for the Cozy case: queries
  subfolders via `buildMoveOrImportQuery(folder._id)`, renders folder
  rows, files shown disabled.
- `helpers.ts` → `isInvalidMoveTarget` (a row is disabled if it is a
  file or one of the entries being moved), `areTargetsInCurrentDir`
  (the Move button is disabled when target = source).
- `paste/index.js` → `executeMove(client, entry, source, dest, force)`:
  delegates to cozy-client's `move()` for the simple Cozy case, to
  `moveRelateToSharedDrive` for shared drive cases. The simple case is:

  ```js
  client.collection('io.cozy.files')
        .updateFileMetadata(file._id, { dir_id: destination._id })
  ```

  On HTTP 409 with `force=true`: `getFullpath` for the conflict, stat,
  destroy the conflicting file, retry the move. Returns
  `{ moved, deleted }` where `deleted` is the id of the file moved to
  the trash by the force flag.

- `cozy-stack/model/vfs/vfsswift/impl_v3.go:737-738` verified: moving a
  directory into one of its own descendants returns
  `vfs.ErrForbiddenDocMove`, mapped to HTTP 412 Precondition Failed by
  `web/files/files.go:2260`. No client-side pre-check needed; the API
  rejects, we surface a generic error message — same as web.

## Architecture

A new `app/move/[ids].tsx` page-sheet modal route is the orchestrator.
It parses the comma-separated entry ids from the URL segment, queries
the first entry to know the source folder, and renders a presentational
`<FolderPicker>` initialized at that source. Confirmation triggers
sequential `moveEntry(client, entry, destDirId, { force: true })` calls,
then snackbar + dismiss.

The `FolderPicker` is split out of any business logic so it can be
reused for the Share Extension later. It owns its own folder stack
(drill-in navigation), exposes folder selection through an
`onConfirm(folder)` callback.

```
                            ┌─────────────────────────────────────────────┐
                            │              app/_layout.tsx                │
                            │  Stack.Screen "move/[ids]" → pageSheet      │
                            └─────────────────────────────────────────────┘
                                              │
                                              ▼
            ┌────────────────────────────────────────────────────────────────┐
            │                 app/move/[ids].tsx (route)                     │
            │                                                                │
            │  parse ids, query first entry,                                 │
            │  pass initialFolderId to <FolderPicker>                        │
            │  on confirm: moveEntry() per id, snackbar, router.back()       │
            └────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
            ┌────────────────────────────────────────────────────────────────┐
            │            src/ui/FolderPicker/FolderPicker.tsx                │
            │                                                                │
            │  AppBar (back + current folder name + "+ new folder")          │
            │  FlatList of subfolders (FolderPickerRow)                      │
            │  Footer (Cancel | Move here)                                   │
            │                                                                │
            │  state: folderStack: { id, name }[], creatingFolder            │
            └────────────────────────────────────────────────────────────────┘
                                              │ uses
                                              ▼
            ┌────────────────────────────────────────────────────────────────┐
            │                src/files/moveEntry.ts                          │
            │                                                                │
            │  moveEntry(client, entry, destDirId, { force }) →              │
            │    updateFileMetadata + 409/force handling                     │
            └────────────────────────────────────────────────────────────────┘
```

## Components

### `src/files/moveEntry.ts` (new — pure helper)

```ts
export interface MoveEntryTarget {
  _id: string
  _rev?: string
  name: string
  type: 'file' | 'directory'
  dir_id: string
}

export interface MoveEntryResult {
  moved: { _id: string; dir_id: string }
  deleted: string | null  // id of the file moved to trash if force=true
                          // resolved a 409 conflict, null otherwise
}

export const moveEntry = async (
  client: CozyClient,
  entry: MoveEntryTarget,
  destDirId: string,
  options?: { force?: boolean }
): Promise<MoveEntryResult>
```

Implementation mirrors `cozy-client`'s `move()` function for the simple
Cozy case (no shared drives, no Nextcloud — these are out of v1 scope):

1. `client.collection('io.cozy.files').updateFileMetadata(entry._id, { dir_id: destDirId })`
2. On 409 + `force=true`: build the destination path via the destination
   directory id + entry name, `statByPath`, `destroy`, retry the
   `updateFileMetadata`. Return the destroyed id as `deleted`.
3. On 409 without `force`, or on any other error, rethrow.

### `src/ui/FolderPicker/FolderPicker.tsx` (new)

Presentational shell, no business logic.

```ts
interface FolderPickerProps {
  initialFolderId: string
  excludeIds: Set<string>          // ids being moved — rendered disabled
  confirmLabel: string             // resolved i18n string
  isBusy: boolean
  onConfirm: (folder: { _id: string; name: string }) => void
  onCancel: () => void
}
```

Internal state:
- `folderStack: { id: string; name: string }[]` — first entry initialized
  from `initialFolderId` + its queried name.
- `creatingFolder: boolean` — toggles the `<CreateFolderDialog>` already
  used elsewhere in the app.

Interactions:
- Tap folder row → push onto stack.
- Tap back (AppBar arrow) → pop the stack. If only the initial entry
  remains, the back button calls `onCancel()`.
- Tap "+ New folder" → `creatingFolder = true`. On submit, call the
  existing `createFolder(client, name, currentId)` helper, then push
  the new folder onto the stack so the user drills into it
  automatically.
- Tap "Cancel" → `onCancel()`.
- Tap "Move here" → `onConfirm({ _id: currentId, name })`.

"Move here" is disabled when:
- `isBusy` is true.
- `currentId` is in `excludeIds` (cannot move a folder into itself or one
  of the entries being moved).
- `currentId` equals the initial folder id (target = source).

### `src/ui/FolderPicker/FolderPickerRow.tsx` (new)

Simple row: folder icon + name + chevron. Accepts `disabled` (file rows
or excluded ids are rendered greyed out and unpressable). Files are also
rendered in the list (greyed) so the user has spatial awareness — this
mirrors the web behavior in `FolderPickerContentCozy`.

### `app/move/[ids].tsx` (new — orchestrator route)

```ts
const { ids } = useLocalSearchParams<{ ids: string }>()
const idList = ids?.split(',') ?? []

// Query the first entry to know where to start
const firstEntryLookup = useQuery(fileByIdQuery(idList[0]), ...)
const firstEntry = ... // FileQueryResult

const onConfirm = async ({ _id: destDirId }) => {
  setBusy(true)
  try {
    for (const id of idList) {
      const entry = ... // fetched lazily or assumed cached
      await moveEntry(client, entry, destDirId, { force: true })
    }
    setSnackbar(idList.length === 1
      ? t(firstEntry.type === 'directory' ? 'drive.move.successFolder' : 'drive.move.successFile')
      : t('drive.move.successBulk', { count: idList.length })
    )
    setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
  } catch (e) {
    setSnackbar(t('drive.move.errorGeneric'))
  } finally {
    setBusy(false)
  }
}
```

For bulk, the moves are **sequential**, not parallel: cozy-stack can
race on concurrent `dir_id` mutations and we want to surface any single
failure clearly. This matches the existing pattern in
`confirmBulkDelete` (in `app/(drive)/files/[...path].tsx`).

Loading states:
- While the first-entry query is pending: render `<LoadingState>` in a
  full `<ScreenContainer>` (same pattern as metadata route).
- If the first entry is missing: `<ErrorState>` with retry.

### `app/_layout.tsx` (modified)

Add a new `<Stack.Screen>` for `move/[ids]` with `pageSheet` presentation.

### `app/(drive)/files/[...path].tsx`, `recent.tsx`, `shared/[...path].tsx`, `shareddrives/[...path].tsx` (modified)

- Pass `onMove` to each FileRow / FolderRow:
  ```ts
  onMove={file => router.push(`/move/${file._id}`)}
  ```
- For the files screen, add a "Move" action to the bulk action bar
  alongside delete. Pass the selected ids as a CSV.
- `trash.tsx` is unchanged: trashed items cannot be moved.

### `src/ui/FileRow.tsx`, `FolderRow.tsx` (modified)

Add an `onMove?: (entry) => void` prop. When set, the 3-dot menu
includes a new "Move…" item. When the multi-select bulk-bar is active,
the inline 3-dot menu is hidden anyway (existing behavior preserved).

### `app/metadata/[fileId].tsx` (modified)

Add a "Move…" button in the footer between Share and Rename. Tapping it
calls `router.replace('/move/' + fileId)` — swap modal, no stacking
(same pattern as the existing Share button).

### `src/i18n/locales/en.json` + `fr.json` (modified)

New keys under `drive.move`:
- `title` — modal title fallback (we use folder name instead, but the
  key exists for the Move button context).
- `action` — "Move here"
- `cancel` — "Cancel"
- `successFile` — "File moved"
- `successFolder` — "Folder moved"
- `successBulk` — "{{count}} items moved"
- `errorGeneric` — "Move failed"
- `newFolder` — "+ New folder"

Plus `drive.fileMeta.move` ("Move…") and `drive.selection.move` (bulk
action bar accessibility label).

## Data flow

```
List screen
   tap row 3-dot menu → Move…
       └─→ router.push('/move/' + fileId)
                                ↓
          /move/[ids] route mounts
                                ↓
          useQuery(fileByIdQuery(firstId))
                                ↓
          render <FolderPicker
                   initialFolderId={firstEntry.dir_id}
                   excludeIds={new Set(idList)}
                   isBusy={busy}
                   onConfirm={onConfirm}
                   onCancel={close} />
                                ↓
          user drills in via folderStack push/pop
                                ↓
          user taps "Move here"
                                ↓
          for (id of idList) {
            await moveEntry(client, entry, destDirId, { force: true })
          }
                                ↓
          snackbar success
          setTimeout(close, 600)  →  router.back()
                                       ↓
          List screen useFocusEffect re-fetches queries
          (refs from PR #21 commit cb8a537)
```

## Error handling

- **412 ForbiddenDocMove** (moving a folder into one of its own
  descendants): cozy-stack rejects. Surface generic
  `drive.move.errorGeneric`. The "Move here" button does not pre-check
  this — too expensive to walk the parent chain on every selection.
- **409 Conflict** (destination already has a file with the same name):
  `moveEntry` uses `force=true` by default, so the existing file is
  trashed silently. The user can recover from the trash.
- **403 Forbidden** (e.g., read-only folder): generic error message.
- **Network errors**: generic error message, modal stays open so the
  user can retry.
- **First-entry query fails on mount**: `<ErrorState>` with retry — the
  modal cannot do anything meaningful without the source folder
  context.

All errors set `setSnackbar(t('drive.move.errorGeneric'))` and
`setBusy(false)`. The modal does not auto-dismiss on error.

## Testing

### Unit (Jest)

- `src/files/moveEntry.test.ts`:
  - Success path returns `{ moved, deleted: null }`.
  - 409 + `force: true` → stat, destroy, retry, return `{ moved, deleted }`.
  - 409 without `force` → rethrows.
  - Other errors → rethrows.
  - `updateFileMetadata` called with correct params.

- `src/ui/FolderPicker/FolderPicker.test.tsx`:
  - Renders the initial folder name.
  - Renders subfolders, files are present but disabled.
  - Tapping a folder row drills in.
  - Back button pops the stack; from the root it calls `onCancel`.
  - "Move here" disabled when current === initial.
  - "Move here" disabled when current id is in `excludeIds`.
  - "+ New folder" opens the create-folder dialog.
  - On folder created, the new folder is auto-pushed onto the stack.

- `app/move/[ids].test.tsx`:
  - Renders the folder picker.
  - On confirm with a single id: `moveEntry` called once with the chosen
    destination; success snackbar + `router.back()` fires after the
    snackbar delay.
  - On confirm with multiple ids: `moveEntry` called sequentially per id.
  - On `moveEntry` error: snackbar error shown, modal stays open.
  - Renders `<LoadingState>` while the first-entry query is loading.
  - Renders `<ErrorState>` if the first entry resolves to null.

### Manual smoke (iOS device)

- [ ] Tap "Move…" from a file row 3-dot menu → modal opens at the source
      folder. Drill in. Tap "Move here". Modal closes, snackbar appears,
      list refreshes on focus return — the file has moved.
- [ ] Multi-select 3 files → bulk action bar shows a Move icon → tap →
      modal opens. Confirm. Snackbar reads "3 items moved".
- [ ] Tap "+ New folder" → input → submit "Archive" → modal auto-drills
      into Archive → "Move here" enabled → confirm → file is in Archive.
- [ ] Open metadata modal on a file → tap "Move…" → modal swaps to Move
      picker (no stacking visible). Confirm. Returns to the list (not to
      metadata).
- [ ] Move file `Report.pdf` into a folder that already contains
      `Report.pdf` → the existing file is trashed silently, the moved
      file lands in the destination. Verify via the trash tab.
- [ ] Try to move a folder into one of its own subfolders → snackbar
      shows the generic error, modal stays open.
- [ ] Move from `recent.tsx` → works (no FolderRow on recent, only
      FileRow, but the entry point exists).

## Implementation plan (7 atomic commits in one PR)

Branch: `feat/move-files` (already created from main after PRs #20-#22
merged).

1. `feat(files): add moveEntry helper` — pure helper + tests.
2. `feat(ui): add FolderPicker component` — presentational, no router
   coupling.
3. `feat(move): add /move/[ids] modal route` — orchestrator + route
   declaration + i18n keys.
4. `feat(ui): add onMove prop to FileRow and FolderRow` — opt-in menu
   item.
5. `feat(drive): wire Move action from list screens` — push the route
   from row menu + bulk action bar.
6. `feat(metadata): add Move button to metadata modal` — `router.replace`
   for modal swap.
7. `docs(todo): move files/folders shipped, remove from backlog`.

Each commit leaves the app green (tsc + jest + lint). Single PR
`feat/move-files` against main.

## Rollout & rollback

- Each commit is atomic; rollback is per-commit if a bug surfaces.
- The feature is internal (no new flag). Removing it would mean
  reverting the PR.

## Done criteria

- "Move…" appears in the row 3-dot menu, the bulk action bar (files
  screen), and the metadata modal footer.
- Tapping it opens a page-sheet folder picker at the source folder.
- The picker lets the user drill in, create a new destination folder
  inline, and confirm.
- Single and bulk moves complete; the source list refreshes on focus
  return; the metadata modal swap to /move and back works without
  stacking.
- All existing Jest tests pass; new tests for `moveEntry`,
  `FolderPicker`, and `app/move/[ids]` added and green.
- Manual smoke list above green on iOS (Android = same minus PiP
  considerations, which are not relevant for Move).
- `docs/TODO.md` entry "Move files / folders" removed.
