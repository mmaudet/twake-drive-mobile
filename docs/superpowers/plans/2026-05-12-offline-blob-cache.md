# Offline Blob Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pin files / folders for guaranteed offline access; persist blobs under `documentDirectory/offline/{fileId}`; auto re-download on `md5sum` change via the PouchDB changes feed; expose state in the UI + a dedicated Settings screen.

**Architecture:** A new `src/offline/` module containing four collaborating units (`OfflineFilesStore`, `Downloader`, `FileSystemRepo`, `pinReactor`) backed by MMKV for the index and `expo-file-system` legacy for the blobs. Network state is centralized in a non-React `OnlineMonitor` singleton (extracted from the existing `useIsOnline`) so both React hooks and the Downloader read the same source of truth. The reactor subscribes to the local PouchDB changes feed on `io.cozy.files` and reacts to `md5sum` changes (re-download), trash (purge), and folder live-add. UI integrates via a `PinnedBadge` on rows, a "Keep offline" toggle in the metadata sheet, and a Settings screen for management.

**Tech Stack:** React Native + Expo SDK 54, expo-file-system (legacy), react-native-mmkv 4.x, @react-native-community/netinfo, cozy-pouch-link, cozy-client. Test runner: jest@29 + jest-expo. Codebase style: TypeScript strict, ESLint, conventional commits.

**Reference spec:** `docs/superpowers/specs/2026-05-12-offline-blob-cache-design.md`

---

## File map

### Files to create

```
src/offline/types.ts                  // shared types: OfflineFileEntry, OfflineFolderEntry, OfflineFileState
src/offline/storage.ts                // MMKV instance wrappers (offline-files, offline-settings)
src/offline/OfflineFilesStore.ts      // facade: pin/unpin/purge + observable
src/offline/FileSystemRepo.ts         // offline blob filesystem + iOS NSURLIsExcludedFromBackupKey
src/offline/Downloader.ts             // queue + createDownloadResumable + backoff + network gating
src/offline/pinReactor.ts             // PouchDB changes-feed listener
src/offline/useOfflineState.ts        // hook: state for one fileId
src/offline/useOfflineActions.ts      // hook: pin / pinFolder / unpin / unpinFolder with confirmation
src/offline/offlineSettings.ts        // wifiOnly + diskFull flags
src/offline/PinnedBadge.tsx           // visual badge component
src/network/OnlineMonitor.ts          // plain singleton wrapping NetInfo + probe
src/i18n/<inline edits>               // new drive.offline.* keys
app/(drive)/settings/_layout.tsx      // settings stack
app/(drive)/settings/index.tsx        // settings landing screen (single entry: offline storage)
app/(drive)/settings/offline-storage.tsx  // the Offline Storage screen

src/offline/types.test.ts             // (no runtime tests — types only)
src/offline/OfflineFilesStore.test.ts
src/offline/FileSystemRepo.test.ts
src/offline/Downloader.test.ts
src/offline/pinReactor.test.ts
src/offline/PinnedBadge.test.tsx
src/network/OnlineMonitor.test.ts
```

### Files to modify

```
src/network/useIsOnline.ts            // delegate to OnlineMonitor (existing test stays green)
src/files/openFile.ts                 // fast-path for pinned + downloaded
src/files/openFile.test.ts            // add fast-path tests
src/ui/FileRow.tsx                    // PinnedBadge in left slot + onTogglePin menu item
src/ui/FolderRow.tsx                  // PinnedBadge in left slot + onTogglePin menu item
src/ui/FileMetadataSheet.tsx         // "Keep offline" toggle row
app/(drive)/_layout.tsx               // mount pinReactor + Settings tab/route
app/(drive)/files/[...path].tsx       // wire onTogglePin per row
app/(drive)/recent.tsx                // same
app/(drive)/trash.tsx                 // same (unpin only — files in trash are never freshly pinned)
app/(drive)/shared/[...path].tsx      // same
app/(drive)/shareddrives/[...path].tsx // same
src/i18n/locales/en.json              // add keys (see section 5.5 of spec)
src/i18n/locales/fr.json              // add keys
ios/TwakeDrive/Info.plist             // (nothing — sandbox is enough)
android/app/src/main/AndroidManifest.xml  // android:allowBackup="false" if not already
android/app/src/main/res/xml/data_extraction_rules.xml  // exclude files/offline/
```

> **Note on conventional commits in this plan:** every commit message uses the format `<type>(offline): <subject>` (or another scope when not offline-specific). Atomic commits are mandatory per project convention.

> **Branch:** before starting, create a feature branch:
> ```bash
> git checkout -b feat/offline-blob-cache
> ```

---

## Task 1: Scaffolding — `src/offline/` directory and `types.ts`

**Files:**
- Create: `src/offline/types.ts`
- Create: `src/offline/README.md` (one-paragraph module description)

- [ ] **Step 1: Create the directory and shared types**

Create `src/offline/types.ts`:

```ts
export type OfflineFileState =
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'failed'
  | 'paused-auth'

export interface OfflineFileEntry {
  fileId: string
  state: OfflineFileState
  rev: string
  md5sum: string
  size: number
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
```

- [ ] **Step 2: Add a one-paragraph README**

Create `src/offline/README.md`:

```md
# Offline blob cache

Pin files / folders for guaranteed offline access. Blobs are stored under
`documentDirectory/offline/{fileId}`. The MMKV-backed `OfflineFilesStore`
indexes pins; the `Downloader` queue handles fetches with backoff and
network gating; the `pinReactor` listens on the local PouchDB changes
feed and re-downloads on `md5sum` change. See
`docs/superpowers/specs/2026-05-12-offline-blob-cache-design.md` for the
design rationale.
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors introduced (any pre-existing errors are not your concern in this task).

- [ ] **Step 4: Commit**

```bash
git add src/offline/types.ts src/offline/README.md
git commit -m "chore(offline): scaffold src/offline module with shared types"
```

---

## Task 2: `OnlineMonitor` — plain non-React observable

**Why this task exists:** The Downloader (Task 5/6) is a singleton, not a React component, and cannot consume the `useIsOnline` hook. We need a plain observable that both the existing hook and the Downloader can read.

**Files:**
- Create: `src/network/OnlineMonitor.ts`
- Create: `src/network/OnlineMonitor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/network/OnlineMonitor.test.ts`:

```ts
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

jest.mock('@react-native-community/netinfo', () => {
  let listener: ((s: Partial<NetInfoState>) => void) | undefined
  return {
    addEventListener: jest.fn((cb: (s: Partial<NetInfoState>) => void) => {
      listener = cb
      return () => { listener = undefined }
    }),
    fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
    __emit: (s: Partial<NetInfoState>) => listener?.(s)
  }
})

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

const fetchMock = jest.fn()
;(global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch

import { createOnlineMonitor } from './OnlineMonitor'

describe('OnlineMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ status: 200 } as unknown as Response)
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('reports online from initial NetInfo state', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    expect(mon.getCurrent()).toBe(true)
    expect(mon.getNetType()).toBe('wifi')
  })

  it('flips to offline on NetInfo offline event and notifies subscribers', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    const listener = jest.fn()
    mon.subscribe(listener)
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none'
    })
    expect(listener).toHaveBeenCalledWith(false)
    expect(mon.getCurrent()).toBe(false)
  })

  it('falls back to probe when NetInfo says offline', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com', probeIntervalMs: 1000 })
    await flush()
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none'
    })
    expect(mon.getCurrent()).toBe(false)
    jest.advanceTimersByTime(1000)
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('https://stack.example.com/status', expect.any(Object))
    expect(mon.getCurrent()).toBe(true)
  })

  it('unsubscribe stops notifications', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    const listener = jest.fn()
    const off = mon.subscribe(listener)
    off()
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none'
    })
    expect(listener).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `yarn jest src/network/OnlineMonitor.test.ts`
Expected: FAIL with `Cannot find module './OnlineMonitor'`.

- [ ] **Step 3: Implement `OnlineMonitor`**

Create `src/network/OnlineMonitor.ts`:

```ts
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

export type OnlineListener = (online: boolean) => void

export interface OnlineMonitor {
  getCurrent(): boolean
  getNetType(): string | undefined
  subscribe(listener: OnlineListener): () => void
  /** For tests. */
  dispose(): void
}

interface CreateOptions {
  probeUri?: string
  probeIntervalMs?: number
  probeTimeoutMs?: number
}

const computeOnline = (s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(s.isConnected) && s.isInternetReachable !== false

export const createOnlineMonitor = (opts: CreateOptions = {}): OnlineMonitor => {
  const probeIntervalMs = opts.probeIntervalMs ?? 15 * 1000
  const probeTimeoutMs = opts.probeTimeoutMs ?? 8 * 1000

  let netInfoOnline = true
  let probeOnline: boolean | null = null
  let netType: string | undefined
  const listeners = new Set<OnlineListener>()

  const current = (): boolean => (probeOnline === null ? netInfoOnline : netInfoOnline || probeOnline)
  let lastEmitted = current()
  const emit = (): void => {
    const v = current()
    if (v === lastEmitted) return
    lastEmitted = v
    listeners.forEach(l => l(v))
  }

  const probe = async (): Promise<void> => {
    if (!opts.probeUri) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), probeTimeoutMs)
    try {
      const r = await fetch(`${opts.probeUri}/status`, {
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal
      })
      probeOnline = r.status >= 200 && r.status < 400
    } catch {
      probeOnline = false
    } finally {
      clearTimeout(timeout)
      emit()
    }
  }

  void NetInfo.fetch().then(s => {
    netInfoOnline = computeOnline(s)
    netType = s.type
    emit()
  })

  const unsubNetInfo = NetInfo.addEventListener(s => {
    netInfoOnline = computeOnline(s)
    netType = s.type
    emit()
  })

  const probeTimer = setInterval(() => void probe(), probeIntervalMs)
  void probe()

  return {
    getCurrent: () => current(),
    getNetType: () => netType,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      unsubNetInfo()
      clearInterval(probeTimer)
      listeners.clear()
    }
  }
}

let singleton: OnlineMonitor | null = null

export const getOnlineMonitor = (probeUri?: string): OnlineMonitor => {
  if (!singleton) singleton = createOnlineMonitor({ probeUri })
  return singleton
}

/** Test only. */
export const _resetOnlineMonitor = (): void => {
  singleton?.dispose()
  singleton = null
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `yarn jest src/network/OnlineMonitor.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/network/OnlineMonitor.ts src/network/OnlineMonitor.test.ts
git commit -m "feat(offline): add OnlineMonitor singleton (NetInfo + probe)"
```

---

## Task 3: Refactor `useIsOnline` to delegate to `OnlineMonitor`

**Why:** Two sources of truth for online state would diverge. The hook becomes a thin React wrapper.

**Files:**
- Modify: `src/network/useIsOnline.ts`
- Modify (verify still passing): `src/network/useIsOnline.test.ts`

- [ ] **Step 1: Rewrite `useIsOnline.ts`**

Replace the entire file content with:

```ts
import { useEffect, useState } from 'react'
import { useClient } from 'cozy-client'

import { getOnlineMonitor } from './OnlineMonitor'

export const useIsOnline = (): boolean => {
  const client = useClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const probeUri = (client as any)?.getStackClient?.().uri as string | undefined
  const monitor = getOnlineMonitor(probeUri)
  const [online, setOnline] = useState<boolean>(monitor.getCurrent())
  useEffect(() => {
    return monitor.subscribe(setOnline)
  }, [monitor])
  return online
}
```

- [ ] **Step 2: Run the existing `useIsOnline` test**

Run: `yarn jest src/network/useIsOnline.test.ts`
Expected: PASS — the existing test mocks NetInfo at the module level which `OnlineMonitor` also reads, so the behavior is preserved. If the existing test breaks because it expected internal probe timers to behave a certain way, update its mocks to mock `getOnlineMonitor` directly:

```ts
// At the top of useIsOnline.test.ts, add:
jest.mock('./OnlineMonitor', () => {
  let value = true
  const listeners = new Set<(v: boolean) => void>()
  return {
    getOnlineMonitor: () => ({
      getCurrent: () => value,
      getNetType: () => 'wifi',
      subscribe: (l: (v: boolean) => void) => { listeners.add(l); return () => listeners.delete(l) },
      dispose: () => {}
    }),
    __setOnline: (v: boolean) => { value = v; listeners.forEach(l => l(v)) }
  }
})
```

Only adjust the test if it actually fails; if it still passes, leave it alone.

- [ ] **Step 3: Run full type check + lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/network/useIsOnline.ts src/network/useIsOnline.test.ts
git commit -m "refactor(network): delegate useIsOnline to OnlineMonitor singleton"
```

---

## Task 4: `FileSystemRepo` — offline blob filesystem

**Files:**
- Create: `src/offline/FileSystemRepo.ts`
- Create: `src/offline/FileSystemRepo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/offline/FileSystemRepo.test.ts`:

```ts
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
    expect(FS.makeDirectoryAsync).toHaveBeenCalledWith('file:///doc/offline/', { intermediates: true })
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
```

- [ ] **Step 2: Run — expect failure**

Run: `yarn jest src/offline/FileSystemRepo.test.ts`
Expected: FAIL with `Cannot find module './FileSystemRepo'`.

- [ ] **Step 3: Implement `FileSystemRepo`**

Create `src/offline/FileSystemRepo.ts`:

```ts
import * as FS from 'expo-file-system/legacy'

const dir = (): string => {
  if (!FS.documentDirectory) throw new Error('documentDirectory unavailable')
  return `${FS.documentDirectory}offline/`
}

export const FileSystemRepo = {
  dir,
  localPath: (fileId: string): string => `${dir()}${fileId}`,
  async init(): Promise<void> {
    const info = await FS.getInfoAsync(dir())
    if (!info.exists) {
      await FS.makeDirectoryAsync(dir(), { intermediates: true })
    }
  },
  async exists(fileId: string): Promise<boolean> {
    const info = await FS.getInfoAsync(FileSystemRepo.localPath(fileId))
    return Boolean(info.exists)
  },
  async delete(fileId: string): Promise<void> {
    await FS.deleteAsync(FileSystemRepo.localPath(fileId), { idempotent: true })
  },
  async totalBytes(): Promise<number> {
    const names = await FS.readDirectoryAsync(dir())
    let total = 0
    for (const name of names) {
      const info = await FS.getInfoAsync(`${dir()}${name}`)
      if (info.exists && 'size' in info && typeof info.size === 'number') total += info.size
    }
    return total
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `yarn jest src/offline/FileSystemRepo.test.ts`
Expected: PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/offline/FileSystemRepo.ts src/offline/FileSystemRepo.test.ts
git commit -m "feat(offline): add FileSystemRepo for blob storage"
```

---

## Task 5: `OfflineFilesStore` — MMKV-backed store with observable

**Files:**
- Create: `src/offline/storage.ts` (MMKV instances)
- Create: `src/offline/OfflineFilesStore.ts`
- Create: `src/offline/OfflineFilesStore.test.ts`

- [ ] **Step 1: Add MMKV instance wrappers**

Create `src/offline/storage.ts`:

```ts
import { MMKV } from 'react-native-mmkv'

export const offlineFilesStorage = new MMKV({ id: 'offline-files' })
export const offlineSettingsStorage = new MMKV({ id: 'offline-settings' })

export const FILE_KEY_PREFIX = 'offline:file:'
export const FOLDER_KEY_PREFIX = 'offline:folder:'
export const SETTINGS_KEY = 'settings'
export const STATUS_KEY = 'status'

export const fileKey = (fileId: string): string => `${FILE_KEY_PREFIX}${fileId}`
export const folderKey = (dirId: string): string => `${FOLDER_KEY_PREFIX}${dirId}`
```

- [ ] **Step 2: Write the failing test**

Create `src/offline/OfflineFilesStore.test.ts`:

```ts
const mockStore = new Map<string, string>()

jest.mock('react-native-mmkv', () => {
  class MMKV {
    set(k: string, v: string): void { mockStore.set(k, v) }
    getString(k: string): string | undefined { return mockStore.get(k) }
    delete(k: string): void { mockStore.delete(k) }
    getAllKeys(): string[] { return Array.from(mockStore.keys()) }
    clearAll(): void { mockStore.clear() }
  }
  return { MMKV }
})

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
    const FS = jest.requireMock('./FileSystemRepo').FileSystemRepo
    OfflineFilesStore.pin('f1', baseMeta)
    await OfflineFilesStore.unpin('f1')
    expect(OfflineFilesStore.get('f1')).toBeUndefined()
    expect(FS.delete).toHaveBeenCalledWith('f1')
  })

  it('unpinFolder removes the dirId from parentFolderPins of each file; purges those no longer pinned', async () => {
    OfflineFilesStore.pinFolder('d1', { name: 'F', dirId: 'd1' })
    OfflineFilesStore.pinViaFolder('f1', 'd1', baseMeta)
    OfflineFilesStore.pinViaFolder('f2', 'd1', baseMeta)
    OfflineFilesStore.pin('f2', baseMeta) // f2 also direct
    await OfflineFilesStore.unpinFolder('d1')
    expect(OfflineFilesStore.getFolder('d1')).toBeUndefined()
    expect(OfflineFilesStore.get('f1')).toBeUndefined()  // fully purged
    expect(OfflineFilesStore.get('f2')?.parentFolderPins).toEqual([])
    expect(OfflineFilesStore.get('f2')?.isDirectPin).toBe(true)
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
```

- [ ] **Step 3: Run — expect failure**

Run: `yarn jest src/offline/OfflineFilesStore.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `OfflineFilesStore`**

Create `src/offline/OfflineFilesStore.ts`:

```ts
import { OfflineFileEntry, OfflineFileState, OfflineFolderEntry } from './types'
import {
  FILE_KEY_PREFIX,
  FOLDER_KEY_PREFIX,
  fileKey,
  folderKey,
  offlineFilesStorage
} from './storage'
import { FileSystemRepo } from './FileSystemRepo'

type FileListener = (entry: OfflineFileEntry | undefined) => void
type GlobalListener = () => void

const fileListeners = new Map<string, Set<FileListener>>()
const globalListeners = new Set<GlobalListener>()

const notify = (fileId: string): void => {
  const entry = readEntry(fileId)
  fileListeners.get(fileId)?.forEach(l => l(entry))
  globalListeners.forEach(l => l())
}

const readEntry = (fileId: string): OfflineFileEntry | undefined => {
  const raw = offlineFilesStorage.getString(fileKey(fileId))
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as OfflineFileEntry
  } catch {
    offlineFilesStorage.delete(fileKey(fileId))
    return undefined
  }
}

const writeEntry = (entry: OfflineFileEntry): void => {
  offlineFilesStorage.set(fileKey(entry.fileId), JSON.stringify(entry))
  notify(entry.fileId)
}

const deleteEntry = (fileId: string): void => {
  offlineFilesStorage.delete(fileKey(fileId))
  notify(fileId)
}

export interface PinMeta {
  rev: string
  md5sum: string
  size: number
  name: string
}

const buildEntry = (
  fileId: string,
  meta: PinMeta,
  prev?: OfflineFileEntry
): OfflineFileEntry => ({
  fileId,
  state: prev?.state ?? 'pending',
  rev: meta.rev,
  md5sum: meta.md5sum,
  size: meta.size,
  bytesDownloaded: prev?.bytesDownloaded,
  localPath: FileSystemRepo.localPath(fileId),
  pinnedAt: prev?.pinnedAt ?? Date.now(),
  isDirectPin: prev?.isDirectPin ?? false,
  parentFolderPins: prev?.parentFolderPins ?? [],
  retryCount: prev?.retryCount,
  lastError: prev?.lastError
})

export const OfflineFilesStore = {
  get: readEntry,

  getAll(): OfflineFileEntry[] {
    return offlineFilesStorage
      .getAllKeys()
      .filter(k => k.startsWith(FILE_KEY_PREFIX))
      .map(k => k.slice(FILE_KEY_PREFIX.length))
      .map(id => readEntry(id))
      .filter((e): e is OfflineFileEntry => !!e)
  },

  getFolder(dirId: string): OfflineFolderEntry | undefined {
    const raw = offlineFilesStorage.getString(folderKey(dirId))
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as OfflineFolderEntry
    } catch {
      return undefined
    }
  },

  getAllFolders(): OfflineFolderEntry[] {
    return offlineFilesStorage
      .getAllKeys()
      .filter(k => k.startsWith(FOLDER_KEY_PREFIX))
      .map(k => k.slice(FOLDER_KEY_PREFIX.length))
      .map(id => OfflineFilesStore.getFolder(id))
      .filter((e): e is OfflineFolderEntry => !!e)
  },

  pin(fileId: string, meta: PinMeta): void {
    const prev = readEntry(fileId)
    const next = buildEntry(fileId, meta, prev)
    next.isDirectPin = true
    writeEntry(next)
  },

  pinViaFolder(fileId: string, dirId: string, meta: PinMeta): void {
    const prev = readEntry(fileId)
    const next = buildEntry(fileId, meta, prev)
    if (!next.parentFolderPins.includes(dirId)) {
      next.parentFolderPins = [...next.parentFolderPins, dirId]
    }
    writeEntry(next)
  },

  pinFolder(dirId: string, entry: OfflineFolderEntry): void {
    offlineFilesStorage.set(folderKey(dirId), JSON.stringify({ ...entry, pinnedAt: Date.now() }))
    globalListeners.forEach(l => l())
  },

  async unpin(fileId: string): Promise<void> {
    const entry = readEntry(fileId)
    if (!entry) return
    const next = { ...entry, isDirectPin: false }
    if (next.parentFolderPins.length === 0) {
      await FileSystemRepo.delete(fileId)
      deleteEntry(fileId)
      return
    }
    writeEntry(next)
  },

  async unpinFolder(dirId: string): Promise<void> {
    offlineFilesStorage.delete(folderKey(dirId))
    for (const entry of OfflineFilesStore.getAll()) {
      if (!entry.parentFolderPins.includes(dirId)) continue
      const next = {
        ...entry,
        parentFolderPins: entry.parentFolderPins.filter(d => d !== dirId)
      }
      if (next.parentFolderPins.length === 0 && !next.isDirectPin) {
        await FileSystemRepo.delete(entry.fileId)
        deleteEntry(entry.fileId)
      } else {
        writeEntry(next)
      }
    }
    globalListeners.forEach(l => l())
  },

  async purge(fileId: string): Promise<void> {
    await FileSystemRepo.delete(fileId)
    deleteEntry(fileId)
  },

  update(fileId: string, fn: (e: OfflineFileEntry) => OfflineFileEntry): void {
    const cur = readEntry(fileId)
    if (!cur) return
    writeEntry(fn(cur))
  },

  setState(fileId: string, state: OfflineFileState, patch: Partial<OfflineFileEntry> = {}): void {
    OfflineFilesStore.update(fileId, e => ({ ...e, ...patch, state }))
  },

  markDownloaded(fileId: string): void {
    OfflineFilesStore.update(fileId, e => ({
      ...e,
      state: 'downloaded',
      bytesDownloaded: undefined,
      retryCount: undefined,
      lastError: undefined
    }))
  },

  isPinnedAndDownloaded(fileId: string): boolean {
    const e = readEntry(fileId)
    return !!e && e.state === 'downloaded'
  },

  subscribe(fileId: string, listener: FileListener): () => void {
    let set = fileListeners.get(fileId)
    if (!set) {
      set = new Set()
      fileListeners.set(fileId, set)
    }
    set.add(listener)
    return () => set?.delete(listener)
  },

  subscribeAll(listener: GlobalListener): () => void {
    globalListeners.add(listener)
    return () => globalListeners.delete(listener)
  }
}
```

- [ ] **Step 5: Run — expect pass**

Run: `yarn jest src/offline/OfflineFilesStore.test.ts`
Expected: PASS 8/8.

- [ ] **Step 6: Commit**

```bash
git add src/offline/storage.ts src/offline/OfflineFilesStore.ts src/offline/OfflineFilesStore.test.ts
git commit -m "feat(offline): add OfflineFilesStore (MMKV index + observable)"
```

---

## Task 6: `Downloader` — queue, concurrency, downloads, backoff

**Files:**
- Create: `src/offline/Downloader.ts`
- Create: `src/offline/Downloader.test.ts`

- [ ] **Step 1: Add the `offlineSettings.ts` helper (used by Downloader for wifiOnly + diskFull)**

Create `src/offline/offlineSettings.ts`:

```ts
import { offlineSettingsStorage, SETTINGS_KEY, STATUS_KEY } from './storage'
import { OfflineSettings, OfflineStatus } from './types'

const DEFAULT: OfflineSettings = { wifiOnly: false }
const DEFAULT_STATUS: OfflineStatus = { diskFull: false }

const settingsListeners = new Set<() => void>()
const statusListeners = new Set<() => void>()

const readSettings = (): OfflineSettings => {
  const raw = offlineSettingsStorage.getString(SETTINGS_KEY)
  if (!raw) return DEFAULT
  try { return { ...DEFAULT, ...(JSON.parse(raw) as OfflineSettings) } } catch { return DEFAULT }
}

const readStatus = (): OfflineStatus => {
  const raw = offlineSettingsStorage.getString(STATUS_KEY)
  if (!raw) return DEFAULT_STATUS
  try { return { ...DEFAULT_STATUS, ...(JSON.parse(raw) as OfflineStatus) } } catch { return DEFAULT_STATUS }
}

export const OfflineSettingsAPI = {
  get: readSettings,
  set(patch: Partial<OfflineSettings>): void {
    const next = { ...readSettings(), ...patch }
    offlineSettingsStorage.set(SETTINGS_KEY, JSON.stringify(next))
    settingsListeners.forEach(l => l())
  },
  subscribe(l: () => void): () => void {
    settingsListeners.add(l)
    return () => settingsListeners.delete(l)
  },
  status: {
    get: readStatus,
    set(patch: Partial<OfflineStatus>): void {
      const next = { ...readStatus(), ...patch }
      offlineSettingsStorage.set(STATUS_KEY, JSON.stringify(next))
      statusListeners.forEach(l => l())
    },
    subscribe(l: () => void): () => void {
      statusListeners.add(l)
      return () => statusListeners.delete(l)
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/offline/Downloader.test.ts`:

```ts
const mockStore = new Map<string, string>()

jest.mock('react-native-mmkv', () => {
  class MMKV {
    set(k: string, v: string): void { mockStore.set(k, v) }
    getString(k: string): string | undefined { return mockStore.get(k) }
    delete(k: string): void { mockStore.delete(k) }
    getAllKeys(): string[] { return Array.from(mockStore.keys()) }
    clearAll(): void { mockStore.clear() }
  }
  return { MMKV }
})

const downloadAsync = jest.fn()
const pauseAsync = jest.fn()
const cancelAsync = jest.fn().mockResolvedValue(undefined)

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  createDownloadResumable: jest.fn((_uri: string, _path: string, _opts: unknown, _cb: unknown) => ({
    downloadAsync,
    pauseAsync,
    cancelAsync
  }))
}))

jest.mock('./FileSystemRepo', () => ({
  FileSystemRepo: {
    localPath: (id: string) => `file:///doc/offline/${id}`,
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined)
  }
}))

const onlineState = { online: true, type: 'wifi' as string }
const onlineListeners = new Set<(v: boolean) => void>()
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({
    getCurrent: () => onlineState.online,
    getNetType: () => onlineState.type,
    subscribe: (l: (v: boolean) => void) => { onlineListeners.add(l); return () => onlineListeners.delete(l) }
  }),
  _resetOnlineMonitor: () => onlineListeners.clear()
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
    onlineState.online = true
    onlineState.type = 'wifi'
    _resetDownloaderForTests()
    Downloader.init({
      buildUrl: (fileId: string) => `https://stack/files/download/${fileId}`,
      getAuthHeaders: () => ({ Authorization: 'Bearer T' })
    })
  })

  it('downloads a queued file and marks it downloaded', async () => {
    downloadAsync.mockResolvedValueOnce({ status: 200, uri: 'file:///doc/offline/f1' })
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    await flush()
    expect(downloadAsync).toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
  })

  it('marks failed after 3 retries and stops', async () => {
    jest.useFakeTimers()
    downloadAsync.mockRejectedValue(new Error('network'))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush() ; await flush()
    jest.advanceTimersByTime(2000) ; await flush() ; await flush()
    jest.advanceTimersByTime(8000) ; await flush() ; await flush()
    jest.advanceTimersByTime(30000) ; await flush() ; await flush()
    expect(downloadAsync).toHaveBeenCalledTimes(4) // 1 + 3 retries
    expect(OfflineFilesStore.get('f1')?.state).toBe('failed')
    jest.useRealTimers()
  })

  it('respects max-4 concurrency', async () => {
    let resolveOne!: () => void
    downloadAsync.mockImplementation(
      () => new Promise(resolve => { resolveOne = () => resolve({ status: 200, uri: '' }) })
    )
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      OfflineFilesStore.pin(id, meta)
      Downloader.enqueue(id)
    }
    await flush()
    expect(downloadAsync).toHaveBeenCalledTimes(4)
    resolveOne()
    await flush() ; await flush()
    expect(downloadAsync).toHaveBeenCalledTimes(5)
  })

  it('cancel aborts in-flight and removes from queue', async () => {
    downloadAsync.mockImplementation(() => new Promise(() => { /* never resolves */ }))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    await Downloader.cancel('f1')
    expect(cancelAsync).toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
  })

  it('pauses queue when going offline; resumes when going online', async () => {
    let resolveOne!: () => void
    downloadAsync.mockImplementationOnce(
      () => new Promise(resolve => { resolveOne = () => resolve({ status: 200, uri: '' }) })
    )
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    onlineState.online = false
    onlineListeners.forEach(l => l(false))
    await flush()
    expect(cancelAsync).toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
    resolveOne()
    onlineState.online = true
    onlineListeners.forEach(l => l(true))
    downloadAsync.mockResolvedValueOnce({ status: 200, uri: 'file:///doc/offline/f1' })
    await flush() ; await flush()
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
  })

  it('wifi-only pauses queue on cellular', async () => {
    OfflineSettingsAPI.set({ wifiOnly: true })
    onlineState.type = 'cellular'
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush()
    expect(downloadAsync).not.toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
  })

  it('sets diskFull flag and stops queue on ENOSPC', async () => {
    downloadAsync.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'))
    OfflineFilesStore.pin('f1', meta)
    Downloader.enqueue('f1')
    await flush() ; await flush()
    expect(OfflineSettingsAPI.status.get().diskFull).toBe(true)
  })
})
```

- [ ] **Step 3: Run — expect failure**

Run: `yarn jest src/offline/Downloader.test.ts`
Expected: FAIL with `Cannot find module './Downloader'`.

- [ ] **Step 4: Implement `Downloader`**

Create `src/offline/Downloader.ts`:

```ts
import * as FS from 'expo-file-system/legacy'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { OfflineFilesStore } from './OfflineFilesStore'
import { OfflineSettingsAPI } from './offlineSettings'

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
    const fileId = queue.shift()!
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
    OfflineFilesStore.markDownloaded(fileId)
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
    const retryCount = (OfflineFilesStore.get(fileId)?.retryCount ?? 0)
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
    if (timer) { clearTimeout(timer); retryTimers.delete(fileId) }
    const inFlt = inFlight.get(fileId)
    if (inFlt?.resumable) {
      try { await inFlt.resumable.cancelAsync() } catch { /* ignore */ }
    }
    inFlight.delete(fileId)
    OfflineFilesStore.update(fileId, e => ({ ...e, state: 'pending', bytesDownloaded: undefined }))
  },

  async pauseAll(): Promise<void> {
    for (const id of Array.from(inFlight.keys())) {
      const inFlt = inFlight.get(id)
      if (inFlt?.resumable) {
        try { await inFlt.resumable.cancelAsync() } catch { /* ignore */ }
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
  opts = undefined
}
```

- [ ] **Step 5: Run — expect pass**

Run: `yarn jest src/offline/Downloader.test.ts`
Expected: PASS 7/7. (Note: the retries test uses fake timers — make sure it doesn't leak by leaving `jest.useRealTimers()` at the end of the case.)

- [ ] **Step 6: Commit**

```bash
git add src/offline/offlineSettings.ts src/offline/Downloader.ts src/offline/Downloader.test.ts
git commit -m "feat(offline): add Downloader queue with retry + network gating"
```

---

## Task 7: `pinReactor` — PouchDB changes feed listener

**Files:**
- Create: `src/offline/pinReactor.ts`
- Create: `src/offline/pinReactor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/offline/pinReactor.test.ts`:

```ts
const mockStore = new Map<string, string>()

jest.mock('react-native-mmkv', () => {
  class MMKV {
    set(k: string, v: string): void { mockStore.set(k, v) }
    getString(k: string): string | undefined { return mockStore.get(k) }
    delete(k: string): void { mockStore.delete(k) }
    getAllKeys(): string[] { return Array.from(mockStore.keys()) }
    clearAll(): void { mockStore.clear() }
  }
  return { MMKV }
})

jest.mock('./FileSystemRepo', () => ({
  FileSystemRepo: {
    localPath: (id: string) => `/o/${id}`,
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined)
  }
}))

const enqueueMock = jest.fn()
jest.mock('./Downloader', () => ({
  Downloader: {
    enqueue: enqueueMock,
    cancel: jest.fn().mockResolvedValue(undefined)
  }
}))

import { OfflineFilesStore } from './OfflineFilesStore'
import { startPinReactor } from './pinReactor'

type FakeChange = { id: string; doc: Record<string, unknown> }
type ChangesListener = (c: FakeChange) => void

const makeFakePouch = (): {
  changes: jest.Mock
  emit: (c: FakeChange) => void
  cancel: jest.Mock
} => {
  const listeners: ChangesListener[] = []
  const cancel = jest.fn()
  const changes = jest.fn().mockImplementation(() => ({
    on: (event: string, cb: ChangesListener) => {
      if (event === 'change') listeners.push(cb)
      return changes()
    },
    cancel
  }))
  return {
    changes,
    cancel,
    emit: (c: FakeChange) => listeners.forEach(l => l(c))
  }
}

describe('pinReactor', () => {
  beforeEach(() => {
    mockStore.clear()
    enqueueMock.mockClear()
  })

  it('enqueues re-download when md5sum changes on a pinned file', () => {
    OfflineFilesStore.pin('f1', { rev: '1-a', md5sum: 'OLD', size: 1, name: 'a' })
    OfflineFilesStore.markDownloaded('f1')
    const pouch = makeFakePouch()
    startPinReactor(pouch as unknown as PouchDB.Database)
    pouch.emit({ id: 'f1', doc: { _id: 'f1', _rev: '2-b', md5sum: 'NEW', type: 'file' } })
    expect(enqueueMock).toHaveBeenCalledWith('f1')
    expect(OfflineFilesStore.get('f1')?.state).toBe('pending')
    expect(OfflineFilesStore.get('f1')?.md5sum).toBe('NEW')
  })

  it('does NOT enqueue when only _rev changes (md5sum unchanged)', () => {
    OfflineFilesStore.pin('f1', { rev: '1-a', md5sum: 'SAME', size: 1, name: 'a' })
    OfflineFilesStore.markDownloaded('f1')
    const pouch = makeFakePouch()
    startPinReactor(pouch as unknown as PouchDB.Database)
    pouch.emit({ id: 'f1', doc: { _id: 'f1', _rev: '2-b', md5sum: 'SAME', type: 'file' } })
    expect(enqueueMock).not.toHaveBeenCalled()
    expect(OfflineFilesStore.get('f1')?.state).toBe('downloaded')
  })

  it('purges when a pinned file is trashed remotely', async () => {
    OfflineFilesStore.pin('f1', { rev: '1', md5sum: 'm', size: 1, name: 'a' })
    OfflineFilesStore.markDownloaded('f1')
    const pouch = makeFakePouch()
    startPinReactor(pouch as unknown as PouchDB.Database)
    pouch.emit({ id: 'f1', doc: { _id: 'f1', _rev: '2', md5sum: 'm', type: 'file', trashed: true } })
    await new Promise(r => setImmediate(r))
    expect(OfflineFilesStore.get('f1')).toBeUndefined()
  })

  it('pins a new file added to a pinned folder', () => {
    OfflineFilesStore.pinFolder('d1', { dirId: 'd1', name: 'F', pinnedAt: 0 })
    const pouch = makeFakePouch()
    startPinReactor(pouch as unknown as PouchDB.Database)
    pouch.emit({
      id: 'fnew',
      doc: { _id: 'fnew', _rev: '1', md5sum: 'x', size: 5, name: 'new.pdf', type: 'file', dir_id: 'd1' }
    })
    expect(enqueueMock).toHaveBeenCalledWith('fnew')
    expect(OfflineFilesStore.get('fnew')?.parentFolderPins).toEqual(['d1'])
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `yarn jest src/offline/pinReactor.test.ts`
Expected: FAIL with `Cannot find module './pinReactor'`.

- [ ] **Step 3: Implement `pinReactor`**

Create `src/offline/pinReactor.ts`:

```ts
import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'

interface FileDoc {
  _id: string
  _rev: string
  type?: string
  md5sum?: string
  size?: number
  name?: string
  dir_id?: string
  trashed?: boolean
}

interface PouchLikeChange {
  id: string
  doc?: FileDoc
}

interface PouchLikeChanges {
  on(event: 'change', cb: (c: PouchLikeChange) => void): PouchLikeChanges
  on(event: 'error', cb: (err: unknown) => void): PouchLikeChanges
  cancel(): void
}

interface PouchLike {
  changes(opts: {
    since: 'now' | number | string
    live: boolean
    include_docs: boolean
  }): PouchLikeChanges
}

let activeChanges: PouchLikeChanges | undefined

const handleChange = (change: PouchLikeChange): void => {
  const doc = change.doc
  if (!doc || doc.type !== 'file') return
  const entry = OfflineFilesStore.get(doc._id)

  // Trash: purge if pinned.
  if (entry && doc.trashed === true) {
    void OfflineFilesStore.purge(doc._id)
    return
  }

  // md5sum change on a pinned file → re-download.
  if (entry && doc.md5sum && doc.md5sum !== entry.md5sum) {
    OfflineFilesStore.update(doc._id, e => ({
      ...e,
      md5sum: doc.md5sum!,
      rev: doc._rev,
      state: 'pending'
    }))
    Downloader.enqueue(doc._id)
    return
  }

  // New file in a pinned folder → pin + enqueue.
  if (!entry && doc.dir_id && OfflineFilesStore.getFolder(doc.dir_id)) {
    OfflineFilesStore.pinViaFolder(doc._id, doc.dir_id, {
      rev: doc._rev,
      md5sum: doc.md5sum ?? '',
      size: doc.size ?? 0,
      name: doc.name ?? doc._id
    })
    Downloader.enqueue(doc._id)
    return
  }
}

export const startPinReactor = (pouch: PouchLike): (() => void) => {
  const changes = pouch.changes({ since: 'now', live: true, include_docs: true })
  changes.on('change', handleChange)
  changes.on('error', () => { /* swallow; pouch reconnects on its own */ })
  activeChanges = changes
  return () => {
    changes.cancel()
    if (activeChanges === changes) activeChanges = undefined
  }
}

/** Test only. */
export const _stopPinReactor = (): void => {
  activeChanges?.cancel()
  activeChanges = undefined
}
```

- [ ] **Step 4: Run — expect pass**

Run: `yarn jest src/offline/pinReactor.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/offline/pinReactor.ts src/offline/pinReactor.test.ts
git commit -m "feat(offline): add pinReactor for PouchDB changes feed"
```

---

## Task 8: i18n keys (FR / EN)

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/fr.json`

- [ ] **Step 1: Read the current `drive` block in both files**

Run: `yarn jest src/i18n` (sanity) and open both JSON files to confirm structure (it's a nested object under `drive`).

- [ ] **Step 2: Add the `drive.offline` block in `en.json`**

In `src/i18n/locales/en.json`, locate the `drive` object and add a new key `offline` inside it (alphabetical or at the end — match the existing style):

```json
"offline": {
  "pin": "Keep offline",
  "unpin": "Remove from offline",
  "keepOffline": "Keep offline",
  "disabledOffline": "Reconnect to enable offline mode",
  "downloading": "Downloading…",
  "downloaded": "Available offline",
  "failed": "Download failed",
  "notAvailableOffline": "File not available offline",
  "folderPartial": "{{count}}/{{total}} files",
  "folderConfirm": "This folder contains {{count}} files (~{{size}}). Continue?",
  "bigFolderTitle": "Confirm download",
  "diskFull": "Device storage full. Remove items to free up space.",
  "deleteAllConfirm": "Remove {{count}} files ({{size}})? This cannot be undone.",
  "storageTitle": "Offline storage",
  "totalUsed": "Total used",
  "deleteAll": "Delete all",
  "wifiOnly": "Download on WiFi only",
  "foldersSection": "Folders",
  "filesSection": "Files",
  "errorsSection": "Errors",
  "retry": "Retry"
}
```

- [ ] **Step 3: Add the `drive.offline` block in `fr.json`**

In `src/i18n/locales/fr.json`:

```json
"offline": {
  "pin": "Garder hors-ligne",
  "unpin": "Retirer du hors-ligne",
  "keepOffline": "Garder hors-ligne",
  "disabledOffline": "Reconnectez-vous pour activer le mode hors-ligne",
  "downloading": "Téléchargement…",
  "downloaded": "Disponible hors-ligne",
  "failed": "Échec du téléchargement",
  "notAvailableOffline": "Fichier non disponible hors-ligne",
  "folderPartial": "{{count}}/{{total}} fichiers",
  "folderConfirm": "Ce dossier contient {{count}} fichiers (~{{size}}). Continuer ?",
  "bigFolderTitle": "Confirmer le téléchargement",
  "diskFull": "Stockage de l'appareil plein. Supprimez des fichiers pour libérer de l'espace.",
  "deleteAllConfirm": "Supprimer {{count}} fichiers ({{size}}) ? Cette action est irréversible.",
  "storageTitle": "Stockage hors-ligne",
  "totalUsed": "Total utilisé",
  "deleteAll": "Tout supprimer",
  "wifiOnly": "Télécharger en WiFi uniquement",
  "foldersSection": "Dossiers",
  "filesSection": "Fichiers",
  "errorsSection": "Erreurs",
  "retry": "Réessayer"
}
```

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "require('./src/i18n/locales/en.json'); require('./src/i18n/locales/fr.json'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(i18n): add drive.offline keys (FR/EN)"
```

---

## Task 9: `useOfflineState` + `useOfflineActions` hooks

**Files:**
- Create: `src/offline/useOfflineState.ts`
- Create: `src/offline/useOfflineActions.ts`

- [ ] **Step 1: Implement `useOfflineState`**

Create `src/offline/useOfflineState.ts`:

```ts
import { useEffect, useState } from 'react'

import { OfflineFilesStore } from './OfflineFilesStore'
import { OfflineFileEntry } from './types'

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
```

- [ ] **Step 2: Implement `useOfflineActions`**

Create `src/offline/useOfflineActions.ts`:

```ts
import { useCallback } from 'react'
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

const fileMeta = (f: FileShape): { rev: string; md5sum: string; size: number; name: string } => ({
  rev: f._rev ?? '',
  md5sum: f.md5sum ?? '',
  size: typeof f.size === 'number' ? f.size : 0,
  name: f.name
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

export const useOfflineActions = (): {
  pin: (file: FileShape) => void
  pinFolder: (folder: FileShape) => Promise<void>
  unpin: (fileId: string) => Promise<void>
  unpinFolder: (dirId: string) => Promise<void>
} => {
  const client = useClient()

  const pin = useCallback((file: FileShape) => {
    OfflineFilesStore.pin(file._id, fileMeta(file))
    Downloader.enqueue(file._id)
  }, [])

  const pinFolder = useCallback(async (folder: FileShape) => {
    if (!client) return
    OfflineFilesStore.pinFolder(folder._id, {
      dirId: folder._id,
      name: folder.name,
      pinnedAt: Date.now()
    })
    const { files, subfolders } = await enumerateFolderChildren(client, folder._id)
    for (const f of files) {
      OfflineFilesStore.pinViaFolder(f._id, folder._id, fileMeta(f))
      Downloader.enqueue(f._id)
    }
    for (const sub of subfolders) {
      await pinFolder(sub)
    }
  }, [client])

  const unpin = useCallback(async (fileId: string) => {
    await Downloader.cancel(fileId)
    await OfflineFilesStore.unpin(fileId)
  }, [])

  const unpinFolder = useCallback(async (dirId: string) => {
    await OfflineFilesStore.unpinFolder(dirId)
  }, [])

  return { pin, pinFolder, unpin, unpinFolder }
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/offline/useOfflineState.ts src/offline/useOfflineActions.ts
git commit -m "feat(offline): add useOfflineState and useOfflineActions hooks"
```

---

## Task 10: `PinnedBadge` component

**Files:**
- Create: `src/offline/PinnedBadge.tsx`
- Create: `src/offline/PinnedBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/offline/PinnedBadge.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon')

import { PinnedBadge } from './PinnedBadge'
import { OfflineFileEntry } from './types'

const wrap = (ui: React.ReactElement) => render(<PaperProvider>{ui}</PaperProvider>)

const entry = (state: OfflineFileEntry['state']): OfflineFileEntry => ({
  fileId: 'f1',
  state,
  rev: '1',
  md5sum: 'm',
  size: 1,
  localPath: '/o/f1',
  pinnedAt: 0,
  isDirectPin: true,
  parentFolderPins: []
})

describe('PinnedBadge', () => {
  it('renders nothing when entry is undefined', () => {
    const { toJSON } = wrap(<PinnedBadge entry={undefined} />)
    expect(toJSON()).toBeNull()
  })
  it('renders for downloaded state', () => {
    const { toJSON } = wrap(<PinnedBadge entry={entry('downloaded')} />)
    expect(toJSON()).not.toBeNull()
  })
  it('renders for failed state', () => {
    const { toJSON } = wrap(<PinnedBadge entry={entry('failed')} />)
    expect(toJSON()).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `yarn jest src/offline/PinnedBadge.test.tsx`
Expected: FAIL `Cannot find module './PinnedBadge'`.

- [ ] **Step 3: Implement `PinnedBadge`**

Create `src/offline/PinnedBadge.tsx`:

```tsx
import React from 'react'
import { StyleSheet, View } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { useTheme } from 'react-native-paper'

import { OfflineFileEntry } from './types'

interface Props {
  entry: OfflineFileEntry | undefined
  size?: number
}

const iconForState = (state: OfflineFileEntry['state']): string => {
  switch (state) {
    case 'downloaded': return 'cloud-check'
    case 'downloading': return 'cloud-download'
    case 'pending': return 'cloud-outline'
    case 'failed': return 'cloud-alert'
    case 'paused-auth': return 'cloud-clock'
  }
}

export const PinnedBadge = ({ entry, size = 12 }: Props): React.ReactElement | null => {
  const theme = useTheme()
  if (!entry) return null
  const color =
    entry.state === 'failed'
      ? theme.colors.error
      : entry.state === 'pending' || entry.state === 'paused-auth'
        ? theme.colors.outline
        : theme.colors.primary
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surface, borderColor: color }]}>
      <Icon name={iconForState(entry.state)} size={size} color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
```

- [ ] **Step 4: Run — expect pass**

Run: `yarn jest src/offline/PinnedBadge.test.tsx`
Expected: PASS 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/offline/PinnedBadge.tsx src/offline/PinnedBadge.test.tsx
git commit -m "feat(offline): add PinnedBadge component"
```

---

## Task 11: Integrate `PinnedBadge` + `onTogglePin` in `FileRow`

**Files:**
- Modify: `src/ui/FileRow.tsx`
- Modify: `src/ui/FileRow.test.tsx`

- [ ] **Step 1: Update `FileRow.tsx`**

In `src/ui/FileRow.tsx`:

1. Add the imports at the top:

```tsx
import { PinnedBadge } from '@/offline/PinnedBadge'
import { useOfflineState } from '@/offline/useOfflineState'
```

2. Extend the `Props` interface with `onTogglePin`:

```tsx
onTogglePin?: (file: FileItem) => void
```

3. Destructure it in the function signature: `onTogglePin`.

4. Inside `FileRow`, after the existing `sharingStatus` line, add:

```tsx
const offlineEntry = useOfflineState(file._id)
const isPinned = !!offlineEntry
```

5. Update `hasMenu`:

```tsx
const hasMenu =
  (!!onShare || !!onRename || !!onRestore || !!onDelete || !!onTogglePin) && !selected
```

6. In the `left` slot rendering, wrap the existing thumbnail+SharedBadge in a relative-positioned container and add the badge:

```tsx
<>
  <View style={styles.thumbWrap}>
    <FileThumbnail file={file} size={40} />
    <SharedBadge status={sharingStatus} />
    <PinnedBadge entry={offlineEntry} />
  </View>
</>
```

7. Add `thumbWrap` to the styles:

```tsx
thumbWrap: { position: 'relative', width: 40, height: 40 },
```

8. In the Menu, add the pin/unpin item at the top:

```tsx
{onTogglePin ? (
  <Menu.Item
    leadingIcon={isPinned ? 'cloud-off-outline' : 'cloud-download-outline'}
    title={t(isPinned ? 'drive.offline.unpin' : 'drive.offline.pin')}
    disabled={!isPinned && !isOnline}
    onPress={() => {
      setMenuVisible(false)
      onTogglePin(file)
    }}
  />
) : null}
```

9. While editing the description, surface the in-flight progress when applicable:

Replace the `description` computation with:

```tsx
const offlineDescription =
  offlineEntry?.state === 'downloading' && offlineEntry.bytesDownloaded !== undefined
    ? `${formatFileSize(offlineEntry.bytesDownloaded)} / ${formatFileSize(file.size)}`
    : undefined
const description = offlineDescription ?? (date ? `${size} · ${date}` : size)
```

- [ ] **Step 2: Add a test exercising the toggle + badge**

In `src/ui/FileRow.test.tsx`, add a test using a small mock of `useOfflineState`:

```tsx
jest.mock('@/offline/useOfflineState', () => ({
  useOfflineState: jest.fn().mockReturnValue(undefined)
}))
```

(Keep all existing tests passing.) Add a test:

```tsx
import { useOfflineState } from '@/offline/useOfflineState'

it('shows pin menu item and calls onTogglePin when tapped', () => {
  ;(useOfflineState as jest.Mock).mockReturnValueOnce(undefined)
  const onTogglePin = jest.fn()
  const { getByLabelText, getByText } = render(
    <PaperProvider>
      <FileRow file={baseFile} onPress={jest.fn()} onTogglePin={onTogglePin} />
    </PaperProvider>
  )
  fireEvent.press(getByLabelText('file actions'))
  fireEvent.press(getByText('Keep offline'))
  expect(onTogglePin).toHaveBeenCalledWith(baseFile)
})
```

- [ ] **Step 3: Run the FileRow tests**

Run: `yarn jest src/ui/FileRow.test.tsx`
Expected: PASS, including the new test.

- [ ] **Step 4: Commit**

```bash
git add src/ui/FileRow.tsx src/ui/FileRow.test.tsx
git commit -m "feat(offline): wire PinnedBadge and onTogglePin into FileRow"
```

---

## Task 12: Same integration in `FolderRow`

**Files:**
- Modify: `src/ui/FolderRow.tsx`
- Modify: `src/ui/FolderRow.test.tsx`

- [ ] **Step 1: Update `FolderRow.tsx`**

In `src/ui/FolderRow.tsx`:

1. Imports:

```tsx
import { useOfflineFolderPinned } from '@/offline/useOfflineState'
```

2. Extend props with `onTogglePin?: (folder: FolderItem) => void`.

3. Inside the component:

```tsx
const isPinned = useOfflineFolderPinned(folder._id)
```

4. Update `hasMenu` to include `onTogglePin`.

5. Add the menu item at the top of the menu list:

```tsx
{onTogglePin ? (
  <Menu.Item
    leadingIcon={isPinned ? 'cloud-off-outline' : 'cloud-download-outline'}
    title={t(isPinned ? 'drive.offline.unpin' : 'drive.offline.pin')}
    disabled={!isPinned && !isOnline}
    onPress={() => {
      setMenuVisible(false)
      onTogglePin(folder)
    }}
  />
) : null}
```

(Folders don't show progress per-row in v1 — the aggregated state is in the Settings screen. Skip adding a folder-level badge variant for v1.)

- [ ] **Step 2: Update tests**

Add to `src/ui/FolderRow.test.tsx`:

```tsx
jest.mock('@/offline/useOfflineState', () => ({
  useOfflineFolderPinned: jest.fn().mockReturnValue(false)
}))

import { useOfflineFolderPinned } from '@/offline/useOfflineState'

it('shows pin menu item and calls onTogglePin', () => {
  ;(useOfflineFolderPinned as jest.Mock).mockReturnValueOnce(false)
  const onTogglePin = jest.fn()
  const { getByLabelText, getByText } = render(
    <PaperProvider>
      <FolderRow folder={baseFolder} onPress={jest.fn()} onTogglePin={onTogglePin} />
    </PaperProvider>
  )
  fireEvent.press(getByLabelText('folder actions'))
  fireEvent.press(getByText('Keep offline'))
  expect(onTogglePin).toHaveBeenCalledWith(baseFolder)
})
```

- [ ] **Step 3: Run tests**

Run: `yarn jest src/ui/FolderRow.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/FolderRow.tsx src/ui/FolderRow.test.tsx
git commit -m "feat(offline): wire pin/unpin into FolderRow"
```

---

## Task 13: "Keep offline" toggle in `FileMetadataSheet`

**Files:**
- Modify: `src/ui/FileMetadataSheet.tsx`

- [ ] **Step 1: Add the toggle row**

In `src/ui/FileMetadataSheet.tsx`:

1. Imports:

```tsx
import { Switch } from 'react-native-paper'
import { useOfflineState } from '@/offline/useOfflineState'
import { useOfflineActions } from '@/offline/useOfflineActions'
```

2. Inside the component (after `const isOnline = useIsOnline()`):

```tsx
const offlineEntry = useOfflineState(file?._id)
const { pin, unpin } = useOfflineActions()
const isPinned = !!offlineEntry
const togglePin = (): void => {
  if (!file) return
  if (isPinned) {
    void unpin(file._id)
  } else {
    pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }
}
```

3. In the sheet content, just below the file thumbnail/name row and above the "Open" button, insert:

```tsx
<View style={styles.toggleRow}>
  <Text style={styles.toggleLabel}>{t('drive.offline.keepOffline')}</Text>
  <Switch
    value={isPinned}
    onValueChange={togglePin}
    disabled={!isPinned && !isOnline}
  />
</View>
{!isPinned && !isOnline ? (
  <Text style={[styles.helper, { color: theme.colors.outline }]}>
    {t('drive.offline.disabledOffline')}
  </Text>
) : null}
<Divider />
```

4. Add the styles:

```tsx
toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16 },
toggleLabel: { fontSize: 14 },
helper: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/FileMetadataSheet.tsx
git commit -m "feat(offline): add Keep offline toggle to FileMetadataSheet"
```

---

## Task 14: `openFile.ts` fast-path for pinned-and-downloaded

**Files:**
- Modify: `src/files/openFile.ts`
- Modify: `src/files/openFile.test.ts`

- [ ] **Step 1: Add the fast-path test**

In `src/files/openFile.test.ts`, add to the top:

```ts
const isPinnedAndDownloaded = jest.fn().mockReturnValue(false)
const localPath = jest.fn((id: string) => `/o/${id}`)

jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: { isPinnedAndDownloaded }
}))
jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath }
}))
```

Then add a new case to the `describe`:

```ts
it('opens the local blob directly when pinned + downloaded', async () => {
  isPinnedAndDownloaded.mockReturnValueOnce(true)
  await openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled()
  expect(FileViewer.open).toHaveBeenCalledWith('/o/abc', expect.any(Object))
})
```

- [ ] **Step 2: Run — expect failure**

Run: `yarn jest src/files/openFile.test.ts`
Expected: FAIL (the new test runs the existing implementation which still calls `downloadAsync`).

- [ ] **Step 3: Update `openFile.ts`**

Add at the top:

```ts
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
```

At the start of `openFileNatively`:

```ts
if (OfflineFilesStore.isPinnedAndDownloaded(file._id)) {
  await FileViewer.open(FileSystemRepo.localPath(file._id), {
    showOpenWithDialog: true,
    showAppsSuggestions: true
  })
  return
}
```

- [ ] **Step 4: Run — expect pass**

Run: `yarn jest src/files/openFile.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/files/openFile.ts src/files/openFile.test.ts
git commit -m "feat(offline): openFileNatively short-circuits to local blob when pinned"
```

---

## Task 15: Big-folder confirmation modal

**Files:**
- Create: `src/offline/BigFolderConfirmDialog.tsx`
- Modify: `src/offline/useOfflineActions.ts` (wire the dialog into `pinFolder`)

- [ ] **Step 1: Build the dialog**

Create `src/offline/BigFolderConfirmDialog.tsx`:

```tsx
import React from 'react'
import { Button, Dialog, Portal, Text } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from '@/utils/formatters'

interface Props {
  visible: boolean
  count: number
  bytes: number
  onConfirm: () => void
  onCancel: () => void
}

export const BigFolderConfirmDialog = ({ visible, count, bytes, onConfirm, onCancel }: Props) => {
  const { t } = useTranslation()
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>{t('drive.offline.bigFolderTitle')}</Dialog.Title>
        <Dialog.Content>
          <Text>
            {t('drive.offline.folderConfirm', { count, size: formatFileSize(bytes) })}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>{t('common.cancel')}</Button>
          <Button onPress={onConfirm} mode="contained">{t('common.confirm') ?? 'OK'}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
```

- [ ] **Step 2: Add the i18n key for `common.confirm` (if missing)**

In both `en.json` and `fr.json`, ensure `common.confirm` exists:

- en: `"confirm": "Confirm"`
- fr: `"confirm": "Confirmer"`

- [ ] **Step 3: Wire the confirmation into `useOfflineActions`**

The simplest approach: expose a `pendingConfirmation` state from `useOfflineActions` and let the calling screen render the dialog. Refactor `useOfflineActions.ts` to return:

```ts
return {
  pin,
  pinFolder,
  unpin,
  unpinFolder,
  pendingConfirmation,
  confirmPending,
  cancelPending
}
```

Where `pinFolder` first counts via a `Q('io.cozy.files').where({ dir_id: folder._id })` query, and if the **non-recursive** count exceeds 1000, sets `pendingConfirmation = { folder, count, bytes }` and returns. The actual pin work runs when the screen calls `confirmPending()`.

Concretely, replace the body of `pinFolder` with:

```ts
const pinFolder = useCallback(async (folder: FileShape) => {
  if (!client) return
  const { files, subfolders } = await enumerateFolderChildren(client, folder._id)
  const directCount = files.length + subfolders.length
  const directBytes = files.reduce((acc, f) => acc + (typeof f.size === 'number' ? f.size : 0), 0)
  if (directCount > 1000) {
    setPendingConfirmation({ folder, count: directCount, bytes: directBytes })
    return
  }
  await doPinFolder(folder, files, subfolders)
}, [client])

const doPinFolder = useCallback(async (
  folder: FileShape,
  files: FileShape[],
  subfolders: FileShape[]
) => {
  if (!client) return
  OfflineFilesStore.pinFolder(folder._id, { dirId: folder._id, name: folder.name, pinnedAt: Date.now() })
  for (const f of files) {
    OfflineFilesStore.pinViaFolder(f._id, folder._id, fileMeta(f))
    Downloader.enqueue(f._id)
  }
  for (const sub of subfolders) {
    const { files: subFiles, subfolders: subSubs } = await enumerateFolderChildren(client, sub._id)
    await doPinFolder(sub, subFiles, subSubs)
  }
}, [client])

const confirmPending = useCallback(async () => {
  if (!pendingConfirmation || !client) return
  const { folder } = pendingConfirmation
  setPendingConfirmation(null)
  const { files, subfolders } = await enumerateFolderChildren(client, folder._id)
  await doPinFolder(folder, files, subfolders)
}, [pendingConfirmation, client, doPinFolder])

const cancelPending = useCallback(() => setPendingConfirmation(null), [])
```

And add state via `useState`:

```ts
const [pendingConfirmation, setPendingConfirmation] =
  useState<{ folder: FileShape; count: number; bytes: number } | null>(null)
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/offline/BigFolderConfirmDialog.tsx src/offline/useOfflineActions.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(offline): big-folder confirmation dialog before pin"
```

---

## Task 16: `OfflineStorageScreen` — Settings screen

**Files:**
- Create: `app/(drive)/settings/_layout.tsx`
- Create: `app/(drive)/settings/index.tsx`
- Create: `app/(drive)/settings/offline-storage.tsx`

- [ ] **Step 1: Settings stack layout**

Create `app/(drive)/settings/_layout.tsx`:

```tsx
import React from 'react'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function SettingsLayout() {
  const { t } = useTranslation()
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('settings.title') ?? 'Settings' }} />
      <Stack.Screen name="offline-storage" options={{ title: t('drive.offline.storageTitle') }} />
    </Stack>
  )
}
```

Add `settings.title` to both i18n files (`"Settings"` / `"Paramètres"`).

- [ ] **Step 2: Settings index screen**

Create `app/(drive)/settings/index.tsx`:

```tsx
import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function SettingsIndex() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <ScrollView>
      <List.Item
        title={t('drive.offline.storageTitle')}
        left={p => <List.Icon {...p} icon="cloud-download-outline" />}
        right={p => <List.Icon {...p} icon="chevron-right" />}
        onPress={() => router.push('/(drive)/settings/offline-storage')}
      />
    </ScrollView>
  )
}
```

- [ ] **Step 3: Offline storage screen**

Create `app/(drive)/settings/offline-storage.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { Button, Divider, List, Switch, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { Downloader } from '@/offline/Downloader'
import { OfflineSettingsAPI } from '@/offline/offlineSettings'
import { formatFileSize } from '@/utils/formatters'
import type { OfflineFileEntry, OfflineFolderEntry } from '@/offline/types'

export default function OfflineStorageScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const [totalBytes, setTotalBytes] = useState<number>(0)
  const [files, setFiles] = useState<OfflineFileEntry[]>([])
  const [folders, setFolders] = useState<OfflineFolderEntry[]>([])
  const [wifiOnly, setWifiOnly] = useState<boolean>(OfflineSettingsAPI.get().wifiOnly)
  const [diskFull, setDiskFull] = useState<boolean>(OfflineSettingsAPI.status.get().diskFull)

  const refresh = async (): Promise<void> => {
    setFiles(OfflineFilesStore.getAll())
    setFolders(OfflineFilesStore.getAllFolders())
    setTotalBytes(await FileSystemRepo.totalBytes())
  }

  useEffect(() => {
    void refresh()
    const off1 = OfflineFilesStore.subscribeAll(() => void refresh())
    const off2 = OfflineSettingsAPI.subscribe(() => setWifiOnly(OfflineSettingsAPI.get().wifiOnly))
    const off3 = OfflineSettingsAPI.status.subscribe(() => setDiskFull(OfflineSettingsAPI.status.get().diskFull))
    return () => { off1(); off2(); off3() }
  }, [])

  const directFiles = useMemo(() => files.filter(f => f.isDirectPin), [files])

  const inProgress = useMemo(() => files.filter(f => f.state === 'downloading'), [files])
  const failed = useMemo(() => files.filter(f => f.state === 'failed'), [files])

  return (
    <ScrollView>
      <List.Item
        title={t('drive.offline.totalUsed')}
        description={formatFileSize(totalBytes)}
      />
      <View style={styles.actionRow}>
        <Button
          mode="outlined"
          onPress={async () => {
            for (const f of files) await OfflineFilesStore.purge(f.fileId)
            await refresh()
          }}
        >
          {t('drive.offline.deleteAll')}
        </Button>
      </View>
      <Divider />
      <List.Item
        title={t('drive.offline.wifiOnly')}
        right={() => (
          <Switch
            value={wifiOnly}
            onValueChange={v => OfflineSettingsAPI.set({ wifiOnly: v })}
          />
        )}
      />
      {diskFull ? (
        <View style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}>
          <Text style={{ color: theme.colors.onErrorContainer }}>
            {t('drive.offline.diskFull')}
          </Text>
        </View>
      ) : null}
      {inProgress.length > 0 ? (
        <List.Item
          title={t('drive.offline.downloading')}
          description={`${files.length - inProgress.length}/${files.length}`}
        />
      ) : null}
      {failed.length > 0 ? (
        <List.Section title={t('drive.offline.errorsSection')}>
          {failed.map(f => (
            <List.Item
              key={f.fileId}
              title={f.fileId}
              description={f.lastError ?? t('drive.offline.failed')}
              right={() => (
                <Button
                  mode="text"
                  onPress={() => {
                    OfflineFilesStore.update(f.fileId, e => ({ ...e, retryCount: 0, state: 'pending' }))
                    Downloader.enqueue(f.fileId)
                  }}
                >
                  {t('drive.offline.retry')}
                </Button>
              )}
            />
          ))}
        </List.Section>
      ) : null}
      <List.Section title={t('drive.offline.foldersSection')}>
        {folders
          .slice()
          .sort((a, b) => b.pinnedAt - a.pinnedAt)
          .map(f => {
            const childBytes = files
              .filter(file => file.parentFolderPins.includes(f.dirId))
              .reduce((a, file) => a + file.size, 0)
            return (
              <List.Item
                key={f.dirId}
                title={f.name}
                description={formatFileSize(childBytes)}
                right={() => (
                  <Button mode="text" onPress={() => void OfflineFilesStore.unpinFolder(f.dirId)}>
                    {t('drive.offline.unpin')}
                  </Button>
                )}
              />
            )
          })}
      </List.Section>
      <List.Section title={t('drive.offline.filesSection')}>
        {directFiles
          .slice()
          .sort((a, b) => b.pinnedAt - a.pinnedAt)
          .map(f => (
            <List.Item
              key={f.fileId}
              title={f.fileId}
              description={formatFileSize(f.size)}
              right={() => (
                <Button mode="text" onPress={() => void OfflineFilesStore.unpin(f.fileId)}>
                  {t('drive.offline.unpin')}
                </Button>
              )}
            />
          ))}
      </List.Section>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  actionRow: { paddingHorizontal: 16, paddingBottom: 8 },
  banner: { padding: 12, marginHorizontal: 16, marginVertical: 8, borderRadius: 8 }
})
```

- [ ] **Step 4: Type check + lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/(drive)/settings/_layout.tsx app/(drive)/settings/index.tsx app/(drive)/settings/offline-storage.tsx src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(offline): OfflineStorageScreen under Settings"
```

---

## Task 17: Wire `Settings` tab + init the Downloader and pinReactor

**Files:**
- Modify: `app/(drive)/_layout.tsx`
- Create: `src/offline/initOffline.ts`

- [ ] **Step 1: One-time offline subsystem boot**

Create `src/offline/initOffline.ts`:

```ts
import CozyClient from 'cozy-client'

import { FileSystemRepo } from './FileSystemRepo'
import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'
import { startPinReactor } from './pinReactor'
import { getPouchLink } from '@/pouchdb/triggerReplication'

let pinReactorStop: (() => void) | undefined
let initialized = false

export const initOfflineSubsystem = async (client: CozyClient): Promise<void> => {
  if (initialized) return
  initialized = true

  await FileSystemRepo.init()

  Downloader.init({
    buildUrl: fileId => {
      const stack = client.getStackClient() as { uri: string }
      return `${stack.uri}/files/download/${encodeURIComponent(fileId)}`
    },
    getAuthHeaders: () => {
      const stack = client.getStackClient() as { getAccessToken: () => string | null | undefined }
      const tok = stack.getAccessToken()
      return tok ? { Authorization: `Bearer ${tok}` } : {}
    }
  })

  for (const entry of OfflineFilesStore.getAll()) {
    let next = entry
    if (entry.state === 'downloading') next = { ...next, state: 'pending', bytesDownloaded: undefined }
    if (entry.state === 'paused-auth') next = { ...next, state: 'pending' }
    if (entry.state === 'downloaded' && !(await FileSystemRepo.exists(entry.fileId))) {
      next = { ...next, state: 'pending' }
    }
    if (next !== entry) OfflineFilesStore.update(entry.fileId, () => next)
    if (next.state === 'pending') Downloader.enqueue(entry.fileId)
  }

  const pouchLink = getPouchLink(client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pouch = (pouchLink as any)?.getPouch?.('io.cozy.files')
  if (pouch) pinReactorStop = startPinReactor(pouch)
}

/** Test / logout. */
export const teardownOfflineSubsystem = (): void => {
  pinReactorStop?.()
  pinReactorStop = undefined
  initialized = false
}
```

- [ ] **Step 2: Wire into `_layout.tsx`**

In `app/(drive)/_layout.tsx`:

1. Add imports:

```tsx
import { useClient } from 'cozy-client'
import { useEffect } from 'react'
import { initOfflineSubsystem } from '@/offline/initOffline'
```

2. Inside `DriveLayout`:

```tsx
const client = useClient()
useEffect(() => {
  if (!client) return
  void initOfflineSubsystem(client)
}, [client])
```

3. Add the Settings tab next to the existing ones (between `shareddrives` and `trash` or as the last visible tab — match the existing visual order):

```tsx
<Tabs.Screen
  name="settings"
  options={{
    title: t('settings.title'),
    tabBarIcon: ({ color, size }) => <Icon name="cog-outline" color={color} size={size} />
  }}
/>
```

- [ ] **Step 3: Manual run on simulator**

Run: `yarn ios` (or `yarn android`)
Verify: app boots, the new Settings tab is visible, tapping it shows the index, then tapping "Offline storage" navigates into the screen with `Total used: 0 B` and no error.

- [ ] **Step 4: Commit**

```bash
git add src/offline/initOffline.ts app/(drive)/_layout.tsx
git commit -m "feat(offline): boot offline subsystem + add Settings tab"
```

---

## Task 18: Wire `onTogglePin` into list screens

**Files:**
- Modify: `app/(drive)/files/[...path].tsx`
- Modify: `app/(drive)/recent.tsx`
- Modify: `app/(drive)/shared/[...path].tsx`
- Modify: `app/(drive)/shareddrives/[...path].tsx`
- Modify: `app/(drive)/trash.tsx` (unpin only — files in trash were never pinnable, but if a pinned file is server-trashed it auto-purges via reactor, so trash needs no toggle)

- [ ] **Step 1: Add the toggle in `files/[...path].tsx`**

In `app/(drive)/files/[...path].tsx`, hook into where `FileRow` and `FolderRow` are rendered:

```tsx
import { useOfflineActions } from '@/offline/useOfflineActions'
import { useOfflineState, useOfflineFolderPinned } from '@/offline/useOfflineState'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'

// ...inside the component...
const { pin, pinFolder, unpin, unpinFolder, pendingConfirmation, confirmPending, cancelPending } =
  useOfflineActions()

const onToggleFilePin = (file: FileItem) => {
  const entry = OfflineFilesStore.get(file._id)
  if (entry?.isDirectPin) void unpin(file._id)
  else pin({ _id: file._id, name: file.name, size: file.size, _rev: (file as any)._rev, md5sum: (file as any).md5sum })
}

const onToggleFolderPin = (folder: FolderItem) => {
  if (OfflineFilesStore.getFolder(folder._id)) void unpinFolder(folder._id)
  else void pinFolder({ _id: folder._id, name: folder.name })
}
```

Pass `onTogglePin={onToggleFilePin}` to each `<FileRow>` and `onTogglePin={onToggleFolderPin}` to each `<FolderRow>`.

Render the confirmation dialog once near the bottom of the JSX:

```tsx
<BigFolderConfirmDialog
  visible={!!pendingConfirmation}
  count={pendingConfirmation?.count ?? 0}
  bytes={pendingConfirmation?.bytes ?? 0}
  onConfirm={() => void confirmPending()}
  onCancel={cancelPending}
/>
```

Add the import for `OfflineFilesStore` at the top.

- [ ] **Step 2: Repeat in the other three screens**

Apply the same pattern in:
- `app/(drive)/recent.tsx` — only files, no folders. Wire `onToggleFilePin` only.
- `app/(drive)/shared/[...path].tsx` — files + folders, same as files screen.
- `app/(drive)/shareddrives/[...path].tsx` — files + folders, same.

For trash (`trash.tsx`), do NOT wire pin — trash is a one-way removal. Keep behavior as-is.

- [ ] **Step 3: Manual run on simulator**

Run: `yarn ios`
Verify: open Files screen → tap 3-dot on a file → see "Keep offline" → tap → row gains the pinned badge → file downloads. Tap 3-dot again → "Remove from offline" → row loses badge. Same for folder.

- [ ] **Step 4: Commit**

```bash
git add app/\(drive\)/files/\[...path\].tsx app/\(drive\)/recent.tsx app/\(drive\)/shared/\[...path\].tsx app/\(drive\)/shareddrives/\[...path\].tsx
git commit -m "feat(offline): wire pin/unpin actions into list screens"
```

---

## Task 19: Android backup exclusion

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/xml/data_extraction_rules.xml`
- Create: `android/app/src/main/res/xml/backup_rules.xml`

- [ ] **Step 1: Inspect current Manifest**

Read `android/app/src/main/AndroidManifest.xml`. Find the `<application>` opening tag.

- [ ] **Step 2: Add backup-exclusion attributes**

Edit the `<application>` tag, adding (if not already present):

```xml
android:allowBackup="false"
android:dataExtractionRules="@xml/data_extraction_rules"
android:fullBackupContent="@xml/backup_rules"
```

- [ ] **Step 3: Create the rules files**

Create `android/app/src/main/res/xml/data_extraction_rules.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="file" path="offline/" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="file" path="offline/" />
  </device-transfer>
</data-extraction-rules>
```

Create `android/app/src/main/res/xml/backup_rules.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="file" path="offline/" />
</full-backup-content>
```

- [ ] **Step 4: Manual verification (Android)**

Run: `yarn android`
Expected: app builds and launches without manifest merge errors.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml android/app/src/main/res/xml/data_extraction_rules.xml android/app/src/main/res/xml/backup_rules.xml
git commit -m "feat(offline): exclude offline/ blobs from Android backups"
```

---

## Task 20: iOS — flag the offline directory for backup exclusion

**Files:**
- Modify: `src/offline/FileSystemRepo.ts`

**Why:** iOS's iCloud Backup would otherwise ingest the entire offline cache. `NSURLIsExcludedFromBackupKey` opts the directory out. There is no direct expo API; we rely on storing the cache under `documentDirectory/offline/` and setting the resource value via the `ios` modulo `expo-file-system` permits — but easiest is to call into the legacy API using `FS.getInfoAsync` + a one-shot native call. In SDK 54, the cleanest path is to **store under `Library/Caches`** instead of `documentDirectory` (iOS already excludes Caches from backup). Since cacheDirectory can be purged by the OS, the only fully safe option is `documentDirectory/offline/` + the exclusion flag.

The simplest approach that doesn't require a custom native module: include a small `.nomedia`-equivalent marker and accept that iOS may include the directory in iCloud Backup unless the user disables it. Since the spec explicitly calls out the exclusion as required, we wire it via `expo-file-system`'s `FileSystem.getInfoAsync(uri).uri` + setting `NSURLIsExcludedFromBackupKey` via a JS bridge.

**Decision for v1:** use the native ObjC bridge via the existing `NativeModules` from `react-native`. Add a tiny Swift/ObjC helper as part of the Expo config plugin — but that's a multi-day effort. To keep the plan tractable, **defer the exclusion flag to v1.5** and add a TODO in the code. Document the gap.

- [ ] **Step 1: Add a TODO at the top of `FileSystemRepo.ts`**

Insert above the `dir()` function:

```ts
// TODO(offline-v1.5): set NSURLIsExcludedFromBackupKey on iOS so this
// directory doesn't grow the iCloud Backup size. Requires a small
// native module — deferred for v1. Users who care can disable backup
// for the app in iOS Settings.
```

- [ ] **Step 2: Commit**

```bash
git add src/offline/FileSystemRepo.ts
git commit -m "docs(offline): document NSURLIsExcludedFromBackupKey gap (v1.5)"
```

---

## Task 21: Manual test pass

Follow section 8.2 of the spec (`docs/superpowers/specs/2026-05-12-offline-blob-cache-design.md`). Each line is a checkbox to tick in this commit message:

- [ ] iOS simulator: full test pass per section 8.2
- [ ] Physical iPhone: full test pass per section 8.2
- [ ] Android simulator: full test pass per section 8.2

After completion, write a brief test report in the commit message:

```bash
git commit --allow-empty -m "chore(offline): manual test pass complete

Verified per spec section 8.2 on:
  - iOS simulator (iPhone 15, iOS 17)
  - Physical iPhone <model> (iOS <version>)
  - Android simulator (Pixel 6, API <version>)

Notes:
  - <any deviation or known issue here>
"
```

(If gaps are found, file them as new bite-sized tasks at the end of this plan rather than commit-shipping broken work.)

---

## Open the PR

After Task 21 passes:

```bash
git push -u origin feat/offline-blob-cache
gh pr create --title "feat(offline): blob cache — \"Keep offline\" for files and folders" --body "$(cat <<'EOF'
## Summary
- Per-file/folder "Keep offline" pinning
- Persistent blob storage under `documentDirectory/offline/{fileId}`
- md5sum-driven re-download via PouchDB changes feed
- Dedicated Settings → Offline storage screen

Spec: `docs/superpowers/specs/2026-05-12-offline-blob-cache-design.md`
Plan: `docs/superpowers/plans/2026-05-12-offline-blob-cache.md`

## Test plan
- [x] Jest suite green (`yarn test`)
- [x] Manual test pass per spec section 8.2 — see commit history
- [ ] Reviewer: pull and run on iOS + Android once

## Known gaps for v1.5
- `NSURLIsExcludedFromBackupKey` on iOS (Task 20)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage check (spec → task):**

| Spec section | Implementing task(s) |
|---|---|
| 2. Architecture | 1, 2, 4, 5, 6, 7 |
| 3. Data model | 1, 5, 6 |
| 4.1 Pin file | 5, 6, 9, 18 |
| 4.2 Pin folder + N+1 note | 9, 15, 18 |
| 4.3 Sync / reactor | 7 |
| 4.4 Unpin | 5, 18 |
| 4.5 Open pinned | 14 |
| 4.6 App boot | 17 |
| 4.7 Network state change | 6 |
| 4.8 Pin while offline (disabled) | 11, 12, 13 |
| 5.1 Pin entry points | 11, 12, 13 |
| 5.2 PinnedBadge | 10, 11 |
| 5.3 Folder rows | 12 |
| 5.4 openFile behavior | 14 |
| 5.5 Translations | 8 |
| 6. Settings view | 16, 17 |
| 7.1 Retry backoff | 6 |
| 7.2 401 paused-auth | 6 |
| 7.3 404 purge | 6 (mid-download HTTP 404) + 7 (changes feed) |
| 7.4 ENOSPC banner | 6, 16 |
| 7.5 Blob missing | 17 |
| 7.6 MMKV corruption | 5 (catch + delete) |
| 7.7 Killed mid-download | 17 |
| 7.8 Giant folder | 15 |
| 8. Tests | per-task Jest + 21 |
| 9. Out of scope | none (don't build) |
| 10. Task decomposition | this plan |

**Placeholder scan:** no `TBD` / `TODO` / "fill in details" / "similar to Task N" patterns survived. The single `TODO(offline-v1.5)` in Task 20 is a deliberate documented gap on the iOS backup flag, scoped to v1.5.

**Type consistency check:** `OfflineFilesStore.pin / pinViaFolder / pinFolder / unpin / unpinFolder / purge / update / setState / markDownloaded / isPinnedAndDownloaded / get / getAll / getFolder / getAllFolders / subscribe / subscribeAll` signatures are stable across Tasks 5, 7, 9, 13, 16, 17, 18. `Downloader.init / enqueue / cancel / pauseAll / resumeAll` stable across Tasks 6, 7, 9, 16, 17. `getOnlineMonitor` returns the same `OnlineMonitor` interface in Tasks 2, 3, 6.
