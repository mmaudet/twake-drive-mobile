const mockStore = new Map<string, string>()

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: (k: string, v: string): void => {
      mockStore.set(k, v)
    },
    getString: (k: string): string | undefined => mockStore.get(k),
    remove: (k: string): boolean => mockStore.delete(k),
    getAllKeys: (): string[] => Array.from(mockStore.keys()),
    clearAll: (): void => {
      mockStore.clear()
    }
  })
}))

jest.mock('./FileSystemRepo', () => ({
  FileSystemRepo: {
    localPath: (id: string) => `/offline/${id}`,
    exists: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(undefined)
  }
}))

import { OfflineFilesStore } from './OfflineFilesStore'

const baseMeta = { rev: '1-abc', md5sum: 'm1', size: 100, name: 'doc.pdf' }

describe('OfflineFilesStore', () => {
  beforeEach(() => mockStore.clear())

  it('pin creates a pending entry with isDirectPin=true', () => {
    OfflineFilesStore.pin('f1', baseMeta)
    const e = OfflineFilesStore.get('f1')
    expect(e).toMatchObject({
      fileId: 'f1',
      state: 'pending',
      isDirectPin: true,
      parentFolderPins: [],
      md5sum: 'm1'
    })
  })

  it('pin is idempotent for state/isDirectPin', () => {
    OfflineFilesStore.pin('f1', baseMeta)
    OfflineFilesStore.markDownloaded('f1')
    OfflineFilesStore.pin('f1', baseMeta)
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
    expect(OfflineFilesStore.get('f1')?.isDirectPin).toBe(true)
  })

  it('pinViaFolder adds the dirId to parentFolderPins (creates entry with isDirectPin=false)', () => {
    OfflineFilesStore.pinViaFolder('f1', 'd1', baseMeta)
    const e = OfflineFilesStore.get('f1')
    expect(e?.isDirectPin).toBe(false)
    expect(e?.parentFolderPins).toEqual(['d1'])
  })

  it('pinViaFolder twice with different dirIds accumulates parentFolderPins without duplicates', () => {
    OfflineFilesStore.pinViaFolder('f1', 'd1', baseMeta)
    OfflineFilesStore.pinViaFolder('f1', 'd2', baseMeta)
    OfflineFilesStore.pinViaFolder('f1', 'd1', baseMeta)
    expect(OfflineFilesStore.get('f1')?.parentFolderPins).toEqual(['d1', 'd2'])
  })

  it('unpin clears isDirectPin; keeps entry if still pinned via a folder', async () => {
    OfflineFilesStore.pinViaFolder('f1', 'd1', baseMeta)
    OfflineFilesStore.pin('f1', baseMeta)
    expect(OfflineFilesStore.get('f1')?.isDirectPin).toBe(true)
    await OfflineFilesStore.unpin('f1')
    const e = OfflineFilesStore.get('f1')
    expect(e?.isDirectPin).toBe(false)
    expect(e?.parentFolderPins).toEqual(['d1'])
  })

  it('unpin purges entry + blob when no folder pin and no direct pin remain', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const FS = jest.requireMock('./FileSystemRepo').FileSystemRepo as { delete: jest.Mock }
    OfflineFilesStore.pin('f1', baseMeta)
    await OfflineFilesStore.unpin('f1')
    expect(OfflineFilesStore.get('f1')).toBeUndefined()
    expect(FS.delete).toHaveBeenCalledWith('f1')
  })

  it('unpinFolder removes the dirId from parentFolderPins of each file; purges those no longer pinned', async () => {
    OfflineFilesStore.pinFolder('d1', { name: 'F', dirId: 'd1', pinnedAt: 0 })
    OfflineFilesStore.pinViaFolder('f1', 'd1', baseMeta)
    OfflineFilesStore.pinViaFolder('f2', 'd1', baseMeta)
    OfflineFilesStore.pin('f2', baseMeta) // f2 also direct
    await OfflineFilesStore.unpinFolder('d1')
    expect(OfflineFilesStore.getFolder('d1')).toBeUndefined()
    expect(OfflineFilesStore.get('f1')).toBeUndefined() // fully purged
    expect(OfflineFilesStore.get('f2')?.parentFolderPins).toEqual([])
    expect(OfflineFilesStore.get('f2')?.isDirectPin).toBe(true)
  })

  it('unpinFolder recursively purges nested subfolders + their files (no disk leak)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const FS = jest.requireMock('./FileSystemRepo').FileSystemRepo as { delete: jest.Mock }
    FS.delete.mockClear()
    // A ⊃ B ⊃ f : B records A as an ancestor; f is tagged under its immediate parent B.
    OfflineFilesStore.pinFolder('A', { name: 'A', dirId: 'A', pinnedAt: 0, ancestorPins: [] })
    OfflineFilesStore.pinFolder('B', { name: 'B', dirId: 'B', pinnedAt: 0, ancestorPins: ['A'] })
    OfflineFilesStore.pinViaFolder('f', 'B', baseMeta)
    await OfflineFilesStore.unpinFolder('A')
    expect(OfflineFilesStore.getFolder('A')).toBeUndefined()
    expect(OfflineFilesStore.getFolder('B')).toBeUndefined() // nested subfolder removed
    expect(OfflineFilesStore.get('f')).toBeUndefined() // nested file purged
    expect(FS.delete).toHaveBeenCalledWith('f') // blob deleted from disk
  })

  it('subscribe is called on every mutation; unsubscribe stops notifications', () => {
    const listener = jest.fn()
    const off = OfflineFilesStore.subscribe('f1', listener)
    OfflineFilesStore.pin('f1', baseMeta)
    expect(listener).toHaveBeenCalledTimes(1)
    OfflineFilesStore.markDownloaded('f1')
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    OfflineFilesStore.update('f1', e => ({ ...e, retryCount: 1 }))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
