import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from 'cozy-client'

import { HIDDEN_ROOT_DIR_IDS, FileQueryResult } from '@/client/queries'
import { buildFileSearchFindRequest } from '@/search/fileSearchRequest'

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
    stack
      .fetchJSON('POST', '/data/io.cozy.files/_find', buildFileSearchFindRequest(term))
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
  }, [client, term, enabled, reloadToken])

  return { ...state, reload }
}
