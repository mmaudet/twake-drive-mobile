import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useClient } from 'cozy-client'

import { triggerPouchReplication } from './triggerReplication'

/**
 * Trigger an immediate pouch replication every time the app returns to the
 * foreground. Periodic sync still runs in the background (every 30 s) but
 * relying on that alone means a remote change made while the user was on
 * another app may be invisible for up to 30 s after they switch back. With
 * the foreground trigger, the wait time is bounded by the round-trip
 * latency of one replication cycle.
 *
 * Mount once in the drive layout (anywhere inside the cozy-client provider).
 */
export const useForegroundSync = (): void => {
  const client = useClient()
  const prevState = useRef<AppStateStatus>(AppState.currentState)
  useEffect(() => {
    if (!client) {
      console.log('[useForegroundSync] no client yet, skipping setup')
      return
    }
    console.log('[useForegroundSync] mounted, current AppState=', AppState.currentState)
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = prevState.current
      const wasInactive = prev.match(/inactive|background/)
      prevState.current = next
      console.log('[useForegroundSync] AppState change', { prev, next, wasInactive: !!wasInactive })
      if (wasInactive && next === 'active') {
        console.log('[useForegroundSync] bg→active: triggering immediate sync')
        triggerPouchReplication(client, undefined, { immediate: true })
      }
    })
    return () => sub.remove()
  }, [client])
}
