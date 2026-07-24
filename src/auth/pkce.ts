import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'

import { UserCancelledError } from './types'

export const REDIRECT_URL = 'twakedrive://'

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export const generatePkce = async (): Promise<{ codeVerifier: string; codeChallenge: string }> => {
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

export const normalizeRedirectUrl = (raw: string): string => {
  let url = raw
  if (url.startsWith('twakedrive:?')) url = url.replace('twakedrive:?', 'twakedrive://?')
  url = url.replace(/%23$/i, '').replace(/#$/, '')
  return url
}

const CANCEL_GRACE_MS = 400
const REDIRECT_RACE_GRACE_MS = 4000

let abortActiveBrowserFlow: (() => void) | null = null

// Open `url` in the system browser (an external Custom Tab — an RFC 8252
// user-agent with no access to the page's cookies or credentials) and resolve
// with the twakedrive:// redirect captured as an OS deep link.
//
// We deliberately do NOT use WebBrowser.openAuthSessionAsync here: the auth
// session cancels as soon as the app is backgrounded, and the flagship
// email-code certification requires exactly that — the user must leave the tab
// to read the 6-digit code from their mail and come back. On OIDC/LemonLDAP that
// backgrounding aborted the authorize flow and bounced the user back to the
// welcome screen. A plain Custom Tab stays open across the excursion, and the
// deep-link listener catches the final twakedrive:// redirect at the OS level.
const openViaSystemBrowser = (url: string): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    // A new attempt tears down any flow still in flight first, so its lingering
    // deep-link listener, grace timer, or dismissBrowser() can't fire against
    // this attempt's browser — closing it and hanging the retry.
    abortActiveBrowserFlow?.()

    let settled = false
    let sub: ReturnType<typeof Linking.addEventListener> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: () => void
    const finish = (run: () => void): void => {
      if (settled) return
      settled = true
      if (abortActiveBrowserFlow === abort) abortActiveBrowserFlow = null
      sub?.remove()
      if (timer) clearTimeout(timer)
      try {
        void Promise.resolve(WebBrowser.dismissBrowser()).catch(() => undefined)
      } catch {
        // dismissing the tab is best-effort
      }
      run()
    }
    abort = (): void => finish(() => reject(new UserCancelledError()))
    abortActiveBrowserFlow = abort

    sub = Linking.addEventListener('url', ({ url: incoming }) => {
      if (incoming?.startsWith('twakedrive:')) {
        console.log('[auth] captured twakedrive:// redirect via deep link')
        finish(() => resolve(normalizeRedirectUrl(incoming)))
      }
    })
    WebBrowser.openBrowserAsync(url, { showInRecents: true }).then(
      result => {
        if (settled) return
        const userClosed = result?.type === WebBrowser.WebBrowserResultType.CANCEL
        const grace = userClosed ? CANCEL_GRACE_MS : REDIRECT_RACE_GRACE_MS
        timer = setTimeout(() => finish(() => reject(new UserCancelledError())), grace)
      },
      (err: unknown) => finish(() => reject(err as Error))
    )
  })

export const openAuthorizeUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening authorize URL', url.split('?')[0])
  // The stack's /auth/authorize step usually redirects to twakedrive:// instantly with
  // no UI. openAuthSessionAsync captures that native redirect reliably; the
  // openBrowserAsync + deep-link path misses the instant custom-scheme redirect.
  // This does not affect the Docs cookie jar — the Lemon SSO cookie is set during
  // login (openLoginUrl / SFSafariViewController), not here.
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URL, { showInRecents: false })
  if (result.type === 'success' && result.url) {
    return normalizeRedirectUrl(result.url)
  }
  // An uncertified client shows the email-code form instead of redirecting; the
  // user leaves to read the code, which aborts openAuthSessionAsync on refocus.
  // Retry in the system browser, which survives the mail excursion.
  console.log('[auth] auth session returned', result.type, '— falling back to system browser')
  return openViaSystemBrowser(url)
}

export const openLoginUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening login URL', url.split('?')[0])
  return openViaSystemBrowser(url)
}
