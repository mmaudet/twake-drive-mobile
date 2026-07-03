import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

export type ViewMode = 'list' | 'grid'

const STORAGE_KEY = 'viewMode'
const DEFAULT_MODE: ViewMode = 'list'

// Module-level store: one MMKV instance + in-memory listeners for reactivity.
let storage: ReturnType<typeof createMMKV> | null = null

try {
  storage = createMMKV({ id: 'view-settings' })
} catch {
  // Guard against environments where MMKV native module is unavailable.
  storage = null
}

let currentMode: ViewMode =
  (storage?.getString(STORAGE_KEY) as ViewMode | undefined) ?? DEFAULT_MODE

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ViewMode {
  return currentMode
}

/**
 * Set the view mode and notify all subscribers.
 * Exported as a standalone function so it can be called outside of React
 * (e.g. from test setup helpers).
 */
export function setViewMode(mode: ViewMode): void {
  if (mode === currentMode) return
  currentMode = mode
  storage?.set(STORAGE_KEY, mode)
  listeners.forEach(l => l())
}

/**
 * React hook that returns the current view mode and a setter.
 * All consumers share the same module-level store and re-render when the mode
 * changes (via useSyncExternalStore).
 */
export function useViewMode(): { mode: ViewMode; setMode: (m: ViewMode) => void } {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { mode, setMode: setViewMode }
}
