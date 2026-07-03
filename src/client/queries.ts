import { Q, QueryDefinition } from 'cozy-client'

export const ROOT_DIR_ID = 'io.cozy.files.root-dir'
export const TRASH_DIR_ID = 'io.cozy.files.trash-dir'
// Virtual directory the cozy-stack uses to gather shared drives. It shows up
// at the root of `io.cozy.files` listings; twake-drive web hides it (along
// with the trash-dir) via a partialIndex on the folder query. We filter the
// same two IDs out client-side here.
export const SHARED_DRIVES_DIR_ID = 'io.cozy.files.shared-drives-dir'

/**
 * IDs of virtual / system directories that should never appear in a regular
 * folder listing. Mirrors twake-drive web's filtering convention.
 */
export const HIDDEN_ROOT_DIR_IDS: readonly string[] = [SHARED_DRIVES_DIR_ID, TRASH_DIR_ID]

export interface FileQueryResult {
  _id: string
  _rev?: string
  _type: string
  name: string
  type: 'file' | 'directory'
  dir_id?: string
  trashed?: boolean
  size?: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  cozyMetadata?: {
    createdBy?: { account?: string }
    favorite?: boolean
  }
  links?: {
    tiny?: string
    small?: string
    medium?: string
    large?: string
  }
}

// Mirrors twake-drive-web / cozy-drive's `buildDriveQuery`: two separate
// queries per folder, one for sub-directories and one for files, merged at
// the screen level. The `name: { $gt: null }` sentinel ensures cozy-stack
// has a usable index on `name`. The partialIndex excludes the virtual
// system directories (shared-drives-dir, trash-dir) at the server level so
// every consumer (file list, folder picker, etc.) gets the same hidden set
// without duplicating client-side filters.
const buildDriveQuery = (dirId: string, type: 'directory' | 'file'): QueryDefinition =>
  Q('io.cozy.files')
    .where({ dir_id: dirId, type, name: { $gt: null } })
    .partialIndex({ _id: { $nin: HIDDEN_ROOT_DIR_IDS } })
    .indexFields(['dir_id', 'type', 'name'])
    .sortBy([{ dir_id: 'asc' }, { type: 'asc' }, { name: 'asc' }])
    .limitBy(100)

export const folderSubfoldersQuery = (dirId: string): QueryDefinition =>
  buildDriveQuery(dirId, 'directory')
export const folderSubfoldersQueryAs = (dirId: string): string =>
  `io.cozy.files/dir/${dirId}/folders`

export const folderFilesQuery = (dirId: string): QueryDefinition => buildDriveQuery(dirId, 'file')
export const folderFilesQueryAs = (dirId: string): string => `io.cozy.files/dir/${dirId}/files`

export interface SharingRule {
  title: string
  doctype: string
  values: string[]
}

export interface SharingQueryResult {
  _id: string
  _type: string
  attributes: {
    description?: string
    owner?: boolean
    rules?: SharingRule[]
    members?: unknown[]
  }
}

export const sharedWithMeQuery = (): QueryDefinition =>
  Q('io.cozy.sharings').where({ owner: false })
export const sharedWithMeQueryAs = 'io.cozy.sharings/with-me'

// Verbatim copy of twake-drive-web's `buildRecentQuery`
// (src/queries/index.ts).
export const recentQuery = (): QueryDefinition =>
  Q('io.cozy.files')
    .where({ updated_at: { $gt: null } })
    .partialIndex({
      type: 'file',
      trashed: false,
      dir_id: { $nin: [SHARED_DRIVES_DIR_ID, TRASH_DIR_ID] }
    })
    .indexFields(['updated_at'])
    .sortBy([{ updated_at: 'desc' }])
    .limitBy(50)
export const recentQueryAs = 'recent-view-query'

// All files and folders marked favourite (`cozyMetadata.favorite === true`),
// sorted by name — mirrors twake-drive-web's buildFavoritesQuery.
//
// Offline/local gotcha: cozy-pouch-link/PouchDB only matches the NESTED
// `cozyMetadata.favorite` field when that exact path is an INDEX field. A
// partialIndex on it, or a bare `where` selector without indexing it, returns 0
// even when favourites exist (verified on-device: 4/18 root folders were
// favourite, those queries returned 0). So the flag goes in `indexFields` (and,
// to satisfy the index prefix, first in `sortBy`). The first run builds the index
// over the local DB (one-off, ~tens of seconds on a large drive); it is then
// persisted, so later loads are fast.
export const favoritesQuery = (): QueryDefinition =>
  Q('io.cozy.files')
    .where({ 'cozyMetadata.favorite': true })
    .indexFields(['cozyMetadata.favorite', 'name'])
    .sortBy([{ 'cozyMetadata.favorite': 'asc' }, { name: 'asc' }])
    .limitBy(100)
export const favoritesQueryAs = 'favorites-view-query'

// Trash: same two-query split as `folderSubfoldersQuery` / `folderFilesQuery`,
// mirroring twake-drive-web's `buildTrashQuery`. Two queries (dirs + files)
// share the same `[dir_id, type, name]` index as the regular folder listing,
// so the trash screen reuses the index pouch-find already built for the
// files screen — no extra scan, no slowness on a populated trash.
//
// Pagination / infinite-scroll is a follow-up; for now the limit matches
// web's default of 100 per page (web paginates).
export const trashFoldersQuery = (): QueryDefinition => buildDriveQuery(TRASH_DIR_ID, 'directory')
export const trashFoldersQueryAs = 'io.cozy.files/trash/folders'

export const trashFilesQuery = (): QueryDefinition => buildDriveQuery(TRASH_DIR_ID, 'file')
export const trashFilesQueryAs = 'io.cozy.files/trash/files'

export const fileByIdQuery = (id: string): QueryDefinition => Q('io.cozy.files').getById(id)
export const fileByIdQueryAs = (id: string): string => `io.cozy.files/${id}`

export const filesByIdsQuery = (ids: string[]): QueryDefinition =>
  Q('io.cozy.files')
    .getByIds(ids)
    .sortBy([{ type: 'asc' }, { name: 'asc' }])
export const filesByIdsQueryAs = (ids: string[]): string => `io.cozy.files/byIds/${ids.join('-')}`

// Reachable contacts: those that have at least one email or one cozy URL and
// are not trashed. Mirrors cozy-sharing's `buildReachableContactsQuery` so the
// mobile autocomplete uses the same dataset as the web ShareAutosuggest.
export const reachableContactsQuery = (): QueryDefinition =>
  Q('io.cozy.contacts')
    .where({ _id: { $gt: null } })
    .partialIndex({
      trashed: { $or: [{ $eq: false }, { $exists: false }] },
      $or: [{ cozy: { $not: { $size: 0 } } }, { email: { $not: { $size: 0 } } }]
    })
    .indexFields(['_id'])
    .limitBy(1000)

export const reachableContactsQueryAs = 'io.cozy.contacts/reachable'

export interface ContactQueryResult {
  _id: string
  _type: string
  fullname?: string
  name?: { givenName?: string; familyName?: string }
  email?: { address: string; primary?: boolean; type?: string }[]
  cozy?: { url: string; primary?: boolean }[]
}
