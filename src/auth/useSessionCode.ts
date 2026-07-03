import { useCallback, useRef } from 'react'
import { useClient } from 'cozy-client'

import { getSessionCode } from '@/files/cozyAppLink'
import { useAuth } from '@/auth/useAuth'

const isNotAuthorized = (e: unknown): boolean => /not authorized/i.test((e as Error)?.message ?? '')

/** Fetches a cozy session_code; on "Not authorized" (flagship cert lapsed)
 *  certifies once via the email-code flow then retries.
 *  The useRef guard ensures certification is attempted at most once per mount,
 *  preventing an infinite loop when certifyFlagship triggers a setState that
 *  re-runs the consuming screen's effect. */
export const useSessionCode = (): (() => Promise<string>) => {
  const client = useClient()
  const { certifyFlagship } = useAuth()
  const certifyAttempted = useRef(false)
  return useCallback(async () => {
    if (!client) throw new Error('No cozy client')
    try {
      return await getSessionCode(client)
    } catch (e) {
      if (!isNotAuthorized(e)) throw e
      if (certifyAttempted.current) throw e
      certifyAttempted.current = true
      const fresh = await certifyFlagship()
      return await getSessionCode(fresh)
    }
  }, [client, certifyFlagship])
}
