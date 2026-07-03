import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

export type SortAttr = 'name'
export type SortDir = 'asc' | 'desc'

export interface FolderSort {
  attr: SortAttr
  dir: SortDir
}

const STORAGE_KEY = 'folderSort'
const DEFAULT_SORT: FolderSort = { attr: 'name', dir: 'asc' }

// Module-level store: one MMKV instance + in-memory listeners for reactivity.
let storage: ReturnType<typeof createMMKV> | null = null

try {
  storage = createMMKV({ id: 'folder-sort-settings' })
} catch {
  // Guard against environments where MMKV native module is unavailable.
  storage = null
}

function parseSort(raw: string | undefined): FolderSort {
  if (!raw) return DEFAULT_SORT
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'attr' in parsed &&
      'dir' in parsed &&
      (parsed as { attr: unknown }).attr === 'name' &&
      ((parsed as { dir: unknown }).dir === 'asc' || (parsed as { dir: unknown }).dir === 'desc')
    ) {
      return parsed as FolderSort
    }
  } catch {
    // ignore parse errors, fall through to default
  }
  return DEFAULT_SORT
}

let currentSort: FolderSort = parseSort(storage?.getString(STORAGE_KEY))

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): FolderSort {
  return currentSort
}

/**
 * Set the folder sort and notify all subscribers.
 * Exported as a standalone function so it can be called outside of React
 * (e.g. from test setup helpers).
 */
export function setFolderSort(sort: FolderSort): void {
  if (sort.attr === currentSort.attr && sort.dir === currentSort.dir) return
  currentSort = sort
  storage?.set(STORAGE_KEY, JSON.stringify(sort))
  listeners.forEach(l => l())
}

/**
 * React hook that returns the current folder sort and a setter.
 * All consumers share the same module-level store and re-render when the sort
 * changes (via useSyncExternalStore).
 */
export function useFolderSort(): { sort: FolderSort; setSort: (s: FolderSort) => void } {
  const sort = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { sort, setSort: setFolderSort }
}
