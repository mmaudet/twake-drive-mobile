import CozyClient from 'cozy-client'

import { APP_SCOPES, APP_SCOPE_STRING } from './scopes'
import { OidcCallback, Session, OAuthOptions, OAuthToken } from './types'
import { generatePkce, openAuthorizeUrl } from './pkce'

interface OidcResponse {
  session_code?: string
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
}

const REDIRECT_URL = 'cozy://'

const buildOauthOptions = (): Omit<OAuthOptions, 'clientID' | 'clientSecret'> => ({
  clientName: 'Twake Drive Mobile',
  softwareID: 'twake-drive-mobile',
  redirectURI: REDIRECT_URL,
  clientKind: 'mobile',
  clientURI: 'https://twake.app',
  scopes: [...APP_SCOPES]
})

export const registerSession = async (
  callback: OidcCallback,
  existing?: OAuthOptions
): Promise<Session> => {
  const uri = `https://${callback.fqdn}`
  console.log(
    '[registerSession] init client',
    uri,
    existing?.clientID ? '(reuse client)' : '(new client)'
  )

  const client = new CozyClient({
    uri,
    oauth: existing ?? buildOauthOptions(),
    // `scope` is absent from cozy-client's ClientOptions type but accepted at
    // runtime to request specific OAuth doctype scopes (see @/auth/scopes).
    scope: [...APP_SCOPES],
    appMetadata: { slug: 'twake-drive-mobile', version: '0.1.0' }
  } as ConstructorParameters<typeof CozyClient>[0] & { scope: string[] })

  const stackClient = client.getStackClient()
  stackClient.setUri(uri)

  if (existing?.clientID) {
    // Reuse stored registration — skip register() which throws if already registered
    // and would create a new client_id (dropping any flagship flag on the old one).
    stackClient.setOAuthOptions(existing)
    console.log('[registerSession] reusing existing client', existing.clientID)
  } else {
    try {
      await stackClient.register(uri)
    } catch (e) {
      console.error('[registerSession] register failed', (e as Error).message, e)
      throw e
    }
  }

  const oauthOptions = stackClient.oauthOptions as OAuthOptions
  console.log('[registerSession] oauth client ready', oauthOptions.clientID)

  let oidcResponse: OidcResponse
  try {
    oidcResponse = (await stackClient.fetchJSON('POST', '/oidc/access_token', {
      code: callback.code,
      client_id: oauthOptions.clientID,
      client_secret: oauthOptions.clientSecret,
      scope: APP_SCOPE_STRING
    })) as OidcResponse
  } catch (e) {
    console.error('[registerSession] /oidc/access_token failed', (e as Error).message, e)
    throw e
  }
  console.log('[registerSession] oidc response keys', Object.keys(oidcResponse).join(','))

  let token: OAuthToken

  if (oidcResponse.access_token) {
    token = {
      accessToken: oidcResponse.access_token,
      refreshToken: oidcResponse.refresh_token ?? '',
      tokenType: oidcResponse.token_type ?? 'bearer',
      scope: oidcResponse.scope ?? APP_SCOPE_STRING
    }
  } else if (oidcResponse.session_code) {
    console.log('[registerSession] session_code received, going through /auth/authorize')
    const pkceCodes = await generatePkce()
    console.log('[registerSession] pkce ready, challenge len', pkceCodes.codeChallenge.length)
    const authorizeResult = (await client.authorize({
      sessionCode: oidcResponse.session_code,
      pkceCodes,
      openURLCallback: openAuthorizeUrl
    })) as { token: OAuthToken & { tokenType?: string } }
    console.log(
      '[registerSession] authorize complete, tokenLen',
      authorizeResult.token?.accessToken?.length ?? 0
    )
    token = {
      accessToken: authorizeResult.token.accessToken,
      refreshToken: authorizeResult.token.refreshToken,
      tokenType: authorizeResult.token.tokenType ?? 'bearer',
      scope: authorizeResult.token.scope ?? APP_SCOPE_STRING
    }
  } else {
    throw new Error(
      `OIDC response had neither access_token nor session_code. Keys: ${Object.keys(oidcResponse).join(',')}`
    )
  }

  return { uri, oauthOptions, token }
}
