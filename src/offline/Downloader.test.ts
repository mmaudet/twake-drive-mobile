const mockStore = new Map<string, string>()

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: (k: string, v: string): void => { mockStore.set(k, v) },
    getString: (k: string): string | undefined => mockStore.get(k),
    remove: (k: string): boolean => mockStore.delete(k),
    getAllKeys: (): string[] => Array.from(mockStore.keys()),
    clearAll: (): void => { mockStore.clear() }
  })
}))

const mockDownloadAsync = jest.fn()
const mockPauseAsync = jest.fn()
const mockCancelAsync = jest.fn().mockResolvedValue(undefined)

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  createDownloadResumable: jest.fn(() => ({
    downloadAsync: mockDownloadAsync,
    pauseAsync: mockPauseAsync,
    cancelAsync: mockCancelAsync
  }))
}))

jest.mock('./FileSystemRepo', () => ({
  FileSystemRepo: {
    localPath: (id: string) => `file:///doc/offline/${id}`,
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined)
  }
}))

const mockOnlineState = { online: true, type: 'wifi' as string }
const mockOnlineListeners = new Set<(v: boolean) => void>()
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({
    getCurrent: () => mockOnlineState.online,
    getNetType: () => mockOnlineState.type,
    subscribe: (l: (v: boolean) => void) => {
      mockOnlineListeners.add(l)
      return () => mockOnlineListeners.delete(l)
    }
  })
}))

import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader, _resetDownloaderForTests } from './Downloader'
import { OfflineSettingsAPI } from './offlineSettings'

const meta = { rev: '1', md5sum: 'm', size: 100, name: 'a' }
const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve() }

describe('Downloader', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    mockOnlineState.online = true
    mockOnlineState.type = 'wifi'
    mockOnlineListeners.clear()
    _resetDownloaderForTests()
    Downloader.init({
      buildUrl: (fileId: string) => `https://stack/files/download/${fileId}`,
      getAuthHeaders: () => ({ Authorization: 'Bearer T' })
    })
  })

  it('downloads a queued file and marks it downloaded', async () => {
    mockDownloadAsync.mockResolvedValueOnce({ status: 200, uri: 'file:///doc/offline/f1' })
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    await flush()
    expect(mockDownloadAsync).toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
  })

  it('marks failed after 3 retries and stops', async () => {
    jest.useFakeTimers()
    mockDownloadAsync.mockRejectedValue(new Error('network'))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush(); await flush()
    jest.advanceTimersByTime(2000); await flush(); await flush()
    jest.advanceTimersByTime(8000); await flush(); await flush()
    jest.advanceTimersByTime(30000); await flush(); await flush()
    expect(mockDownloadAsync).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
    expect(OfflineFilesStore.get('f1')?.state).toBe('failed')
    jest.useRealTimers()
  })

  it('respects max-4 concurrency', async () => {
    let resolveOne: (() => void) | undefined
    mockDownloadAsync.mockImplementation(
      () => new Promise(resolve => { resolveOne = () => resolve({ status: 200, uri: '' }) })
    )
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      OfflineFilesStore.pin(id, meta)
      Downloader.enqueue(id)
    }
    await flush()
    expect(mockDownloadAsync).toHaveBeenCalledTimes(4)
    resolveOne?.()
    await flush(); await flush()
    expect(mockDownloadAsync).toHaveBeenCalledTimes(5)
  })

  it('cancel aborts in-flight and removes from queue', async () => {
    mockDownloadAsync.mockImplementation(() => new Promise(() => { /* never resolves */ }))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    await Downloader.cancel('f1')
    expect(mockCancelAsync).toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
  })

  it('pauses queue when going offline; resumes when going online', async () => {
    mockDownloadAsync.mockImplementationOnce(() => new Promise(() => { /* never resolves */ }))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    mockOnlineState.online = false
    for (const l of mockOnlineListeners) l(false)
    await flush()
    expect(mockCancelAsync).toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
    mockOnlineState.online = true
    mockDownloadAsync.mockResolvedValueOnce({ status: 200, uri: 'file:///doc/offline/f1' })
    for (const l of mockOnlineListeners) l(true)
    await flush(); await flush()
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
  })

  it('wifi-only pauses queue on cellular', async () => {
    OfflineSettingsAPI.set({ wifiOnly: true })
    mockOnlineState.type = 'cellular'
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    expect(mockDownloadAsync).not.toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
  })

  it('sets diskFull flag and stops queue on ENOSPC', async () => {
    mockDownloadAsync.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush(); await flush()
    expect(OfflineSettingsAPI.status.get().diskFull).toBe(true)
  })
})
