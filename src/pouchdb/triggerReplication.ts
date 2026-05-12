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
 * @param opts      Accepted for backward compatibility with prior callers — but ignored.
 *                  cozy-pouch-link refuses to debounce when `periodicSync: true` (it throws
 *                  `createDebounceableReplication cannot be called when periodic sync is
 *                  configured`), so every trigger calls `startReplication()` directly.
 */
export const triggerPouchReplication = (
  client?: CozyClient,
  doctype?: string,
  _opts: { immediate?: boolean } = {}
): void => {
  const pouchLink = getPouchLink(client)
  if (!pouchLink) {
    console.warn('[triggerPouchReplication] no PouchLink in chain, skipping', { doctype })
    return
  }
  console.log('[triggerPouchReplication] startReplication', { doctype })
  log.debug('startReplication', doctype ?? '')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
  ;(pouchLink as any).startReplication()
}

export const getPouchLink = (client?: CozyClient): PouchLink | null => {
  if (!client) return null
  return (client.links.find(l => l instanceof PouchLink) as PouchLink | undefined) ?? null
}
