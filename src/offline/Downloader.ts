import * as FS from 'expo-file-system/legacy'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { OfflineFilesStore } from './OfflineFilesStore'
import { OfflineSettingsAPI } from './offlineSettings'
import { FileSystemRepo } from './FileSystemRepo'

const MAX_CONCURRENT = 4
const BACKOFF_DELAYS_MS = [2_000, 8_000, 30_000]

interface DeploymentOptions {
  buildUrl: (fileId: string) => string
  getAuthHeaders: () => Record<string, string>
}

interface QueuedDownload {
  fileId: string
  resumable?: ReturnType<typeof FS.createDownloadResumable>
}

let opts: DeploymentOptions | undefined
const queue: string[] = []
const inFlight = new Map<string, QueuedDownload>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
let unsubOnline: (() => void) | undefined
let unsubSettings: (() => void) | undefined

const isENOSPC = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err)
  return /ENOSPC|no space left|out of space|disk full/i.test(msg)
}

const isAuthFailure = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err)
  return /401|unauthor/i.test(msg)
}

const networkAllowsDownload = (): boolean => {
  const monitor = getOnlineMonitor()
  if (!monitor.getCurrent()) return false
  const { wifiOnly } = OfflineSettingsAPI.get()
  if (wifiOnly && monitor.getNetType() !== 'wifi') return false
  if (OfflineSettingsAPI.status.get().diskFull) return false
  return true
}

const pump = (): void => {
  if (!opts) return
  while (inFlight.size < MAX_CONCURRENT && queue.length > 0 && networkAllowsDownload()) {
    const fileId = queue.shift()
    if (!fileId) break
    void startDownload(fileId)
  }
}

const startDownload = async (fileId: string): Promise<void> => {
  if (!opts) return
  const entry = OfflineFilesStore.get(fileId)
  if (!entry) return
  const url = opts.buildUrl(fileId)
  const headers = opts.getAuthHeaders()
  const resumable = FS.createDownloadResumable(
    url,
    entry.localPath,
    { headers },
    (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
      OfflineFilesStore.update(fileId, e => ({
        ...e,
        bytesDownloaded: progress.totalBytesWritten
      }))
    }
  )
  inFlight.set(fileId, { fileId, resumable })
  OfflineFilesStore.setState(fileId, 'downloading', { bytesDownloaded: 0 })
  try {
    const result = await resumable.downloadAsync()
    if (!result) return // canceled
    if (result.status >= 400) {
      throw new Error(`HTTP ${result.status}`)
    }
    // Record the actual on-disk size so we can later detect short
    // downloads (network drop, app suspended mid-transfer, server
    // serving a smaller representation than the size declared in
    // metadata, etc.). The download is still flagged 'downloaded' so
    // the user can open the partial blob — short reads usually still
    // render an image.
    let localBytes: number | undefined
    try {
      const info = await FS.getInfoAsync(entry.localPath)
      if (info.exists && 'size' in info && typeof info.size === 'number') {
        localBytes = info.size
      }
    } catch {
      // best-effort; leave undefined
    }
    if (localBytes !== undefined && entry.size > 0 && localBytes < entry.size * 0.5) {
      console.warn(
        `[offline] short download for ${fileId} (${entry.name || ''}): ` +
          `${localBytes}B on disk vs ${entry.size}B claimed by stack`
      )
    }
    OfflineFilesStore.update(fileId, e => ({
      ...e,
      state: 'downloaded',
      bytesDownloaded: undefined,
      retryCount: undefined,
      lastError: undefined,
      localBytes: localBytes ?? e.localBytes
    }))
    inFlight.delete(fileId)
    pump()
  } catch (err) {
    inFlight.delete(fileId)
    if (isAuthFailure(err)) {
      OfflineFilesStore.setState(fileId, 'paused-auth')
      return
    }
    if (err instanceof Error && /HTTP 404/.test(err.message)) {
      // Server deleted the file. Treat as trash: purge locally.
      await OfflineFilesStore.purge(fileId)
      pump()
      return
    }
    if (isENOSPC(err)) {
      OfflineSettingsAPI.status.set({ diskFull: true })
      OfflineFilesStore.setState(fileId, 'pending')
      queue.unshift(fileId)
      return
    }
    const retryCount = OfflineFilesStore.get(fileId)?.retryCount ?? 0
    if (retryCount >= BACKOFF_DELAYS_MS.length) {
      OfflineFilesStore.setState(fileId, 'failed', {
        lastError: err instanceof Error ? err.message : String(err)
      })
      pump()
      return
    }
    const delay = BACKOFF_DELAYS_MS[retryCount]
    OfflineFilesStore.update(fileId, e => ({ ...e, retryCount: retryCount + 1, state: 'pending' }))
    const timer = setTimeout(() => {
      retryTimers.delete(fileId)
      queue.push(fileId)
      pump()
    }, delay)
    retryTimers.set(fileId, timer)
    pump()
  }
}

export const Downloader = {
  init(deploymentOpts: DeploymentOptions): void {
    opts = deploymentOpts
    unsubOnline?.()
    unsubSettings?.()
    unsubOnline = getOnlineMonitor().subscribe(online => {
      if (!online) {
        void Downloader.pauseAll()
      } else {
        pump()
      }
    })
    unsubSettings = OfflineSettingsAPI.subscribe(() => {
      if (networkAllowsDownload()) pump()
      else void Downloader.pauseAll()
    })
  },

  enqueue(fileId: string): void {
    if (inFlight.has(fileId) || queue.includes(fileId)) return
    OfflineFilesStore.update(fileId, e => ({ ...e, retryCount: undefined, lastError: undefined }))
    queue.push(fileId)
    pump()
  },

  async cancel(fileId: string): Promise<void> {
    const idx = queue.indexOf(fileId)
    if (idx >= 0) queue.splice(idx, 1)
    const timer = retryTimers.get(fileId)
    if (timer) {
      clearTimeout(timer)
      retryTimers.delete(fileId)
    }
    const inFlt = inFlight.get(fileId)
    if (inFlt?.resumable) {
      try {
        await inFlt.resumable.cancelAsync()
      } catch {
        /* ignore */
      }
    }
    inFlight.delete(fileId)
    OfflineFilesStore.update(fileId, e => ({ ...e, state: 'pending', bytesDownloaded: undefined }))
  },

  async pauseAll(): Promise<void> {
    for (const id of Array.from(inFlight.keys())) {
      const inFlt = inFlight.get(id)
      if (inFlt?.resumable) {
        try {
          await inFlt.resumable.cancelAsync()
        } catch {
          /* ignore */
        }
      }
      OfflineFilesStore.update(id, e => ({ ...e, state: 'pending', bytesDownloaded: undefined }))
      if (!queue.includes(id)) queue.unshift(id)
    }
    inFlight.clear()
  },

  resumeAll(): void {
    pump()
  }
}

/** Test-only. */
export const _resetDownloaderForTests = (): void => {
  queue.length = 0
  inFlight.clear()
  retryTimers.forEach(t => clearTimeout(t))
  retryTimers.clear()
  unsubOnline?.()
  unsubSettings?.()
  unsubOnline = undefined
  unsubSettings = undefined
  opts = undefined
}
