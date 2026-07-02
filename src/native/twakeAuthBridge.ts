import { NativeModules, Platform } from 'react-native'

import type { Session } from '@/auth/types'

interface TwakeAuthBridgeNative {
  syncSession: (json: string) => Promise<boolean>
  clearSession: () => Promise<boolean>
}

const native: TwakeAuthBridgeNative | undefined = NativeModules.TwakeAuthBridge as
  | TwakeAuthBridgeNative
  | undefined

/**
 * Mirror the durable OAuth creds into the native EncryptedSharedPreferences the
 * Android DocumentsProvider reads. No-op off Android or if the module is absent.
 */
export const mirrorSessionToNative = async (session: Session): Promise<void> => {
  if (Platform.OS !== 'android' || !native) return
  const payload = JSON.stringify({
    uri: session.uri,
    clientId: session.oauthOptions.clientID,
    clientSecret: session.oauthOptions.clientSecret,
    refreshToken: session.token.refreshToken
  })
  try {
    await native.syncSession(payload)
  } catch (err) {
    console.warn('[twakeAuthBridge] syncSession failed', err)
  }
}

export const clearNativeSession = async (): Promise<void> => {
  if (Platform.OS !== 'android' || !native) return
  try {
    await native.clearSession()
  } catch (err) {
    console.warn('[twakeAuthBridge] clearSession failed', err)
  }
}
