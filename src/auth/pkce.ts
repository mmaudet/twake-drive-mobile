import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'

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

const normalizeRedirectUrl = (raw: string): string => {
  let url = raw
  if (url.startsWith('cozy:?')) url = url.replace('cozy:?', 'cozy://?')
  url = url.replace(/%23$/i, '').replace(/#$/, '')
  return url
}

export const openAuthorizeUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening authorize URL', url)
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URL, {
    showInRecents: false
  })
  console.log('[auth] authorize result', JSON.stringify(result))
  if (result.type === 'success' && result.url) {
    const cleaned = normalizeRedirectUrl(result.url)
    if (cleaned !== result.url) console.log('[auth] cleaned URL', cleaned)
    return cleaned
  }
  throw new UserCancelledError()
}
