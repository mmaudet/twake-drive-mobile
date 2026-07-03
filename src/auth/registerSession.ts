import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import CozyClient from 'cozy-client'

import { APP_SCOPES, APP_SCOPE_STRING } from './scopes'
import { OidcCallback, Session, OAuthOptions, OAuthToken, UserCancelledError } from './types'

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

const generatePkce = async (): Promise<{ codeVerifier: string; codeChallenge: string }> => {
  const verifierBytes = Crypto.getRandomBytes(32)
  const codeVerifier = base64UrlEncode(verifierBytes)
  const challengeB64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  )
  const codeChallenge = challengeB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return { codeVerifier, codeChallenge }
}

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

const normalizeRedirectUrl = (raw: string): string => {
  let url = raw
  if (url.startsWith('cozy:?')) url = url.replace('cozy:?', 'cozy://?')
  url = url.replace(/%23$/i, '').replace(/#$/, '')
  return url
}

const openAuthorizeUrl = async (url: string): Promise<string> => {
  console.log('[registerSession] opening authorize URL', url)
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URL, {
    showInRecents: false
  })
  console.log('[registerSession] authorize result', JSON.stringify(result))
  if (result.type === 'success' && result.url) {
    const cleaned = normalizeRedirectUrl(result.url)
    if (cleaned !== result.url) console.log('[registerSession] cleaned URL', cleaned)
    return cleaned
  }
  throw new UserCancelledError()
}

export const registerSession = async (callback: OidcCallback): Promise<Session> => {
  const uri = `https://${callback.fqdn}`
  console.log('[registerSession] init client', uri)

  const client = new CozyClient({
    uri,
    oauth: buildOauthOptions(),
    // `scope` is absent from cozy-client's ClientOptions type but accepted at
    // runtime to request specific OAuth doctype scopes (see @/auth/scopes).
    scope: [...APP_SCOPES],
    appMetadata: { slug: 'twake-drive-mobile', version: '0.1.0' }
  } as ConstructorParameters<typeof CozyClient>[0] & { scope: string[] })

  const stackClient = client.getStackClient()
  try {
    stackClient.setUri(uri)
    await stackClient.register(uri)
  } catch (e) {
    console.error('[registerSession] register failed', (e as Error).message, e)
    throw e
  }

  const oauthOptions = stackClient.oauthOptions as OAuthOptions
  console.log('[registerSession] oauth client registered', oauthOptions.clientID)

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
