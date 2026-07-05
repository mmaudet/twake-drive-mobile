import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'themePreference'
const DEFAULT: ThemePref = 'system'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

function parse(raw: string | undefined): ThemePref {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT
}

let current: ThemePref = parse(storage?.getString(STORAGE_KEY))
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
function getSnapshot(): ThemePref {
  return current
}

export function setThemePreference(pref: ThemePref): void {
  if (pref === current) return
  current = pref
  storage?.set(STORAGE_KEY, pref)
  listeners.forEach(l => l())
}

export function useThemePreference(): { pref: ThemePref; setPref: (p: ThemePref) => void } {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { pref, setPref: setThemePreference }
}
