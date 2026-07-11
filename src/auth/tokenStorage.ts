import * as SecureStore from 'expo-secure-store'

import { Session } from './types'
import { mirrorSessionToNative, clearNativeSession } from '@/native/twakeAuthBridge'
import { SHARED_KEYCHAIN_ACCESS_GROUP } from '@/config/appIdentifiers'

export const SESSION_KEY = 'twake-drive-session'

// The cozy session is stored in a shared iOS Keychain access group so native
// extensions (Share, and later File Provider) can read the SAME item directly —
// no native bridge needed. AFTER_FIRST_UNLOCK lets the File Provider read while
// the device is locked (the default WHEN_UNLOCKED would return nothing). On
// Android these options are ignored by expo-secure-store.
const SHARED_KEYCHAIN: SecureStore.SecureStoreOptions = {
  accessGroup: SHARED_KEYCHAIN_ACCESS_GROUP,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
}

// Fallback for builds where the shared-group entitlement is ABSENT — e.g. the
// unsigned / ad-hoc iOS Simulator build, where requesting the access group
// throws "A required entitlement isn't present" and would otherwise block login
// entirely. The app's DEFAULT keychain (no access group) still works there, so
// the session persists and login succeeds; only cross-process sharing with the
// extensions is lost (and they aren't installed on the Simulator anyway). On a
// properly signed device build the shared group works and this never runs.
const DEFAULT_KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
}

const setItem = async (value: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, value, SHARED_KEYCHAIN)
  } catch {
    await SecureStore.setItemAsync(SESSION_KEY, value, DEFAULT_KEYCHAIN)
  }
}

const getItem = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
  } catch {
    return await SecureStore.getItemAsync(SESSION_KEY, DEFAULT_KEYCHAIN)
  }
}

const deleteItem = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY, SHARED_KEYCHAIN)
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY, DEFAULT_KEYCHAIN)
  }
}

export const saveSession = async (session: Session): Promise<void> => {
  await setItem(JSON.stringify(session))
  await mirrorSessionToNative(session)
}

export const getSession = async (): Promise<Session | null> => {
  const raw = await getItem()
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    await deleteItem()
    return null
  }
}

export const clearSession = async (): Promise<void> => {
  await deleteItem()
  await clearNativeSession()
}
