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

// Recent files: an index-backed top-N over `updated_at`.
//
// Perf gotcha (fixed here): a `.partialIndex(...)` makes cozy-pouch-link derive
// a DIFFERENT index name (`by_updated_at_filter_(...)`) than the one the
// replication warmup pre-builds (`by_updated_at`, src/pouchdb/getLinks.ts). On
// first open pouch-find then can't find the requested index and lazily rebuilds
// it over the WHOLE local replica — a ~1-minute UI freeze. Dropping the
// partialIndex makes the requested index name match the warmup, so opening
// Récents is a bounded top-N scan of an already-built index. We over-fetch and
// drop non-file / trashed / hidden-system-dir rows client-side in the screen
// (same shape as the search feature).
export const recentQuery = (): QueryDefinition =>
  Q('io.cozy.files')
    .where({ updated_at: { $gt: null } })
    .indexFields(['updated_at'])
    .sortBy([{ updated_at: 'desc' }])
    .limitBy(200)
export const recentQueryAs = 'recent-view-query'

// Files and folders marked favourite (`cozyMetadata.favorite === true`).
//
// Offline/local gotcha: cozy-pouch-link/pouchdb-find does NOT reliably enforce
// a `$eq: true` selector on the NESTED `cozyMetadata.favorite` path in the local
// replica — the `where` filter fails OPEN and the query returns every file
// (which is why the Favoris tab used to list all folders). The nested field is
// still usable as an index/sort key, so we sort favourites FIRST (desc → `true`
// leads) to keep them inside the window, over-fetch, and filter authoritatively
// CLIENT-SIDE with `isFavorite` (strict `=== true`) in the Favoris screen.
export const favoritesQuery = (): QueryDefinition =>
  Q('io.cozy.files')
    .where({ 'cozyMetadata.favorite': true })
    .indexFields(['cozyMetadata.favorite', 'name'])
    .sortBy([{ 'cozyMetadata.favorite': 'desc' }, { name: 'asc' }])
    .limitBy(200)
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

// Filename search is server-side now (src/search/useFileSearch.ts →
// cozy-stack `_find`), not a local PouchDB query: scanning the multi-hundred-MB
// offline replica with a $regex OOM-kills the app. HIDDEN_ROOT_DIR_IDS is still
// used there to drop the virtual root dirs from results.
