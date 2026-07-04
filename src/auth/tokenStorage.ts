import * as SecureStore from 'expo-secure-store'

import { Session } from './types'
import { mirrorSessionToNative, clearNativeSession } from '@/native/twakeAuthBridge'

export const SESSION_KEY = 'twake-drive-session'

// The cozy session is stored in a shared iOS Keychain access group so native
// extensions (Share, and later File Provider) can read the SAME item directly —
// no native bridge needed. AFTER_FIRST_UNLOCK lets the File Provider read while
// the device is locked (the default WHEN_UNLOCKED would return nothing). On
// Android these options are ignored by expo-secure-store.
const SHARED_KEYCHAIN: SecureStore.SecureStoreOptions = {
  accessGroup: 'com.linagora.twakedrive.shared',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
}

export const saveSession = async (session: Session): Promise<void> => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), SHARED_KEYCHAIN)
  await mirrorSessionToNative(session)
}

export const getSession = async (): Promise<Session | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
    return null
  }
}

export const clearSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
  await clearNativeSession()
}
