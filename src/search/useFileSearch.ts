import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from 'cozy-client'

import { HIDDEN_ROOT_DIR_IDS, FileQueryResult } from '@/client/queries'
import { buildFilePageFindRequest, FILE_SEARCH_PAGE_SIZE } from '@/search/fileSearchRequest'

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface FileSearchState {
  status: SearchStatus
  data: FileQueryResult[]
  error: unknown
  reload: () => void
}

/** Maximum number of matches surfaced to the UI. */
const FILE_SEARCH_RESULT_LIMIT = 100

/**
 * Safety cap: at 1000 docs/page this scans up to 40 000 files before giving up.
 * A real Drive of that size will usually hit RESULT_LIMIT first.
 */
const FILE_SEARCH_MAX_PAGES = 40

interface StackFindResponse {
  docs?: FileQueryResult[]
  /** Opaque cursor returned by cozy-stack for the next page. */
  bookmark?: string
  /**
   * `true` when cozy-stack has more results beyond this page.
   * Absent in older stacks — fall back to `docs.length === PAGE_SIZE`.
   */
  next?: boolean
}

interface MinimalStackClient {
  fetchJSON: (method: string, path: string, body: unknown) => Promise<StackFindResponse>
}

/**
 * Robust "contains" filename search via paginated, index-backed server queries.
 *
 * Each page hits `/data/io.cozy.files/_find` with `{ name: { $gt: null } }` —
 * the same indexed sentinel as `buildDriveQuery` in queries.ts — so cozy-stack
 * uses the `name` index and returns each page fast, without a full-collection scan.
 * Client-side `.includes()` filters "contains" per page (bounded memory, no OOM).
 * Matches are surfaced incrementally after each page so the UI shows results early.
 *
 * Out-of-order responses are dropped via a monotonic request id so fast typing
 * never leaves a stale result on screen.
 *
 * Idle when `enabled` is false (caller sets this when the search term is empty).
 */
export function useFileSearch(term: string, enabled: boolean): FileSearchState {
  const client = useClient()
  const [state, setState] = useState<{
    status: SearchStatus
    data: FileQueryResult[]
    error: unknown
  }>({
    status: 'idle',
    data: [],
    error: null
  })
  const [reloadToken, setReloadToken] = useState(0)
  const reqId = useRef(0)
  const reload = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    if (!client || !enabled) {
      setState({ status: 'idle', data: [], error: null })
      return
    }

    const id = ++reqId.current
    setState(prev => ({ status: 'loading', data: prev.data, error: null }))

    const termLower = term.toLowerCase()
    const stack = client.getStackClient() as unknown as MinimalStackClient

    const run = async (): Promise<void> => {
      const matches: FileQueryResult[] = []
      let bookmark: string | undefined
      let pages = 0

      while (pages < FILE_SEARCH_MAX_PAGES && matches.length < FILE_SEARCH_RESULT_LIMIT) {
        const res = await stack.fetchJSON(
          'POST',
          '/data/io.cozy.files/_find',
          buildFilePageFindRequest(bookmark)
        )

        // Drop stale responses (user typed a new term or reloaded)
        if (id !== reqId.current) return

        const docs = res.docs ?? []

        const filtered = docs.filter(
          d =>
            !d.trashed &&
            !HIDDEN_ROOT_DIR_IDS.includes(d._id) &&
            d.name?.toLowerCase().includes(termLower)
        )
        matches.push(...filtered)

        // Surface matches incrementally — results appear as each page lands
        setState({
          status: 'loading',
          data: matches.slice(0, FILE_SEARCH_RESULT_LIMIT),
          error: null
        })

        pages++

        // Determine whether cozy-stack has more pages:
        //   - prefer the explicit `next` boolean when the stack provides it
        //   - fall back to "page was full" heuristic for older stacks
        const hasMore =
          typeof res.next === 'boolean' ? res.next : docs.length === FILE_SEARCH_PAGE_SIZE

        if (!hasMore || !res.bookmark) break
        bookmark = res.bookmark
      }

      if (id !== reqId.current) return
      setState({ status: 'success', data: matches.slice(0, FILE_SEARCH_RESULT_LIMIT), error: null })
    }

    run().catch((err: unknown) => {
      if (id !== reqId.current) return
      setState({ status: 'error', data: [], error: err })
    })
  }, [client, term, enabled, reloadToken])

  return { ...state, reload }
}
