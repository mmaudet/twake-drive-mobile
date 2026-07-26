import type CozyClient from 'cozy-client'
import { createMMKV } from 'react-native-mmkv'

import { resetLinks } from './getLinks'

const LOCAL_DATA_MMKV_IDS = ['pouchdb-meta', 'offline-files', 'offline-settings']

export const destroyLocalData = async (client?: CozyClient): Promise<void> => {
  if (__DEV__) console.log('[destroyLocalData] wiping pouch + sync/offline MMKV')
  try {
    await resetLinks(client)
  } catch {
    // best effort — pouch may already be torn down
  }
  for (const id of LOCAL_DATA_MMKV_IDS) {
    try {
      createMMKV({ id }).clearAll()
    } catch {
      // ignore — the store may not have been opened this session
    }
  }
  if (__DEV__) console.log('[destroyLocalData] done')
}
