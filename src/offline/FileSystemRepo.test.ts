jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([])
}))

import * as FS from 'expo-file-system/legacy'
import { FileSystemRepo } from './FileSystemRepo'

describe('FileSystemRepo', () => {
  beforeEach(() => jest.clearAllMocks())

  it('localPath returns documentDirectory/offline/{fileId}', () => {
    expect(FileSystemRepo.localPath('abc')).toBe('file:///doc/offline/abc')
  })

  it('init creates the offline directory if missing', async () => {
    ;(FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false })
    await FileSystemRepo.init()
    expect(FS.makeDirectoryAsync).toHaveBeenCalledWith('file:///doc/offline/', {
      intermediates: true
    })
  })

  it('init is idempotent', async () => {
    ;(FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, isDirectory: true })
    await FileSystemRepo.init()
    expect(FS.makeDirectoryAsync).not.toHaveBeenCalled()
  })

  it('exists returns true when the file is on disk', async () => {
    ;(FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 12 })
    expect(await FileSystemRepo.exists('abc')).toBe(true)
  })

  it('delete removes the blob and is silent if missing', async () => {
    await FileSystemRepo.delete('abc')
    expect(FS.deleteAsync).toHaveBeenCalledWith('file:///doc/offline/abc', { idempotent: true })
  })

  it('totalBytes sums getInfoAsync.size across the directory', async () => {
    ;(FS.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['abc', 'def'])
    ;(FS.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true, size: 10 })
      .mockResolvedValueOnce({ exists: true, size: 20 })
    expect(await FileSystemRepo.totalBytes()).toBe(30)
  })
})
