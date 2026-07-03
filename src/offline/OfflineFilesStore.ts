import { OfflineFileEntry, OfflineFileState, OfflineFolderEntry } from './types'
import {
  FILE_KEY_PREFIX,
  FOLDER_KEY_PREFIX,
  fileKey,
  folderKey,
  offlineFilesStorage
} from './storage'
import { FileSystemRepo } from './FileSystemRepo'

type FileListener = (entry: OfflineFileEntry | undefined) => void
type GlobalListener = () => void

const fileListeners = new Map<string, Set<FileListener>>()
const globalListeners = new Set<GlobalListener>()

const notify = (fileId: string): void => {
  const entry = readEntry(fileId)
  fileListeners.get(fileId)?.forEach(l => l(entry))
  globalListeners.forEach(l => l())
}

const readEntry = (fileId: string): OfflineFileEntry | undefined => {
  const raw = offlineFilesStorage.getString(fileKey(fileId))
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as OfflineFileEntry
  } catch {
    offlineFilesStorage.remove(fileKey(fileId))
    return undefined
  }
}

const writeEntry = (entry: OfflineFileEntry): void => {
  offlineFilesStorage.set(fileKey(entry.fileId), JSON.stringify(entry))
  notify(entry.fileId)
}

const deleteEntry = (fileId: string): void => {
  offlineFilesStorage.remove(fileKey(fileId))
  notify(fileId)
}

export interface PinMeta {
  rev: string
  md5sum: string
  size: number
  name: string
}

const buildEntry = (fileId: string, meta: PinMeta, prev?: OfflineFileEntry): OfflineFileEntry => ({
  fileId,
  state: prev?.state ?? 'pending',
  rev: meta.rev,
  md5sum: meta.md5sum,
  size: meta.size,
  name: meta.name,
  bytesDownloaded: prev?.bytesDownloaded,
  localPath: FileSystemRepo.localPath(fileId),
  pinnedAt: prev?.pinnedAt ?? Date.now(),
  isDirectPin: prev?.isDirectPin ?? false,
  parentFolderPins: prev?.parentFolderPins ?? [],
  retryCount: prev?.retryCount,
  lastError: prev?.lastError
})

export const OfflineFilesStore = {
  get: readEntry,

  getAll(): OfflineFileEntry[] {
    const keys = offlineFilesStorage.getAllKeys() as string[]
    return keys
      .filter((k: string) => k.startsWith(FILE_KEY_PREFIX))
      .map((k: string) => k.slice(FILE_KEY_PREFIX.length))
      .map((id: string) => readEntry(id))
      .filter((e: OfflineFileEntry | undefined): e is OfflineFileEntry => !!e)
  },

  getFolder(dirId: string): OfflineFolderEntry | undefined {
    const raw = offlineFilesStorage.getString(folderKey(dirId))
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as OfflineFolderEntry
    } catch {
      return undefined
    }
  },

  getAllFolders(): OfflineFolderEntry[] {
    const keys = offlineFilesStorage.getAllKeys() as string[]
    return keys
      .filter((k: string) => k.startsWith(FOLDER_KEY_PREFIX))
      .map((k: string) => k.slice(FOLDER_KEY_PREFIX.length))
      .map((id: string) => OfflineFilesStore.getFolder(id))
      .filter((e: OfflineFolderEntry | undefined): e is OfflineFolderEntry => !!e)
  },

  pin(fileId: string, meta: PinMeta): void {
    const prev = readEntry(fileId)
    const next = buildEntry(fileId, meta, prev)
    next.isDirectPin = true
    writeEntry(next)
  },

  pinViaFolder(fileId: string, dirId: string, meta: PinMeta): void {
    const prev = readEntry(fileId)
    const next = buildEntry(fileId, meta, prev)
    if (!next.parentFolderPins.includes(dirId)) {
      next.parentFolderPins = [...next.parentFolderPins, dirId]
    }
    writeEntry(next)
  },

  pinFolder(dirId: string, entry: OfflineFolderEntry): void {
    offlineFilesStorage.set(folderKey(dirId), JSON.stringify({ ...entry, pinnedAt: Date.now() }))
    globalListeners.forEach(l => l())
  },

  async unpin(fileId: string): Promise<void> {
    const entry = readEntry(fileId)
    if (!entry) return
    const next = { ...entry, isDirectPin: false }
    if (next.parentFolderPins.length === 0) {
      await FileSystemRepo.delete(fileId)
      deleteEntry(fileId)
      return
    }
    writeEntry(next)
  },

  async unpinFolder(dirId: string): Promise<void> {
    offlineFilesStorage.remove(folderKey(dirId))
    for (const entry of OfflineFilesStore.getAll()) {
      if (!entry.parentFolderPins.includes(dirId)) continue
      const next = {
        ...entry,
        parentFolderPins: entry.parentFolderPins.filter(d => d !== dirId)
      }
      if (next.parentFolderPins.length === 0 && !next.isDirectPin) {
        await FileSystemRepo.delete(entry.fileId)
        deleteEntry(entry.fileId)
      } else {
        writeEntry(next)
      }
    }
    globalListeners.forEach(l => l())
  },

  async purge(fileId: string): Promise<void> {
    await FileSystemRepo.delete(fileId)
    deleteEntry(fileId)
  },

  update(fileId: string, fn: (e: OfflineFileEntry) => OfflineFileEntry): void {
    const cur = readEntry(fileId)
    if (!cur) return
    writeEntry(fn(cur))
  },

  setState(fileId: string, state: OfflineFileState, patch: Partial<OfflineFileEntry> = {}): void {
    OfflineFilesStore.update(fileId, e => ({ ...e, ...patch, state }))
  },

  markDownloaded(fileId: string): void {
    OfflineFilesStore.update(fileId, e => ({
      ...e,
      state: 'downloaded',
      bytesDownloaded: undefined,
      retryCount: undefined,
      lastError: undefined
    }))
  },

  isPinnedAndDownloaded(fileId: string): boolean {
    const e = readEntry(fileId)
    return !!e && e.state === 'downloaded'
  },

  subscribe(fileId: string, listener: FileListener): () => void {
    let set = fileListeners.get(fileId)
    if (!set) {
      set = new Set()
      fileListeners.set(fileId, set)
    }
    set.add(listener)
    return () => set?.delete(listener)
  },

  subscribeAll(listener: GlobalListener): () => void {
    globalListeners.add(listener)
    return () => globalListeners.delete(listener)
  }
}
