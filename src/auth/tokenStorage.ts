import * as SecureStore from 'expo-secure-store'

import { Session } from './types'
import { mirrorSessionToNative, clearNativeSession } from '@/native/twakeAuthBridge'

export const SESSION_KEY = 'twake-drive-session'

export const saveSession = async (session: Session): Promise<void> => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
  await mirrorSessionToNative(session)
}

export const getSession = async (): Promise<Session | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY)
    return null
  }
}

export const clearSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY)
  await clearNativeSession()
}
