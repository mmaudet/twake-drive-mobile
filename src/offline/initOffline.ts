import CozyClient from 'cozy-client'
import * as FS from 'expo-file-system/legacy'

import { FileSystemRepo } from './FileSystemRepo'
import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'
import { startPinReactor } from './pinReactor'
import { reconcileFolderPins } from './reconcileFolderPins'
import { getPouchLink } from '@/pouchdb/triggerReplication'

let pinReactorStop: (() => void) | undefined
let initialized = false

export const initOfflineSubsystem = async (client: CozyClient): Promise<void> => {
  if (initialized) return
  initialized = true

  await FileSystemRepo.init()

  // Sweep orphan blobs: files on disk that don't correspond to any pinned
  // MMKV entry (left over from pin/unpin cycles where the delete didn't
  // happen or the entry was cleared without purging the blob).
  try {
    const pinnedIds = new Set(OfflineFilesStore.getAll().map(e => e.fileId))
    const names = await FS.readDirectoryAsync(FileSystemRepo.dir())
    for (const name of names) {
      if (!pinnedIds.has(name)) {
        await FS.deleteAsync(`${FileSystemRepo.dir()}${name}`, { idempotent: true })
      }
    }
  } catch {
    // First-boot or empty dir — readDirectoryAsync can throw. Ignore.
  }

  Downloader.init({
    buildUrl: fileId => {
      const stack = client.getStackClient() as { uri: string }
      return `${stack.uri}/files/download/${encodeURIComponent(fileId)}`
    },
    getAuthHeaders: (): Record<string, string> => {
      const stack = client.getStackClient() as { getAccessToken: () => string | null | undefined }
      const tok = stack.getAccessToken()
      return tok ? { Authorization: `Bearer ${tok}` } : {}
    }
  })

  for (const entry of OfflineFilesStore.getAll()) {
    let next = entry
    if (entry.state === 'downloading') {
      next = { ...next, state: 'pending', bytesDownloaded: undefined }
    }
    if (entry.state === 'paused-auth') {
      next = { ...next, state: 'pending' }
    }
    if (entry.state === 'downloaded' && !(await FileSystemRepo.exists(entry.fileId))) {
      next = { ...next, state: 'pending' }
    }
    // Backfill localBytes for entries that pre-date the field.
    if (next.state === 'downloaded' && next.localBytes === undefined) {
      try {
        const info = await FS.getInfoAsync(next.localPath)
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          next = { ...next, localBytes: info.size }
        }
      } catch {
        // ignore
      }
    }
    if (next !== entry) OfflineFilesStore.update(entry.fileId, () => next)
    if (next.state === 'pending') Downloader.enqueue(entry.fileId)
  }

  const pouchLink = getPouchLink(client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pouch = (pouchLink as any)?.getPouch?.('io.cozy.files')
  if (pouch) pinReactorStop = startPinReactor(pouch)

  // Reconcile folder pins drift in case MMKV entries went out of sync with
  // the folder pin list (e.g. previous version of "Delete all" only purged
  // files but kept folder entries).
  void reconcileFolderPins(client)
}

/** Test / logout teardown. */
export const teardownOfflineSubsystem = (): void => {
  pinReactorStop?.()
  pinReactorStop = undefined
  initialized = false
}
