import { TwakeConfiguration } from './types'

export const extractDomain = (email: string): string | null => {
  if (!email) return null
  const trimmed = email.trim()
  const atIndex = trimmed.lastIndexOf('@')
  if (atIndex === -1) return null
  const domain = trimmed.substring(atIndex + 1)
  return domain.length > 0 ? domain : null
}

export const fetchTwakeConfiguration = async (
  domain: string
): Promise<TwakeConfiguration | null> => {
  const url = `https://${domain}/.well-known/twake-configuration`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    })
    if (!response.ok) return null
    return (await response.json()) as TwakeConfiguration
  } catch {
    return null
  }
}

const REDIRECT_SCHEME = 'cozy://'

// The Twake Workplace instance that hosts sign-up / sign-in (the consumer flow),
// as opposed to an organization's own server discovered from the email domain.
export const TWAKE_WORKPLACE_DOMAIN = 'signup.twake.app'

const buildLoginUri = (flagshipUri: string, extra?: Record<string, string>): URL | null => {
  try {
    const uri = new URL(flagshipUri)
    uri.searchParams.append('redirect_after_oidc', REDIRECT_SCHEME)
    for (const [key, value] of Object.entries(extra ?? {})) uri.searchParams.append(key, value)
    return uri
  } catch {
    return null
  }
}

export const getLoginUri = async (email: string): Promise<URL | null> => {
  const domain = extractDomain(email)
  if (!domain) return null

  const config = await fetchTwakeConfiguration(domain)
  const flagshipUri = config?.['twake-flagship-login-uri']
  return flagshipUri ? buildLoginUri(flagshipUri) : null
}

export const getTwakeWorkplaceLoginUri = async (mode: 'signin' | 'signup'): Promise<URL | null> => {
  const config = await fetchTwakeConfiguration(TWAKE_WORKPLACE_DOMAIN)
  const flagshipUri = config?.['twake-flagship-login-uri']
  if (!flagshipUri) return null
  return buildLoginUri(flagshipUri, mode === 'signup' ? { signup: 'true' } : undefined)
}
