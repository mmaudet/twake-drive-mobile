/**
 * Paginated page-fetch request builder for the cozy-stack Mango `_find` on `io.cozy.files`.
 *
 * Strategy: instead of a `$regex` contains query (which forces a full collection scan and
 * times out on large drives), we fetch pages sorted by `name` using the indexed sentinel
 * `name: { $gt: null }`.  Each page is fast (index-backed), bounded in memory, and the
 * client filters "contains" per page with `.includes()`.  See `useFileSearch.ts`.
 *
 * The `name: { $gt: null }` selector is the same sentinel used by `buildDriveQuery` in
 * queries.ts — it tells cozy-stack to apply the `name` index, avoiding a full scan.
 */
export const FILE_SEARCH_PAGE_SIZE = 1000

export interface FilePageFindRequest {
  selector: { name: { $gt: null } }
  fields: string[]
  sort: Array<Record<string, 'asc'>>
  limit: number
  bookmark?: string
}

export const buildFilePageFindRequest = (bookmark?: string): FilePageFindRequest => ({
  selector: { name: { $gt: null } },
  fields: ['_id', 'name', 'type', 'dir_id', 'size', 'mime', 'updated_at', 'trashed'],
  sort: [{ name: 'asc' }],
  limit: FILE_SEARCH_PAGE_SIZE,
  ...(bookmark ? { bookmark } : {})
})
