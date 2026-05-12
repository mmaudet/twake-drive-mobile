import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useClient } from 'cozy-client'

import { triggerPouchReplication } from './triggerReplication'

/**
 * On every transition back to foreground:
 *   1. Force a fresh NetInfo reachability check via `NetInfo.refresh()`.
 *      iOS pauses URL sessions when the app is backgrounded, so the
 *      periodic reachability poll can be stale on return — the offline
 *      banner stays visible until something triggers a re-check.
 *   2. Trigger an immediate pouch replication. Periodic sync runs every
 *      30 s in the background but is paused when the app is suspended;
 *      a remote change made while the user was on another app would
 *      otherwise be invisible until the next periodic tick.
 *
 * Mount once in the drive layout (inside the cozy-client provider).
 */
export const useForegroundSync = (): void => {
  const client = useClient()
  const prevState = useRef<AppStateStatus>(AppState.currentState)
  useEffect(() => {
    if (!client) return
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasInactive = prevState.current.match(/inactive|background/)
      prevState.current = next
      if (wasInactive && next === 'active') {
        void NetInfo.refresh()
        triggerPouchReplication(client, undefined, { immediate: true })
      }
    })
    return () => sub.remove()
  }, [client])
}
