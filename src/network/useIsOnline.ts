import { useEffect, useState } from 'react'
import { useClient } from 'cozy-client'

import { getOnlineMonitor } from './OnlineMonitor'

/**
 * Reactive online/offline boolean for UI gating.
 *
 * Thin React wrapper around the singleton `OnlineMonitor` so the same
 * source of truth is shared between React components (via this hook) and
 * non-React modules (e.g. the offline `Downloader`).
 */
export const useIsOnline = (): boolean => {
  const client = useClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const probeUri = (client as any)?.getStackClient?.().uri as string | undefined
  const monitor = getOnlineMonitor(probeUri)
  const [online, setOnline] = useState<boolean>(monitor.getCurrent())
  useEffect(() => {
    setOnline(monitor.getCurrent())
    return monitor.subscribe(setOnline)
  }, [monitor])
  return online
}
