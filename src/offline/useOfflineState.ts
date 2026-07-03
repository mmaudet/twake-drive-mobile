import { useEffect, useState } from 'react'

import { OfflineFilesStore } from './OfflineFilesStore'
import { OfflineFileEntry, OfflineFileState } from './types'

export const useOfflineState = (fileId: string | undefined): OfflineFileEntry | undefined => {
  const [entry, setEntry] = useState<OfflineFileEntry | undefined>(
    fileId ? OfflineFilesStore.get(fileId) : undefined
  )
  useEffect(() => {
    if (!fileId) return
    setEntry(OfflineFilesStore.get(fileId))
    return OfflineFilesStore.subscribe(fileId, setEntry)
  }, [fileId])
  return entry
}

export const useOfflineFolderPinned = (dirId: string | undefined): boolean => {
  const [pinned, setPinned] = useState<boolean>(!!(dirId && OfflineFilesStore.getFolder(dirId)))
  useEffect(() => {
    if (!dirId) return
    setPinned(!!OfflineFilesStore.getFolder(dirId))
    return OfflineFilesStore.subscribeAll(() => setPinned(!!OfflineFilesStore.getFolder(dirId)))
  }, [dirId])
  return pinned
}

export interface OfflineFolderState {
  pinned: boolean
  /** Aggregated state across the children that match this folder pin. */
  aggregate: OfflineFileState | null
  total: number
  downloaded: number
  downloading: number
  pending: number
  failed: number
}

const computeFolderState = (dirId: string): OfflineFolderState => {
  const pinned = !!OfflineFilesStore.getFolder(dirId)
  if (!pinned) {
    return {
      pinned: false,
      aggregate: null,
      total: 0,
      downloaded: 0,
      downloading: 0,
      pending: 0,
      failed: 0
    }
  }
  const children = OfflineFilesStore.getAll().filter(e => e.parentFolderPins.includes(dirId))
  const total = children.length
  let downloaded = 0
  let downloading = 0
  let pending = 0
  let failed = 0
  for (const c of children) {
    if (c.state === 'downloaded') downloaded += 1
    else if (c.state === 'downloading') downloading += 1
    else if (c.state === 'failed') failed += 1
    else pending += 1
  }
  // Priority: any download in-flight wins, then failures, then pending,
  // otherwise fully downloaded.
  const aggregate: OfflineFileState =
    downloading > 0 ? 'downloading' : failed > 0 ? 'failed' : pending > 0 ? 'pending' : 'downloaded'
  return { pinned: true, aggregate, total, downloaded, downloading, pending, failed }
}

export const useOfflineFolderState = (dirId: string | undefined): OfflineFolderState => {
  const [state, setState] = useState<OfflineFolderState>(() =>
    dirId
      ? computeFolderState(dirId)
      : {
          pinned: false,
          aggregate: null,
          total: 0,
          downloaded: 0,
          downloading: 0,
          pending: 0,
          failed: 0
        }
  )
  useEffect(() => {
    if (!dirId) return
    setState(computeFolderState(dirId))
    return OfflineFilesStore.subscribeAll(() => setState(computeFolderState(dirId)))
  }, [dirId])
  return state
}
