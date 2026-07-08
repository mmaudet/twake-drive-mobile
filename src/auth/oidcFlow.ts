import { openAuthorizeUrl } from './pkce'
import { OidcCallback } from './types'

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
  const redirectUrl = await openAuthorizeUrl(loginUri.toString())
  return parseCallbackUrl(redirectUrl)
}
