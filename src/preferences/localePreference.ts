import { createMMKV } from 'react-native-mmkv'

export const LOCALE_SYSTEM = 'system'
const STORAGE_KEY = 'localePreference'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/** Resolve the i18n language from the stored preference, the OS locale and the
 *  locales actually present in the bundle. `system` (or an unavailable choice)
 *  follows the device locale; anything unresolved falls back to English. */
export function resolveLanguage(
  pref: string,
  deviceLocale: string | undefined,
  available: string[]
): string {
  if (pref !== LOCALE_SYSTEM && available.includes(pref)) return pref
  if (deviceLocale && available.includes(deviceLocale)) return deviceLocale
  return 'en'
}

export function getLocalePreference(): string {
  return storage?.getString(STORAGE_KEY) ?? LOCALE_SYSTEM
}

export function setLocalePreference(pref: string): void {
  storage?.set(STORAGE_KEY, pref)
}
