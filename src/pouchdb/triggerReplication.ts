import CozyClient from 'cozy-client'
import PouchLink from 'cozy-pouch-link'
import Minilog from 'cozy-minilog'

const log = Minilog('PouchReplication')

/**
 * Triggers a pouch replication.
 *
 * @param client    Cozy client (may be undefined; no-op).
 * @param doctype   Optional doctype hint. v1: informational only (the link replicates all
 *                  configured doctypes). The arg exists so mutation sites can declare WHICH
 *                  doctype they touched — useful for telemetry today, per-doctype sync later.
 * @param opts      `immediate: true` → bypasses the 60s debounce. Default false (debounced).
 */
export const triggerPouchReplication = (
  client?: CozyClient,
  doctype?: string,
  opts: { immediate?: boolean } = {}
): void => {
  const pouchLink = getPouchLink(client)
  if (!pouchLink) return
  if (opts.immediate) {
    log.debug('startReplication (immediate)', doctype ?? '')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    ;(pouchLink as any).startReplication()
  } else {
    log.debug('startReplicationWithDebounce', doctype ?? '')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    ;(pouchLink as any).startReplicationWithDebounce()
  }
}

export const getPouchLink = (client?: CozyClient): PouchLink | null => {
  if (!client) return null
  return (client.links.find(l => l instanceof PouchLink) as PouchLink | undefined) ?? null
}
