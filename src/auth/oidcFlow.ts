import { openAuthorizeInWebView } from './FlagshipAuthModal'
import { OidcCallback, UserCancelledError } from './types'

export const parseCallbackUrl = (callbackUrl: string): OidcCallback => {
  const url = new URL(callbackUrl)
  const fqdn = url.searchParams.get('fqdn')
  const code = url.searchParams.get('code')
  const defaultRedirection = url.searchParams.get('default_redirection')

  if (!fqdn) throw new Error('Callback URL missing fqdn')
  if (!code) throw new Error('Callback URL missing code')

  return { fqdn, code, defaultRedirection }
}

export const startOidcFlow = async (loginUri: URL): Promise<OidcCallback> => {
  // Run the OIDC login inside the in-app WebView (not the system browser) so the
  // LemonLDAP session cookie lands in the shared WebView cookie jar. The editors
  // (Docs, OnlyOffice, Notes) render in react-native-webview with that same shared
  // jar, so a later Twake Docs open finds the SSO cookie already present instead of
  // prompting a second LemonLDAP login. The manager's `redirect_after_oidc=cozy://`
  // is captured by the modal's onShouldStartLoadWithRequest (no Android intent
  // dialog). The flagship email-code certification that follows in registerSession
  // still runs in the system browser (openAuthorizeUrl) — it is session_code-based
  // and needs no LemonLDAP cookie.
  console.log('[oidcFlow] opening login in WebView', loginUri.toString())
  let redirectUrl: string
  try {
    redirectUrl = await openAuthorizeInWebView(loginUri.toString())
  } catch (e) {
    // The modal only rejects when the user closes it before a cozy:// redirect is
    // captured → treat as a cancel so the login screen suppresses the error toast.
    console.log('[oidcFlow] login webview closed', (e as Error).message)
    throw new UserCancelledError()
  }
  console.log('[oidcFlow] login redirect captured')
  return parseCallbackUrl(redirectUrl)
}
