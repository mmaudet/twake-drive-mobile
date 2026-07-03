/**
 * Paginated page-fetch request builder for the cozy-stack Mango `_find` on `io.cozy.files`.
 *
 * Strategy: instead of a `$regex` contains query (which forces a full collection scan and
 * times out on large drives), we fetch pages using the indexed sentinel
 * `name: { $gt: null }` and paginate with the returned bookmark.  Each page is fast
 * (index-backed), bounded in memory, and the client filters "contains" per page with
 * `.includes()`.  See `useFileSearch.ts`.
 *
 * The `name: { $gt: null }` selector is the same sentinel used by `buildDriveQuery` in
 * queries.ts — it tells cozy-stack to apply the `name` index, avoiding a full scan.
 * NO `sort` is sent: cozy-stack rejects `sort:[{name:'asc'}]` with `no_usable_index`
 * ("No index exists for this sort") because the instance's `name` index is a partial
 * index that can serve the selector but not an explicit sort. Bookmark pagination does
 * not need a sort; the caller sorts the final matches client-side.
 */
export const FILE_SEARCH_PAGE_SIZE = 1000

export interface FilePageFindRequest {
  selector: { name: { $gt: null } }
  fields: string[]
  limit: number
  bookmark?: string
}

export const buildFilePageFindRequest = (bookmark?: string): FilePageFindRequest => ({
  selector: { name: { $gt: null } },
  fields: ['_id', 'name', 'type', 'dir_id', 'size', 'mime', 'updated_at', 'trashed'],
  limit: FILE_SEARCH_PAGE_SIZE,
  ...(bookmark ? { bookmark } : {})
})
