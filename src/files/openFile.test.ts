import * as FileSystem from 'expo-file-system/legacy'
import FileViewer from 'react-native-file-viewer'

import { openFileNatively } from './openFile'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'

const mockIsPinnedAndDownloaded = OfflineFilesStore.isPinnedAndDownloaded as jest.Mock

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  copyAsync: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('react-native-file-viewer', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue(undefined) }
}))

jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: { isPinnedAndDownloaded: jest.fn().mockReturnValue(false) }
}))
jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath: (id: string) => `file:///offline/${id}` }
}))

const makeClient = (token: string | null = 'tok-1', uri = 'https://alice.example.com') =>
  ({
    getStackClient: () => ({
      uri,
      getAccessToken: () => token
    })
  }) as unknown as import('cozy-client').default

describe('openFileNatively', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // clearAllMocks doesn't drain mockResolvedValueOnce queues; reset the
    // ones each test schedules so cross-test leakage doesn't happen.
    ;(FileSystem.getInfoAsync as jest.Mock).mockReset()
    ;(FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false })
    ;(FileSystem.copyAsync as jest.Mock).mockReset()
    ;(FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined)
  })

  it('downloads to cache and opens via FileViewer', async () => {
    ;(FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
      status: 200,
      uri: 'file:///cache/twake-drive/abc-test.pdf'
    })
    await openFileNatively(makeClient(), { _id: 'abc', name: 'test.pdf', mime: 'application/pdf' })
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///cache/twake-drive/', {
      intermediates: true
    })
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      'https://alice.example.com/files/download/abc',
      'file:///cache/twake-drive/abc-test.pdf',
      { headers: { Authorization: 'Bearer tok-1' } }
    )
    expect(FileViewer.open).toHaveBeenCalledWith('file:///cache/twake-drive/abc-test.pdf', {
      showOpenWithDialog: true,
      showAppsSuggestions: true
    })
  })

  it('throws when no token is available', async () => {
    await expect(
      openFileNatively(makeClient(null), { _id: 'abc', name: 't.pdf' })
    ).rejects.toThrow(/access token/)
  })

  it('throws when download status is non-2xx', async () => {
    ;(FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
      status: 404,
      uri: 'file:///cache/twake-drive/abc-test.pdf'
    })
    await expect(
      openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    ).rejects.toThrow(/HTTP 404/)
  })

  it('copies the pinned blob to cache (with extension) then opens it', async () => {
    mockIsPinnedAndDownloaded.mockReturnValueOnce(true)
    ;(FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true, size: 1024 }) // blob check
      .mockResolvedValueOnce({ exists: false })            // alias check (missing)
      .mockResolvedValueOnce({ exists: true, size: 1024 }) // alias post-copy
    await openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled()
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///offline/abc',
      to: 'file:///cache/twake-drive/abc-t.pdf'
    })
    expect(FileViewer.open).toHaveBeenCalledWith(
      'file:///cache/twake-drive/abc-t.pdf',
      expect.any(Object)
    )
  })

  it('skips the copy if the cache alias already exists', async () => {
    mockIsPinnedAndDownloaded.mockReturnValueOnce(true)
    ;(FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true, size: 1024 }) // blob check
      .mockResolvedValueOnce({ exists: true, size: 1024 }) // alias check (exists)
      .mockResolvedValueOnce({ exists: true, size: 1024 }) // alias re-check
    await openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    expect(FileSystem.copyAsync).not.toHaveBeenCalled()
    expect(FileViewer.open).toHaveBeenCalledWith(
      'file:///cache/twake-drive/abc-t.pdf',
      expect.any(Object)
    )
  })

  it('throws when the pinned blob is missing on disk', async () => {
    mockIsPinnedAndDownloaded.mockReturnValueOnce(true)
    ;(FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false })
    await expect(
      openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    ).rejects.toThrow(/missing on disk/)
  })

  it('sanitizes filename slashes', async () => {
    ;(FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
      status: 200,
      uri: 'file:///cache/twake-drive/abc-weird_name'
    })
    await openFileNatively(makeClient(), { _id: 'abc', name: 'weird/name' })
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      'https://alice.example.com/files/download/abc',
      'file:///cache/twake-drive/abc-weird_name',
      expect.any(Object)
    )
  })
})
