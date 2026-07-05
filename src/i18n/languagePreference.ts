import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'
import i18n from 'i18next'
import { getLocales } from 'expo-localization'
import { LanguageCode, LanguagePreference, isSupportedLanguage, pickLanguage } from './languages'

const STORAGE_KEY = 'language'

// Module-level store, mirroring src/ui/useViewMode.ts. Guarded so tests / envs
// without the native module fall back to in-memory 'system'.
let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-settings' })
} catch {
  storage = null
}

function readStored(): LanguagePreference {
  const raw = storage?.getString(STORAGE_KEY)
  return isSupportedLanguage(raw) ? raw : 'system'
}

let currentPreference: LanguagePreference = readStored()
const listeners = new Set<() => void>()

export function getStoredPreference(): LanguagePreference {
  return currentPreference
}

/** Effective language, resolving 'system' against the current device locales. */
export function resolveLanguage(preference: LanguagePreference = currentPreference): LanguageCode {
  return pickLanguage(preference, getLocales())
}

/** Persist a preference, switch i18next, and notify subscribers. */
export function setLanguagePreference(preference: LanguagePreference): void {
  currentPreference = preference
  storage?.set(STORAGE_KEY, preference) // stores 'system' | concrete code
  void i18n.changeLanguage(resolveLanguage(preference))
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useLanguagePreference(): {
  preference: LanguagePreference
  resolvedLanguage: LanguageCode
  setPreference: (p: LanguagePreference) => void
} {
  const preference = useSyncExternalStore(subscribe, getStoredPreference, getStoredPreference)
  return {
    preference,
    resolvedLanguage: resolveLanguage(preference),
    setPreference: setLanguagePreference
  }
}
