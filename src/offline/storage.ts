import { createMMKV } from 'react-native-mmkv'

export const offlineFilesStorage = createMMKV({ id: 'offline-files' })
export const offlineSettingsStorage = createMMKV({ id: 'offline-settings' })

export const FILE_KEY_PREFIX = 'offline:file:'
export const FOLDER_KEY_PREFIX = 'offline:folder:'
export const SETTINGS_KEY = 'settings'
export const STATUS_KEY = 'status'

export const fileKey = (fileId: string): string => `${FILE_KEY_PREFIX}${fileId}`
export const folderKey = (dirId: string): string => `${FOLDER_KEY_PREFIX}${dirId}`
