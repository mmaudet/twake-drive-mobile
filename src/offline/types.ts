export type OfflineFileState = 'pending' | 'downloading' | 'downloaded' | 'failed' | 'paused-auth'

export interface OfflineFileEntry {
  fileId: string
  state: OfflineFileState
  rev: string
  md5sum: string
  /** Source-file size from cozy-stack metadata. Used for big-folder warnings
   *  and as a fallback when the blob hasn't been downloaded yet. */
  size: number
  /** Actual size of the blob on disk, set after a successful download.
   *  Settings and folder aggregates prefer this over `size`. */
  localBytes?: number
  name: string
  bytesDownloaded?: number
  localPath: string
  pinnedAt: number
  isDirectPin: boolean
  parentFolderPins: string[]
  retryCount?: number
  lastError?: string
}

export interface OfflineFolderEntry {
  dirId: string
  pinnedAt: number
  name: string
  /** Ancestor folder ids (root + intermediate) that pinned this subfolder, so
   *  unpinning an ancestor can recurse and purge nested subfolders. Empty/absent
   *  for a directly-pinned folder. */
  ancestorPins?: string[]
}

export interface OfflineSettings {
  wifiOnly: boolean
}

export interface OfflineStatus {
  diskFull: boolean
}

export interface OfflineFolderAggregateState {
  total: number
  downloaded: number
  downloading: number
  failed: number
  bytes: number
}
