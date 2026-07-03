import { offlineSettingsStorage, SETTINGS_KEY, STATUS_KEY } from './storage'
import { OfflineSettings, OfflineStatus } from './types'

const DEFAULT: OfflineSettings = { wifiOnly: false }
const DEFAULT_STATUS: OfflineStatus = { diskFull: false }

const settingsListeners = new Set<() => void>()
const statusListeners = new Set<() => void>()

const readSettings = (): OfflineSettings => {
  const raw = offlineSettingsStorage.getString(SETTINGS_KEY)
  if (!raw) return DEFAULT
  try {
    return { ...DEFAULT, ...(JSON.parse(raw) as OfflineSettings) }
  } catch {
    return DEFAULT
  }
}

const readStatus = (): OfflineStatus => {
  const raw = offlineSettingsStorage.getString(STATUS_KEY)
  if (!raw) return DEFAULT_STATUS
  try {
    return { ...DEFAULT_STATUS, ...(JSON.parse(raw) as OfflineStatus) }
  } catch {
    return DEFAULT_STATUS
  }
}

export const OfflineSettingsAPI = {
  get: readSettings,
  set(patch: Partial<OfflineSettings>): void {
    const next = { ...readSettings(), ...patch }
    offlineSettingsStorage.set(SETTINGS_KEY, JSON.stringify(next))
    settingsListeners.forEach(l => l())
  },
  subscribe(l: () => void): () => void {
    settingsListeners.add(l)
    return () => settingsListeners.delete(l)
  },
  status: {
    get: readStatus,
    set(patch: Partial<OfflineStatus>): void {
      const next = { ...readStatus(), ...patch }
      offlineSettingsStorage.set(STATUS_KEY, JSON.stringify(next))
      statusListeners.forEach(l => l())
    },
    subscribe(l: () => void): () => void {
      statusListeners.add(l)
      return () => statusListeners.delete(l)
    }
  }
}
