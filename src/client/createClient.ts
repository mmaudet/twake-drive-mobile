import CozyClient from 'cozy-client'
import flag from 'cozy-flags'

import { Session } from '@/auth/types'
import { getLinks } from '@/pouchdb/getLinks'

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
    scope: ['*'],
    appMetadata: {
      slug: 'twake-drive-mobile',
      version: '0.1.0'
    },
    links: getLinks()
  })

  await client.registerPlugin(flag.plugin, null)

  // CRITICAL: client.login() fires link.onLogin() which initializes PouchManager.
  // Without this call, the local SQLite DB is never created and queries hang.
  // cozy-client's .d.ts types token as string, but for OAuth clients the runtime
  // accepts the full OAuthToken object — cast to bypass the inaccurate type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.login({ uri: session.uri, token: session.token } as any)

  return client
}
