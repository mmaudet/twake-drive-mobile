import CozyClient, { CozyLink, Q, StackLink } from 'cozy-client'
import PouchLink from 'cozy-pouch-link'
import { createMMKV } from 'react-native-mmkv'

import { platformReactNative } from './platformReactNative'

export const REPLICATION_DEBOUNCE = 60 * 1000 // 60s
export const REPLICATION_DEBOUNCE_MAX_DELAY = 5 * 60 * 1000 // 5min
// Periodic background sync: 30s — matches cozy-pouch-link's default.
// Combined with the foreground-trigger (useForegroundSync) and per-mutation
// triggers, this keeps the local cache fresh enough that remote edits show
// up within ~30s even without user interaction.
export const PERIODIC_SYNC_INTERVAL_MS = 30 * 1000

// Only doctypes that the user actually browses offline. io.cozy.sharings,
// io.cozy.permissions, io.cozy.notes were initially included but their
// initial replication hangs on fetchRemoteLastSequence — and the data is
// only useful online anyway (share sheet, viewers). They go directly to
// StackLink.
export const offlineDoctypes = ['io.cozy.files', 'io.cozy.contacts'] as const

// Warmup queries are GATES: until they complete on the first replication
// loop, every query for the doctype is FORWARDED to the next link (StackLink)
// instead of being served from (possibly empty) local Pouch. After warmup,
// queries are served from local Pouch. Without warmupQueries, PouchLink would
// serve queries immediately — returning partial or empty results during the
// initial replication, which the UI then caches forever.
//
// Shape required by cozy-pouch-link (see CozyPouchLink.spec.js + PouchManager.spec.js):
//   { definition: () => QueryDefinition, options: { as: string } }
//
// A trivial gate to keep the local-vs-stack decision triggered. The
// definition shape doesn't matter for the gating itself.
const buildGateWarmupQuery = (doctype: string): unknown => ({
  definition: () => Q(doctype).limitBy(1),
  options: { as: `${doctype}/warmup` }
})

// Extra warmup queries for `io.cozy.files` that pre-build the pouch-find
// indexes the app actually uses. Without this, the first time the user
// opens a screen (e.g. Recent), pouch-find lazily builds the index by
// scanning every doc — visible as a several-second freeze on the first
// view. With this, the index exists by the time the user gets there.
//
// Shape of each entry mirrors what cozy-pouch-link tests expect:
//   { definition: () => QueryDefinition, options: { as: string } }
const filesIndexWarmupQueries: unknown[] = [
  // Recent view (sort by updated_at)
  {
    definition: () =>
      Q('io.cozy.files')
        .where({ updated_at: { $gt: null } })
        .indexFields(['updated_at'])
        .sortBy([{ updated_at: 'desc' }])
        .limitBy(1),
    options: { as: 'io.cozy.files/warmup/recent' }
  },
  // Folder listing (sort by dir_id + type + name) — covers files screen
  // and trash screen which share the same indexFields.
  {
    definition: () =>
      Q('io.cozy.files')
        .where({ dir_id: { $gt: null } })
        .indexFields(['dir_id', 'type', 'name'])
        .sortBy([{ dir_id: 'asc' }, { type: 'asc' }, { name: 'asc' }])
        .limitBy(1),
    options: { as: 'io.cozy.files/warmup/folder' }
  }
]

const doctypesReplicationOptions = Object.fromEntries(
  offlineDoctypes.map(dt => [
    dt,
    {
      strategy: 'fromRemote' as const,
      warmupQueries:
        dt === 'io.cozy.files'
          ? [buildGateWarmupQuery(dt), ...filesIndexWarmupQueries]
          : [buildGateWarmupQuery(dt)]
    }
  ])
)

// Aliases the current config expects to find as "warmed up" in MMKV. If we
// add new warmup queries between releases, areQueriesWarmedUp() rejects users
// whose prior session only marked the old aliases — and offline they can't
// re-run the warmup (which is fromRemote). Backfill missing aliases for
// doctypes whose gate alias is already persisted: that means the user had a
// successful prior session, so pouch is populated and indexes will lazy-build
// on first query via pouch-find. New installs are untouched (no gate alias =
// no backfill = warmup runs normally on first online sync).
const PERSISTED_WARMUP_KEY = 'cozy-client-pouch-link-warmupedqueries'
const expectedAliasesByDoctype = (): Record<string, string[]> => {
  const out: Record<string, string[]> = {}
  for (const [doctype, opts] of Object.entries(doctypesReplicationOptions)) {
    out[doctype] = (opts.warmupQueries as Array<{ options: { as: string } }>).map(q => q.options.as)
  }
  return out
}

const backfillWarmupAliases = (): void => {
  let storage: ReturnType<typeof createMMKV>
  try {
    storage = createMMKV({ id: 'pouchdb-meta' })
  } catch {
    return
  }
  const raw = storage.getString(PERSISTED_WARMUP_KEY)
  if (!raw) return
  let parsed: Record<string, string[]>
  try {
    parsed = JSON.parse(raw) as Record<string, string[]>
  } catch {
    return
  }
  const expected = expectedAliasesByDoctype()
  let changed = false
  for (const [doctype, aliases] of Object.entries(expected)) {
    if (!Array.isArray(parsed[doctype]) || parsed[doctype].length === 0) continue
    for (const alias of aliases) {
      if (!parsed[doctype].includes(alias)) {
        parsed[doctype].push(alias)
        changed = true
      }
    }
  }
  if (changed) storage.set(PERSISTED_WARMUP_KEY, JSON.stringify(parsed))
}

export const getLinks = (): CozyLink[] => {
  backfillWarmupAliases()
  const pouchLink = new PouchLink({
    doctypes: [...offlineDoctypes],
    initialSync: false,
    periodicSync: true,
    replicationInterval: PERIODIC_SYNC_INTERVAL_MS,
    syncDebounceDelayInMs: REPLICATION_DEBOUNCE,
    syncDebounceMaxDelayInMs: REPLICATION_DEBOUNCE_MAX_DELAY,
    platform: platformReactNative,
    ignoreWarmup: false,
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
