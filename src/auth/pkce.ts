import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'

import { UserCancelledError } from './types'

export const REDIRECT_URL = 'cozy://'

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
  if (url.startsWith('cozy:?')) url = url.replace('cozy:?', 'cozy://?')
  url = url.replace(/%23$/i, '').replace(/#$/, '')
  return url
}

export const openAuthorizeUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening authorize URL', url)
  // `cozy://` is a registered app deep-link scheme, so on Android the OAuth
  // redirect reopens MainActivity and openAuthSessionAsync resolves
  // `{type:'dismiss'}` instead of capturing the URL — the auth code is lost.
  // But the running app DOES receive that deep link, so we listen for it via
  // Linking as a fallback and use whichever source yields the redirect first.
  let received: string | null = null
  const sub = Linking.addEventListener('url', ({ url: incoming }) => {
    if (incoming && incoming.startsWith('cozy:')) received = incoming
  })
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URL, {
      showInRecents: false
    })
    console.log('[auth] authorize result', JSON.stringify(result))
    let redirectUrl: string | null = result.type === 'success' && result.url ? result.url : null
    if (!redirectUrl) {
      // Dismissed: the redirect most likely reached the app through Linking.
      // Give the deep-link event up to ~2s to arrive before giving up.
      for (let i = 0; i < 20 && !received; i++) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      redirectUrl = received
    }
    if (redirectUrl) {
      const cleaned = normalizeRedirectUrl(redirectUrl)
      console.log('[auth] captured redirect', cleaned)
      return cleaned
    }
    throw new UserCancelledError()
  } finally {
    sub.remove()
  }
}
