/**
 * Flagship certification via cozy's email-code flow.
 *
 * The flow (all WebView-driven — no native UI for code entry):
 * 1. We call client.certifyFlagship() — attempts store attestation, silently
 *    fails (expected: no Play Integrity / AppAttest module available).
 * 2. We call client.authorize() which opens the authorize URL in a WebView via
 *    openAuthorizeUrl (expo-web-browser). Because the client is not yet certified
 *    flagship, the cozy-stack:
 *      a. Emails a 6-digit TOTP code to the instance owner.
 *      b. Renders an HTML code-entry form inside the WebView (the `token` HMAC
 *         blob is embedded as a hidden field — we never touch it natively).
 *      c. On correct code entry: POSTs /auth/clients/:id/flagship (WebView form),
 *         sets flagship:true in CouchDB, redirects back to the authorize page.
 *      d. Renders the "Accept" permissions page; on click, redirects to the app's
 *         redirect_uri (cozy://) with an auth code.
 * 3. client.authorize() captures the redirect, exchanges the code for a token
 *    with scope:* (using PKCE), and returns it.
 * 4. We return a new Session with the scope:* token; callers persist it and
 *    rebuild the CozyClient. Subsequent POST /auth/session_code succeeds.
 *
 * Reuse: we pass the stored client_id via setOAuthOptions so no re-registration
 * occurs (register() would create a new client that is not flagship).
 * The scope:* in the authorize URL comes from stackClient.scope which is set
 * to FLAGSHIP_SCOPES when the CozyClient is constructed with scope:[...FLAGSHIP_SCOPES].
 * (authorize() calls getAuthCodeURL({ scopes: undefined }), which falls back to
 * stackClient.scope — the value from the constructor, not oauthOptions.scopes.)
 */
import CozyClient from 'cozy-client'

import { FLAGSHIP_SCOPES } from './scopes'
import { Session, OAuthToken } from './types'
import { generatePkce } from './pkce'
import { openAuthorizeInWebView } from './FlagshipAuthModal'

export const certifyFlagship = async (session: Session): Promise<Session> => {
  const client = new CozyClient({
    uri: session.uri,
    oauth: { ...session.oauthOptions, token: session.token },
    // scope sets stackClient.scope; authorize() → getAuthCodeURL fallback uses it.
    scope: [...FLAGSHIP_SCOPES],
    appMetadata: { slug: 'twake-drive-mobile', version: '0.1.0' }
  } as ConstructorParameters<typeof CozyClient>[0] & { scope: string[] })

  const stackClient = client.getStackClient()
  stackClient.setUri(session.uri)
  // Restore stored credentials so isRegistered() returns true and
  // getAuthCodeURL includes the correct client_id / redirect_uri.
  stackClient.setOAuthOptions({ ...session.oauthOptions })

  // Attempt store attestation — expected to fail without native attestation
  // module; the error is swallowed so the email-code path can continue.
  try {
    await client.certifyFlagship()
  } catch {
    // no-op: expected on OIDC-only deployments without Play Integrity / AppAttest
  }

  const pkceCodes = await generatePkce()
  const authorizeResult = (await client.authorize({
    openURLCallback: openAuthorizeInWebView,
    pkceCodes
  })) as { token: OAuthToken & { tokenType?: string } }

  const t = authorizeResult.token
  return {
    uri: session.uri,
    oauthOptions: { ...session.oauthOptions, scopes: [...FLAGSHIP_SCOPES] },
    token: {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      tokenType: t.tokenType ?? 'bearer',
      scope: t.scope ?? '*'
    }
  }
}
