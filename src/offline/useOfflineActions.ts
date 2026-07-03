import { useCallback, useState } from 'react'
import { Q, useClient } from 'cozy-client'
import type CozyClient from 'cozy-client'

import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'

interface FileShape {
  _id: string
  _rev?: string
  md5sum?: string
  size?: number | null
  name: string
  type?: 'file' | 'directory'
}

interface PendingConfirmation {
  folder: FileShape
  count: number
  bytes: number
}

const LARGE_FOLDER_THRESHOLD = 1000

const coerceSize = (raw: unknown): number => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const fileMeta = (f: FileShape): { rev: string; md5sum: string; size: number; name: string } => ({
  rev: f._rev ?? '',
  md5sum: f.md5sum ?? '',
  size: coerceSize(f.size),
  name: f.name ?? ''
})

const enumerateFolderChildren = async (
  client: CozyClient,
  dirId: string
): Promise<{ files: FileShape[]; subfolders: FileShape[] }> => {
  const definition = Q('io.cozy.files')
    .where({ dir_id: dirId })
    .indexFields(['dir_id', 'type', 'name'])
    .sortBy([{ dir_id: 'asc' }, { type: 'asc' }, { name: 'asc' }])
  const result = await client.query(definition)
  const data = (result?.data ?? []) as unknown as FileShape[]
  const files = data.filter(d => d.type === 'file')
  const subfolders = data.filter(d => d.type === 'directory')
  return { files, subfolders }
}

export interface UseOfflineActionsResult {
  pin: (file: FileShape) => void
  pinFolder: (folder: FileShape) => Promise<void>
  unpin: (fileId: string) => Promise<void>
  unpinFolder: (dirId: string) => Promise<void>
  pendingConfirmation: PendingConfirmation | null
  confirmPending: () => Promise<void>
  cancelPending: () => void
}

export const useOfflineActions = (): UseOfflineActionsResult => {
  const client = useClient()
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)

  const pin = useCallback((file: FileShape) => {
    OfflineFilesStore.pin(file._id, fileMeta(file))
    Downloader.enqueue(file._id)
  }, [])

  const doPinFolder = useCallback(
    async (folder: FileShape, files: FileShape[], subfolders: FileShape[]): Promise<void> => {
      if (!client) return
      OfflineFilesStore.pinFolder(folder._id, {
        dirId: folder._id,
        name: folder.name,
        pinnedAt: Date.now()
      })
      for (const f of files) {
        OfflineFilesStore.pinViaFolder(f._id, folder._id, fileMeta(f))
        Downloader.enqueue(f._id)
      }
      for (const sub of subfolders) {
        const { files: subFiles, subfolders: subSubs } = await enumerateFolderChildren(
          client,
          sub._id
        )
        await doPinFolder(sub, subFiles, subSubs)
      }
    },
    [client]
  )

  const pinFolder = useCallback(
    async (folder: FileShape) => {
      if (!client) return
      const { files, subfolders } = await enumerateFolderChildren(client, folder._id)
      const directCount = files.length + subfolders.length
      const directBytes = files.reduce(
        (acc, f) => acc + (typeof f.size === 'number' ? f.size : 0),
        0
      )
      if (directCount > LARGE_FOLDER_THRESHOLD) {
        setPendingConfirmation({ folder, count: directCount, bytes: directBytes })
        return
      }
      await doPinFolder(folder, files, subfolders)
    },
    [client, doPinFolder]
  )

  const confirmPending = useCallback(async () => {
    if (!pendingConfirmation || !client) return
    const { folder } = pendingConfirmation
    setPendingConfirmation(null)
    const { files, subfolders } = await enumerateFolderChildren(client, folder._id)
    await doPinFolder(folder, files, subfolders)
  }, [pendingConfirmation, client, doPinFolder])

  const cancelPending = useCallback(() => setPendingConfirmation(null), [])

  const unpin = useCallback(async (fileId: string) => {
    await Downloader.cancel(fileId)
    await OfflineFilesStore.unpin(fileId)
  }, [])

  const unpinFolder = useCallback(async (dirId: string) => {
    await OfflineFilesStore.unpinFolder(dirId)
  }, [])

  return { pin, pinFolder, unpin, unpinFolder, pendingConfirmation, confirmPending, cancelPending }
}
