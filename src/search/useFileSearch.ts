import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from 'cozy-client'

import { HIDDEN_ROOT_DIR_IDS, FileQueryResult } from '@/client/queries'
import { buildFileSearchFindRequest } from '@/search/fileSearchRequest'

// A stack _find with a $regex has no server-side index, so a rare term can make
// couchdb scan the whole collection before answering. Cap the wait so the UI never
// sits on an infinite spinner; superseded / typed-over requests are dropped via reqId.
const SEARCH_TIMEOUT_MS = 15000

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface FileSearchState {
  status: SearchStatus
  data: FileQueryResult[]
  error: unknown
  reload: () => void
}

interface StackFindResponse {
  docs?: FileQueryResult[]
}

interface MinimalStackClient {
  fetchJSON: (method: string, path: string, body: unknown) => Promise<StackFindResponse>
}

/**
 * Server-side filename search against the cozy-stack Mango `_find`.
 *
 * Deliberately NOT a cozy-client `useQuery`: that routes through PouchLink and runs
 * the `$regex` against the local replica, which OOM-kills the app on a large Drive
 * (see fileSearchRequest.ts). Here we call the stack directly so the phone never
 * scans the whole collection. Requires connectivity; the file browser stays offline.
 *
 * Out-of-order responses are dropped via a monotonic request id, so fast typing can't
 * leave a stale result on screen.
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

    const stack = client.getStackClient() as unknown as MinimalStackClient
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('search request timed out')), SEARCH_TIMEOUT_MS)
    })

    Promise.race([
      stack.fetchJSON('POST', '/data/io.cozy.files/_find', buildFileSearchFindRequest(term)),
      timeout
    ])
      .then(res => {
        if (id !== reqId.current) return
        const docs = (res.docs ?? [])
          .filter(doc => !HIDDEN_ROOT_DIR_IDS.includes(doc._id))
          .sort((a, b) => a.name.localeCompare(b.name))
        setState({ status: 'success', data: docs, error: null })
      })
      .catch((err: unknown) => {
        if (id !== reqId.current) return
        setState({ status: 'error', data: [], error: err })
      })
      .finally(() => {
        if (timer) clearTimeout(timer)
      })

    // A new keystroke (or unmount) supersedes this request: reqId drops its result,
    // and clearing the timer stops a stale timeout from firing.
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [client, term, enabled, reloadToken])

  return { ...state, reload }
}
