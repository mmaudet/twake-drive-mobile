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

jest.mock('./FileSystemRepo', () => ({
  FileSystemRepo: {
    localPath: (id: string) => `/o/${id}`,
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined)
  }
}))

jest.mock('./Downloader', () => ({
  Downloader: {
    enqueue: jest.fn(),
    cancel: jest.fn().mockResolvedValue(undefined)
  }
}))

import { OfflineFilesStore } from './OfflineFilesStore'
import { startPinReactor } from './pinReactor'
import { Downloader } from './Downloader'

const mockEnqueue = Downloader.enqueue as jest.Mock

type FakeChange = { id: string; doc: Record<string, unknown> }
type ChangesListener = (c: FakeChange) => void

const makeFakePouch = (): {
  emit: (c: FakeChange) => void
  cancel: jest.Mock
} => {
  const listeners: ChangesListener[] = []
  const cancel = jest.fn()
  const fakeChanges = {
    on(event: string, cb: ChangesListener) {
      if (event === 'change') listeners.push(cb)
      return fakeChanges
    },
    cancel
  }
  const fakePouch = {
    changes: () => fakeChanges
  }
  startPinReactor(fakePouch as never)
  return {
    cancel,
    emit: (c: FakeChange) => listeners.forEach(l => l(c))
  }
}

describe('pinReactor', () => {
  beforeEach(() => {
    mockStore.clear()
    mockEnqueue.mockClear()
  })

  it('enqueues re-download when md5sum changes on a pinned file', () => {
    OfflineFilesStore.pin('f1', { rev: '1-a', md5sum: 'OLD', size: 1, name: 'a' })
    OfflineFilesStore.markDownloaded('f1')
    const pouch = makeFakePouch()
    pouch.emit({ id: 'f1', doc: { _id: 'f1', _rev: '2-b', md5sum: 'NEW', type: 'file' } })
    expect(mockEnqueue).toHaveBeenCalledWith('f1')
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
    expect(OfflineFilesStore.get('f1')?.md5sum).toBe('NEW')
  })

  it('does NOT enqueue when only _rev changes (md5sum unchanged)', () => {
    OfflineFilesStore.pin('f1', { rev: '1-a', md5sum: 'SAME', size: 1, name: 'a' })
    OfflineFilesStore.markDownloaded('f1')
    const pouch = makeFakePouch()
    pouch.emit({ id: 'f1', doc: { _id: 'f1', _rev: '2-b', md5sum: 'SAME', type: 'file' } })
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
  })

  it('purges when a pinned file is trashed remotely', async () => {
    OfflineFilesStore.pin('f1', { rev: '1', md5sum: 'm', size: 1, name: 'a' })
    OfflineFilesStore.markDownloaded('f1')
    const pouch = makeFakePouch()
    pouch.emit({ id: 'f1', doc: { _id: 'f1', _rev: '2', md5sum: 'm', type: 'file', trashed: true } })
    await new Promise(r => setImmediate(r))
    expect(OfflineFilesStore.get('f1')).toBeUndefined()
  })

  it('pins a new file added to a pinned folder', () => {
    OfflineFilesStore.pinFolder('d1', { dirId: 'd1', name: 'F', pinnedAt: 0 })
    const pouch = makeFakePouch()
    pouch.emit({
      id: 'fnew',
      doc: { _id: 'fnew', _rev: '1', md5sum: 'x', size: 5, name: 'new.pdf', type: 'file', dir_id: 'd1' }
    })
    expect(mockEnqueue).toHaveBeenCalledWith('fnew')
    expect(OfflineFilesStore.get('fnew')?.parentFolderPins).toEqual(['d1'])
  })
})
