import CozyClient from 'cozy-client'
import flag from 'cozy-flags'

import { APP_SCOPES } from '@/auth/scopes'
import { Session } from '@/auth/types'
import { configureNetInfo } from '@/network/netInfoConfig'
import { getLinks } from '@/pouchdb/getLinks'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

/**
 * Build a CozyClient from a stored session.
 *
 * Resilient to offline cold-starts: each network-touching step is wrapped
 * in a try/catch and logged. The client is ALWAYS returned, fully wired
 * with the PouchLink chain. Queries served from local Pouch keep working;
 * once the network is back, periodic sync (cozy-pouch-link) re-attempts
 * replication on its own.
 *
 * Without this resilience, a cold-start while offline would crash in
 * `client.login()` or `registerPlugin(flag.plugin)` and the bootstrap
 * path in useAuth would fall back to the login screen — even though the
 * user has a perfectly valid stored token.
 */
export const createClient = async (session: Session): Promise<CozyClient> => {
  console.log(
    '[createClient] uri',
    session.uri,
    'clientID',
    session.oauthOptions.clientID,
    'tokenLen',
    session.token.accessToken?.length ?? 0
  )
  const client = new CozyClient({
    uri: session.uri,
    oauth: { ...session.oauthOptions, token: session.token },
    // `scope` is absent from cozy-client's ClientOptions type but accepted at
    // runtime to request specific OAuth doctype scopes (see @/auth/scopes).
    scope: [...APP_SCOPES],
    appMetadata: {
      slug: 'twake-drive-mobile',
      version: '0.1.0'
    },
    links: getLinks()
  } as ConstructorParameters<typeof CozyClient>[0] & { scope: string[] })

  try {
    await client.registerPlugin(flag.plugin, null)
  } catch (err) {
    // cozy-flags fetches the flag manifest on registration; offline, the
    // fetch fails. Log + move on — features stay at their default values.
    console.warn('[createClient] flag plugin registration failed', err)
  }

  // CRITICAL: client.login() fires link.onLogin() which initializes PouchManager.
  // Without this call, the local SQLite DB is never created and queries hang.
  // cozy-client's .d.ts types token as string, but for OAuth clients the runtime
  // accepts the full OAuthToken object — cast to bypass the inaccurate type.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.login({ uri: session.uri, token: session.token } as any)
  } catch (err) {
    // Offline, login may fail (OAuth token refresh / handshake). PouchManager
    // is initialized as a side effect of onLogin; if that failed too, queries
    // for replicated doctypes will fall back to StackLink — also broken offline
    // — but the UI still renders with whatever cached data Pouch already has.
    console.warn('[createClient] client.login failed (offline?)', err)
  }

  // Kick off the initial sync after login (non-blocking, immediate — no debounce).
  // Safe to call even if login above failed; the helper handles a missing
  // PouchLink chain gracefully.
  triggerPouchReplication(client, undefined, { immediate: true })

  // Point NetInfo's reachability ping at the user's own cozy-stack instance
  // so the offline banner reflects "can I talk to my cozy?" rather than
  // arbitrary internet connectivity.
  configureNetInfo(session.uri)

  return client
}
