import { buildSearchPattern } from '@/search/buildSearchPattern'

// Max results requested from the stack per search.
export const FILE_SEARCH_LIMIT = 50

export interface FileSearchFindRequest {
  selector: {
    name: { $regex: string }
    trashed: boolean
  }
  limit: number
}

/**
 * Build the body for the cozy-stack Mango `_find` on `io.cozy.files`.
 *
 * Search runs SERVER-SIDE, not against the local PouchDB: the offline replica of
 * `io.cozy.files` can be hundreds of MB, and a `$regex` "contains" match has no
 * index-usable condition — running it locally forces pouchdb-find to load the whole
 * collection into memory, and the OS OOM-kills the app. The stack evaluates the same
 * `$regex` against its own store and returns only the matches.
 *
 * `$regex` is a serialization-safe STRING with case-insensitivity encoded per ASCII
 * letter as `[aA]` (see `buildSearchPattern`) — sent as JSON to the stack.
 */
export const buildFileSearchFindRequest = (term: string): FileSearchFindRequest => ({
  selector: {
    name: { $regex: buildSearchPattern(term) },
    trashed: false
  },
  limit: FILE_SEARCH_LIMIT
})
