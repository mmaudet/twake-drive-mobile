import CozyClient from 'cozy-client'

interface SessionCodeResponse {
  session_code?: string
}

/**
 * Builds a URL into a cozy-installed web app (drive, notes, ...) with an
 * embedded session_code so the resulting WebView can render the app's UI
 * already authenticated. Uses the flat subdomain pattern
 * `<instance>-<slug>.<rest>` matching the user's stack hosting.
 */
export const buildCozyAppUrl = (
  stackUri: string,
  slug: string,
  sessionCode: string,
  hash: string
): string => {
  const url = new URL(stackUri)
  const [instance, ...rest] = url.host.split('.')
  const appHost = `${instance}-${slug}.${rest.join('.')}`
  const params = new URLSearchParams({ session_code: sessionCode })
  const normalizedHash = hash.startsWith('#') ? hash : `#${hash}`
  return `${url.protocol}//${appHost}/?${params.toString()}${normalizedHash}`
}

/**
 * Calls fetchSessionCode on the cozy-stack client and returns the resulting
 * one-shot code. Throws if the session_code couldn't be obtained.
 */
export const getSessionCode = async (client: CozyClient): Promise<string> => {
  const stackClient = client.getStackClient()
  const fetchSessionCode = (
    stackClient as unknown as { fetchSessionCode?: () => Promise<SessionCodeResponse> }
  ).fetchSessionCode
  if (typeof fetchSessionCode !== 'function') {
    throw new Error('cozy-stack client does not expose fetchSessionCode')
  }
  const resp = await fetchSessionCode.call(stackClient)
  const code = resp?.session_code
  if (!code) throw new Error('Could not obtain session code from cozy stack')
  return code
}
