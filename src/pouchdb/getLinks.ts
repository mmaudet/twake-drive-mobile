import CozyClient, { CozyLink, StackLink } from 'cozy-client'
import PouchLink from 'cozy-pouch-link'

import { platformReactNative } from './platformReactNative'

export const REPLICATION_DEBOUNCE = 60 * 1000 // 60s
export const REPLICATION_DEBOUNCE_MAX_DELAY = 5 * 60 * 1000 // 5min
// Periodic background sync: 60s. cozy-pouch-link's default is 30s; we double
// it because drive metadata doesn't move fast enough to justify polling twice
// a minute.
export const PERIODIC_SYNC_INTERVAL_MS = 60 * 1000

export const offlineDoctypes = [
  'io.cozy.files',
  'io.cozy.sharings',
  'io.cozy.permissions',
  'io.cozy.notes',
  'io.cozy.contacts'
] as const

const doctypesReplicationOptions = Object.fromEntries(
  offlineDoctypes.map(dt => [dt, { strategy: 'fromRemote' as const }])
)

export const getLinks = (): CozyLink[] => {
  const pouchLink = new PouchLink({
    doctypes: [...offlineDoctypes],
    initialSync: false,
    periodicSync: true,
    replicationInterval: PERIODIC_SYNC_INTERVAL_MS,
    syncDebounceDelayInMs: REPLICATION_DEBOUNCE,
    syncDebounceMaxDelayInMs: REPLICATION_DEBOUNCE_MAX_DELAY,
    platform: platformReactNative,
    ignoreWarmup: true,
    doctypesReplicationOptions,
    pouch: {
      options: {
        adapter: 'react-native-sqlite'
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  const stackLink = new StackLink()

  // PouchLink first → it intercepts queries for cached doctypes before StackLink.
  return [pouchLink as unknown as CozyLink, stackLink]
}

export const resetLinks = async (client?: CozyClient): Promise<void> => {
  if (!client) return
  for (const link of client.links) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await (link as { reset?: () => Promise<void> }).reset?.()
  }
}
