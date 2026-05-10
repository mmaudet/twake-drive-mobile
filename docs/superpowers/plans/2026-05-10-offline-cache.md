# Offline Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `twake-drive-mobile` users to browse their drive metadata offline (option A from the spec). Read queries on `io.cozy.files` and `io.cozy.sharings` are served from a local SQLite database; mutations always go to cozy-stack via StackLink.

**Architecture:** Plug `cozy-pouch-link@60.24` in front of `StackLink`, configured with `strategy: 'fromRemote'` for both replicated doctypes. Local storage uses `@op-engineering/op-sqlite` (JSI, fast). A new `SyncProvider` wraps the `(drive)` group, manages the replication lifecycle (auth + AppState + NetInfo), and exposes a `useSyncStatus()` hook that drives a subtle pill in the AppBar.

**Tech Stack:** React Native 0.81 + Expo SDK 54 / cozy-client 60.24 / cozy-pouch-link 60.24 / @op-engineering/op-sqlite / @react-native-community/netinfo / @cozy/minilog / react-native-paper / Jest.

**Spec:** `docs/superpowers/specs/2026-05-10-offline-cache-design.md`

---

## File structure (target)

### Created

| File | Responsibility |
|---|---|
| `src/client/sqliteStorage.ts` | KV store (`getItem`/`setItem`/`removeItem`/`destroy`) backed by `platform-storage.sqlite` via op-sqlite. Lazy open. |
| `src/client/sqliteStorage.test.ts` | Unit tests for the KV with op-sqlite mocked. |
| `src/client/pouchPlatform.ts` | `LinkPlatform` shape consumed by `cozy-pouch-link`: storage = sqliteStorage, isOnline = NetInfo, queryEngine = SQLiteQuery, events = no-op proxy. |
| `src/client/pouchPlatform.test.ts` | Unit tests for the platform shape. |
| `src/client/createClient.test.ts` | Asserts that `createClient(session)` produces a CozyClient with `[CozyPouchLink, StackLink, ...]` in chain order and the right `doctypesReplicationOptions`. |
| `src/sync/SyncContext.ts` | React `Context` definition + `SyncStatus` type. |
| `src/sync/SyncProvider.tsx` | Wraps `(drive)` group. Hooks AppState + NetInfo + cozy-client events to drive `pouchLink` lifecycle and update status. |
| `src/sync/SyncProvider.test.tsx` | Unit tests covering each lifecycle event. |
| `src/sync/useSyncStatus.ts` | Hook that reads `SyncContext`. Throws if used outside the provider. |
| `src/sync/useSyncStatus.test.tsx` | Hook unit tests. |
| `src/sync/requireOnline.ts` | Pure helper: given `(syncStatus, showSnackbar, t)`, returns `true` if online, else snackbars and returns `false`. |
| `src/sync/requireOnline.test.ts` | Unit tests. |
| `src/ui/SyncBadge.tsx` | Small Paper-themed component rendered in the `AppBar` right slot showing `idle` (nothing) / `syncing` (spinner) / `offline` (cloud-off icon + popover) / `error`. |
| `src/ui/SyncBadge.test.tsx` | Visual smoke test (renders correct icon per status). |

### Modified

| File | Change |
|---|---|
| `package.json` | Add deps: `cozy-pouch-link`, `@op-engineering/op-sqlite`, `@cozy/minilog`, `@react-native-community/netinfo`. |
| `app.json` | Add `expo-network` if needed for plugin (NetInfo is auto-linked, no plugin needed). |
| `ios/Podfile.lock` + `ios/TwakeDrive.xcodeproj/project.pbxproj` | Auto-updated by `pod install`. |
| `src/client/createClient.ts` | Import + instantiate `CozyPouchLink`; pass it as `links: [pouchLink]` to `CozyClient`. Export the `pouchLink` singleton. |
| `src/ui/AppBar.tsx` | Render `<SyncBadge />` in the right slot, before the existing menu/logout. |
| `src/i18n/locales/en.json` + `fr.json` | Add `drive.offline.{requiresOnline, lastSynced, syncing, storageUnavailable}`. |
| `src/files/deleteFile.ts` | Call `pouchLink.syncImmediately()` after `client.destroy` resolves. |
| `src/files/createFolder.ts` | Same. |
| `src/files/createCozyNote.ts` | Same. |
| `src/files/createOfficeFile.ts` | Same. |
| `src/files/sharing.ts` | Same on each successful mutation (link toggle, recipient add/remove, revoke). |
| `app/(drive)/_layout.tsx` | Wrap children with `<SyncProvider>` between `<SharingProvider>` and `<Tabs>`. |
| `app/(drive)/files/[...path].tsx` | Add `requireOnline` guard before each mutation (delete, bulk delete, createFolder, createCozyNote, createOfficeFile). |
| `app/(drive)/recent.tsx` | `requireOnline` guard before delete. |
| `src/ui/ShareSheet.tsx` | `requireOnline` guard before public-link toggle, recipient add/remove, member revoke. |

---

## Phase 0 — Dependencies + native build

### Task 0.1: Install JS dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Switch to Node 22 (npm 10) — older Node hits `ReadableStream`-related crash on Expo CLI**

```bash
source ~/.nvm/nvm.sh && nvm use 22
node -v   # expect v22.x
```

- [ ] **Step 2: Install `@react-native-community/netinfo` via Expo (matches SDK 54)**

```bash
npx expo install @react-native-community/netinfo
```

Expected: `package.json` gains `"@react-native-community/netinfo"` at the version pinned by Expo SDK 54.

- [ ] **Step 3: Install `cozy-pouch-link`, `@op-engineering/op-sqlite`, `@cozy/minilog`**

```bash
npm install --save cozy-pouch-link@60.24.0 @op-engineering/op-sqlite @cozy/minilog --legacy-peer-deps
```

Expected: 3 new entries in `package.json` `dependencies`. `--legacy-peer-deps` is required because cozy-client/pouch-link declare ancient React/RN peer ranges.

- [ ] **Step 4: Verify**

```bash
grep -E "cozy-pouch-link|op-sqlite|@cozy/minilog|netinfo" package.json
```

Expected: 4 lines printed.

- [ ] **Step 5: Run existing test suite — must still be green**

```bash
npx jest --runInBand
```

Expected: `Tests: 220 passed, 220 total` (or whatever the pre-task baseline is).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add cozy-pouch-link, op-sqlite, netinfo, minilog"
```

---

### Task 0.2: pod install + iOS native rebuild

**Files:**
- Modify: `ios/Podfile.lock`, `ios/TwakeDrive.xcodeproj/project.pbxproj` (auto)

- [ ] **Step 1: Install pods**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd ios && pod install && cd ..
```

Expected: log mentions `Installing op-sqlite (...)` and `Installing RNCNetInfo (...)`. Total pods incremented by 2-3.

- [ ] **Step 2: Build + boot iOS app (proves linkage)**

```bash
npx expo run:ios
```

Expected: `Build Succeeded` + app boots on iPhone 16 simulator.

- [ ] **Step 3: Commit**

```bash
git add ios/Podfile.lock ios/TwakeDrive.xcodeproj/project.pbxproj
git commit -m "ios: pod install for op-sqlite + netinfo"
```

---

## Phase 1 — SQLite KV storage

### Task 1.1: `sqliteStorage.ts` (TDD)

**Files:**
- Create: `src/client/sqliteStorage.ts`
- Create: `src/client/sqliteStorage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/client/sqliteStorage.test.ts
import { sqliteStorage } from './sqliteStorage'

const exec = jest.fn()

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({ execute: exec, executeSync: exec, close: jest.fn() }))
}))

describe('sqliteStorage', () => {
  beforeEach(() => {
    exec.mockReset()
    exec.mockResolvedValue({ rows: { _array: [] } })
    // Reset the module-level singleton between tests so each opens its own DB.
    jest.resetModules()
  })

  it('returns null for missing keys', async () => {
    const { sqliteStorage } = require('./sqliteStorage')
    exec.mockResolvedValueOnce({ rows: { _array: [] } })
    expect(await sqliteStorage.getItem('missing')).toBeNull()
  })

  it('returns the stored value for a known key', async () => {
    const { sqliteStorage } = require('./sqliteStorage')
    exec.mockResolvedValueOnce({ rows: { _array: [] } }) // CREATE TABLE
    exec.mockResolvedValueOnce({ rows: { _array: [{ value: 'bar' }] } })
    expect(await sqliteStorage.getItem('foo')).toBe('bar')
  })

  it('setItem upserts via INSERT OR REPLACE', async () => {
    const { sqliteStorage } = require('./sqliteStorage')
    await sqliteStorage.setItem('k', 'v')
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE'),
      ['k', 'v']
    )
  })

  it('removeItem deletes by key', async () => {
    const { sqliteStorage } = require('./sqliteStorage')
    await sqliteStorage.removeItem('k')
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM kv WHERE key = ?'),
      ['k']
    )
  })

  it('destroy drops the table', async () => {
    const { sqliteStorage } = require('./sqliteStorage')
    await sqliteStorage.destroy()
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE'))
  })

  it('returns null when SQLite throws on open', async () => {
    const { open } = require('@op-engineering/op-sqlite')
    open.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    const { sqliteStorage } = require('./sqliteStorage')
    expect(await sqliteStorage.getItem('foo')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx jest src/client/sqliteStorage.test.ts
```

Expected: failure (`Cannot find module './sqliteStorage'`).

- [ ] **Step 3: Implement `sqliteStorage.ts`**

```ts
// src/client/sqliteStorage.ts
import { open } from '@op-engineering/op-sqlite'

interface Db {
  execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { _array?: Array<Record<string, unknown>> } }>
}

const DB_NAME = 'platform-storage.sqlite'

let dbPromise: Promise<Db | null> | null = null

const openOnce = (): Promise<Db | null> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = open({ name: DB_NAME }) as unknown as Db
        await db.execute(
          'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
        )
        return db
      } catch (e) {
        console.error('[sqliteStorage] open failed', e)
        return null
      }
    })()
  }
  return dbPromise
}

export const sqliteStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const db = await openOnce()
    if (!db) return null
    try {
      const res = await db.execute('SELECT value FROM kv WHERE key = ?', [key])
      const row = res.rows?._array?.[0]
      return (row?.value as string | undefined) ?? null
    } catch (e) {
      console.error('[sqliteStorage] getItem failed', e)
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const db = await openOnce()
    if (!db) return
    try {
      await db.execute('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [
        key,
        value
      ])
    } catch (e) {
      console.error('[sqliteStorage] setItem failed', e)
    }
  },
  removeItem: async (key: string): Promise<void> => {
    const db = await openOnce()
    if (!db) return
    try {
      await db.execute('DELETE FROM kv WHERE key = ?', [key])
    } catch (e) {
      console.error('[sqliteStorage] removeItem failed', e)
    }
  },
  destroy: async (): Promise<void> => {
    const db = await openOnce()
    if (!db) return
    try {
      await db.execute('DROP TABLE IF EXISTS kv')
    } catch (e) {
      console.error('[sqliteStorage] destroy failed', e)
    }
    dbPromise = null
  }
}
```

- [ ] **Step 4: Run tests — they pass**

```bash
npx jest src/client/sqliteStorage.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/client/sqliteStorage.ts src/client/sqliteStorage.test.ts
git commit -m "feat(client): SQLite KV storage for cozy-pouch-link platform"
```

---

## Phase 2 — Pouch platform shim

### Task 2.1: `pouchPlatform.ts` (TDD)

**Files:**
- Create: `src/client/pouchPlatform.ts`
- Create: `src/client/pouchPlatform.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/client/pouchPlatform.test.ts
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() }
}))

jest.mock('cozy-pouch-link', () => ({
  __esModule: true,
  default: jest.fn(),
  SQLiteQuery: class FakeSQLiteQuery {}
}))

jest.mock('pouchdb-core', () => ({ __esModule: true, default: 'pouchdb-core-stub' }))

jest.mock('./sqliteStorage', () => ({
  sqliteStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), destroy: jest.fn() }
}))

import NetInfo from '@react-native-community/netinfo'
import { pouchPlatform } from './pouchPlatform'
import { sqliteStorage } from './sqliteStorage'

describe('pouchPlatform', () => {
  it('exposes the LinkPlatform shape', () => {
    expect(pouchPlatform.storage).toBe(sqliteStorage)
    expect(pouchPlatform.queryEngine).toBeDefined()
    expect(pouchPlatform.pouchAdapter).toBeDefined()
    expect(typeof pouchPlatform.isOnline).toBe('function')
    expect(pouchPlatform.events).toBeDefined()
  })

  it('isOnline returns true when NetInfo says connected', async () => {
    ;(NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true })
    expect(await pouchPlatform.isOnline()).toBe(true)
  })

  it('isOnline returns false when NetInfo says disconnected', async () => {
    ;(NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false })
    expect(await pouchPlatform.isOnline()).toBe(false)
  })

  it('isOnline returns false when NetInfo throws', async () => {
    ;(NetInfo.fetch as jest.Mock).mockRejectedValueOnce(new Error('net'))
    expect(await pouchPlatform.isOnline()).toBe(false)
  })
})
```

- [ ] **Step 2: Run — fails (module missing)**

```bash
npx jest src/client/pouchPlatform.test.ts
```

- [ ] **Step 3: Implement `pouchPlatform.ts`**

```ts
// src/client/pouchPlatform.ts
import NetInfo from '@react-native-community/netinfo'
import PouchDB from 'pouchdb-core'
import { SQLiteQuery } from 'cozy-pouch-link'

import { sqliteStorage } from './sqliteStorage'

// `events` is required by cozy-pouch-link's PouchManager but is only used
// when the link wants to listen to OS-level online/offline events. We do
// the listening ourselves in SyncProvider via NetInfo, so a no-op proxy is
// safe here.
const events = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined
}

export const pouchPlatform = {
  storage: sqliteStorage,
  events,
  pouchAdapter: PouchDB,
  queryEngine: SQLiteQuery,
  isOnline: async (): Promise<boolean> => {
    try {
      const state = await NetInfo.fetch()
      return state.isConnected === true
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 4: Run tests — pass**

```bash
npx jest src/client/pouchPlatform.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/client/pouchPlatform.ts src/client/pouchPlatform.test.ts
git commit -m "feat(client): pouchPlatform shim for cozy-pouch-link RN target"
```

---

## Phase 3 — Wire CozyPouchLink in createClient

### Task 3.1: `createClient.test.ts`

**Files:**
- Create: `src/client/createClient.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/client/createClient.test.ts
const pouchLinkCtor = jest.fn(function (this: any, opts: unknown) {
  this.options = opts
})

jest.mock('cozy-pouch-link', () => ({
  __esModule: true,
  default: pouchLinkCtor,
  SQLiteQuery: class {}
}))

const mockClient = jest.fn(function (this: any, opts: unknown) {
  this.options = opts
  this.registerPlugin = jest.fn().mockResolvedValue(undefined)
})
jest.mock('cozy-client', () => ({
  __esModule: true,
  default: mockClient
}))

jest.mock('cozy-flags', () => ({ __esModule: true, default: { plugin: 'flag-plugin' } }))

jest.mock('./pouchPlatform', () => ({ pouchPlatform: 'pouchPlatformStub' }))

import { createClient, pouchLink } from './createClient'

const session = {
  uri: 'https://alice.example.com',
  oauthOptions: { clientID: 'cid', clientName: 'twake' },
  token: { accessToken: 'tok' }
} as never

describe('createClient', () => {
  it('exports a CozyPouchLink singleton configured with the right doctypes', () => {
    expect(pouchLinkCtor).toHaveBeenCalledTimes(1)
    const opts = pouchLinkCtor.mock.calls[0][0] as Record<string, unknown>
    expect(opts.doctypes).toEqual(['io.cozy.files', 'io.cozy.sharings'])
    expect(opts.doctypesReplicationOptions).toEqual({
      'io.cozy.files': { strategy: 'fromRemote' },
      'io.cozy.sharings': { strategy: 'fromRemote' }
    })
    expect(opts.platform).toBe('pouchPlatformStub')
    expect(pouchLink).toBeDefined()
  })

  it('passes the pouch link as the first link in the chain', () => {
    createClient(session)
    const opts = mockClient.mock.calls[0][0] as Record<string, unknown>
    expect(opts.links).toHaveLength(1)
    expect(opts.links?.[0]).toBe(pouchLink)
    expect(opts.uri).toBe('https://alice.example.com')
  })
})
```

- [ ] **Step 2: Run — fails (createClient doesn't export pouchLink yet)**

```bash
npx jest src/client/createClient.test.ts
```

---

### Task 3.2: Modify `createClient.ts`

**Files:**
- Modify: `src/client/createClient.ts`

- [ ] **Step 1: Replace the file content**

```ts
// src/client/createClient.ts
import CozyClient from 'cozy-client'
import flag from 'cozy-flags'
import CozyPouchLink from 'cozy-pouch-link'

import { Session } from '@/auth/types'
import { pouchPlatform } from './pouchPlatform'

// Singleton: instantiated once at module load. SyncProvider imports this
// to drive the replication lifecycle (start/stop/syncImmediately).
export const pouchLink = new CozyPouchLink({
  doctypes: ['io.cozy.files', 'io.cozy.sharings'],
  doctypesReplicationOptions: {
    'io.cozy.files': { strategy: 'fromRemote' },
    'io.cozy.sharings': { strategy: 'fromRemote' }
  },
  platform: pouchPlatform
  // periodicSync defaults to true — runs the 30s Loop.
  // initialSync stays false — queries fall through to StackLink while Pouch
  // is empty during the first sync.
})

export const createClient = (session: Session): CozyClient => {
  console.log(
    '[createClient] uri',
    session.uri,
    'clientID',
    session.oauthOptions.clientID,
    'tokenLen',
    session.token.accessToken?.length ?? 0
  )
  const client = new CozyClient({
    uri: session.uri,
    oauth: { ...session.oauthOptions, token: session.token },
    scope: ['*'],
    appMetadata: {
      slug: 'twake-drive-mobile',
      version: '0.1.0'
    },
    links: [pouchLink]
  })
  void client.registerPlugin(flag.plugin, null)
  return client
}
```

- [ ] **Step 2: Run tests — pass**

```bash
npx jest src/client/createClient.test.ts
```

Expected: 2 passing.

- [ ] **Step 3: Run the full suite — confirm no regression**

```bash
npx jest --runInBand
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/client/createClient.ts src/client/createClient.test.ts
git commit -m "feat(client): wire CozyPouchLink with fromRemote strategy"
```

---

## Phase 4 — Sync context, status hook, requireOnline

### Task 4.1: `SyncContext` definition

**Files:**
- Create: `src/sync/SyncContext.ts`

- [ ] **Step 1: Write the file**

```ts
// src/sync/SyncContext.ts
import { createContext } from 'react'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncContextValue {
  status: SyncStatus
  lastSyncedAt: Date | null
  error: Error | null
  /** Trigger an immediate sync (e.g. from pull-to-refresh). No-op if offline. */
  triggerSync: () => void
}

const defaultValue: SyncContextValue = {
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  triggerSync: () => undefined
}

export const SyncContext = createContext<SyncContextValue>(defaultValue)
```

- [ ] **Step 2: Commit (no test yet — used by next tasks)**

```bash
git add src/sync/SyncContext.ts
git commit -m "feat(sync): SyncContext + SyncStatus type"
```

---

### Task 4.2: `useSyncStatus` hook

**Files:**
- Create: `src/sync/useSyncStatus.ts`
- Create: `src/sync/useSyncStatus.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
// src/sync/useSyncStatus.test.tsx
import React from 'react'
import { renderHook } from '@testing-library/react-native'

import { SyncContext } from './SyncContext'
import { useSyncStatus } from './useSyncStatus'

describe('useSyncStatus', () => {
  it('returns the default value outside a provider', () => {
    const { result } = renderHook(() => useSyncStatus())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastSyncedAt).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns the provider value when wrapped', () => {
    const value = {
      status: 'syncing' as const,
      lastSyncedAt: new Date('2026-05-10T12:00:00Z'),
      error: null,
      triggerSync: () => undefined
    }
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
    )
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    expect(result.current.status).toBe('syncing')
    expect(result.current.lastSyncedAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npx jest src/sync/useSyncStatus.test.tsx
```

- [ ] **Step 3: Implement**

```ts
// src/sync/useSyncStatus.ts
import { useContext } from 'react'

import { SyncContext, SyncContextValue } from './SyncContext'

export const useSyncStatus = (): SyncContextValue => useContext(SyncContext)
```

- [ ] **Step 4: Run — pass**

```bash
npx jest src/sync/useSyncStatus.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/sync/useSyncStatus.ts src/sync/useSyncStatus.test.tsx
git commit -m "feat(sync): useSyncStatus hook"
```

---

### Task 4.3: `requireOnline` guard

**Files:**
- Create: `src/sync/requireOnline.ts`
- Create: `src/sync/requireOnline.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/sync/requireOnline.test.ts
import { requireOnline } from './requireOnline'

const t = ((key: string) => `__${key}__`) as never

describe('requireOnline', () => {
  it('returns true and does not snackbar when status is idle', () => {
    const showSnackbar = jest.fn()
    expect(requireOnline('idle', showSnackbar, t)).toBe(true)
    expect(showSnackbar).not.toHaveBeenCalled()
  })

  it('returns true and does not snackbar when status is syncing', () => {
    const showSnackbar = jest.fn()
    expect(requireOnline('syncing', showSnackbar, t)).toBe(true)
    expect(showSnackbar).not.toHaveBeenCalled()
  })

  it('returns false and snackbars when status is offline', () => {
    const showSnackbar = jest.fn()
    expect(requireOnline('offline', showSnackbar, t)).toBe(false)
    expect(showSnackbar).toHaveBeenCalledWith('__drive.offline.requiresOnline__')
  })

  it('returns false and snackbars when status is error (assume connectivity issue)', () => {
    const showSnackbar = jest.fn()
    expect(requireOnline('error', showSnackbar, t)).toBe(false)
    expect(showSnackbar).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npx jest src/sync/requireOnline.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/sync/requireOnline.ts
import type { TFunction } from 'i18next'

import { SyncStatus } from './SyncContext'

/**
 * Guard helper used at every mutation call site.
 *
 * - Returns `true` when the app can talk to cozy-stack (`idle` or `syncing`).
 * - Returns `false` AND triggers a Snackbar otherwise (`offline` or `error`).
 *   The caller short-circuits its mutation flow when `false` is returned.
 */
export const requireOnline = (
  status: SyncStatus,
  showSnackbar: (msg: string) => void,
  t: TFunction
): boolean => {
  if (status === 'idle' || status === 'syncing') return true
  showSnackbar(t('drive.offline.requiresOnline'))
  return false
}
```

- [ ] **Step 4: Run — pass**

```bash
npx jest src/sync/requireOnline.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/sync/requireOnline.ts src/sync/requireOnline.test.ts
git commit -m "feat(sync): requireOnline guard helper"
```

---

### Task 4.4: `SyncProvider` lifecycle

**Files:**
- Create: `src/sync/SyncProvider.tsx`
- Create: `src/sync/SyncProvider.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
// src/sync/SyncProvider.test.tsx
import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'

const start = jest.fn()
const stop = jest.fn()
const sync = jest.fn()
jest.mock('@/client/createClient', () => ({
  pouchLink: { startReplication: start, stopReplication: stop, syncImmediately: sync }
}))

const useClient = jest.fn()
const clientOn = jest.fn()
const clientOff = jest.fn()
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => useClient()
}))

let netInfoListener: ((s: { isConnected: boolean }) => void) | null = null
const netInfoUnsubscribe = jest.fn()
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn().mockResolvedValue({ isConnected: true }),
    addEventListener: jest.fn(cb => {
      netInfoListener = cb
      return netInfoUnsubscribe
    })
  }
}))

let appStateListener: ((s: string) => void) | null = null
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native')
  return {
    ...actual,
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn((evt, cb) => {
        if (evt === 'change') appStateListener = cb
        return { remove: jest.fn() }
      })
    }
  }
})

import { SyncProvider } from './SyncProvider'
import { useSyncStatus } from './useSyncStatus'

const Probe = () => {
  const { status } = useSyncStatus()
  return <Text testID="probe">{status}</Text>
}

const renderWithProvider = (clientPresent: boolean) => {
  useClient.mockReturnValue(
    clientPresent ? { on: clientOn, removeListener: clientOff } : null
  )
  return render(
    <SyncProvider>
      <Probe />
    </SyncProvider>
  )
}

describe('SyncProvider', () => {
  beforeEach(() => {
    start.mockReset()
    stop.mockReset()
    sync.mockReset()
    clientOn.mockReset()
    clientOff.mockReset()
    netInfoListener = null
    appStateListener = null
  })

  it('starts replication when authenticated', () => {
    renderWithProvider(true)
    expect(start).toHaveBeenCalled()
  })

  it('does not start when client is null (unauthenticated)', () => {
    renderWithProvider(false)
    expect(start).not.toHaveBeenCalled()
  })

  it('stops replication when going to background', () => {
    renderWithProvider(true)
    expect(appStateListener).toBeTruthy()
    act(() => appStateListener!('background'))
    expect(stop).toHaveBeenCalled()
  })

  it('schedules an immediate sync when returning to foreground', () => {
    renderWithProvider(true)
    act(() => appStateListener!('background'))
    sync.mockClear()
    act(() => appStateListener!('active'))
    expect(sync).toHaveBeenCalled()
  })

  it('flips to offline status when NetInfo reports disconnected', () => {
    const { getByTestId } = renderWithProvider(true)
    act(() => netInfoListener!({ isConnected: false } as never))
    expect(getByTestId('probe').props.children).toBe('offline')
    expect(stop).toHaveBeenCalled()
  })

  it('resumes syncing when NetInfo flips back online', () => {
    const { getByTestId } = renderWithProvider(true)
    act(() => netInfoListener!({ isConnected: false } as never))
    sync.mockClear()
    start.mockClear()
    act(() => netInfoListener!({ isConnected: true } as never))
    expect(start).toHaveBeenCalled()
    expect(sync).toHaveBeenCalled()
    expect(getByTestId('probe').props.children).toBe('syncing')
  })

  it('subscribes to pouchlink:doctypesync:start/end on the client', () => {
    renderWithProvider(true)
    expect(clientOn).toHaveBeenCalledWith(
      'pouchlink:doctypesync:start',
      expect.any(Function)
    )
    expect(clientOn).toHaveBeenCalledWith(
      'pouchlink:sync:end',
      expect.any(Function)
    )
  })

  it('updates status to syncing on doctypesync:start, idle on sync:end', () => {
    const { getByTestId } = renderWithProvider(true)
    const startHandler = clientOn.mock.calls.find(
      c => c[0] === 'pouchlink:doctypesync:start'
    )![1]
    const endHandler = clientOn.mock.calls.find(c => c[0] === 'pouchlink:sync:end')![1]
    act(() => startHandler('io.cozy.files'))
    expect(getByTestId('probe').props.children).toBe('syncing')
    act(() => endHandler())
    expect(getByTestId('probe').props.children).toBe('idle')
  })
})
```

- [ ] **Step 2: Run — fails (no SyncProvider)**

```bash
npx jest src/sync/SyncProvider.test.tsx
```

- [ ] **Step 3: Implement `SyncProvider.tsx`**

```tsx
// src/sync/SyncProvider.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useClient } from 'cozy-client'

import { pouchLink } from '@/client/createClient'
import { SyncContext, SyncContextValue, SyncStatus } from './SyncContext'

interface Props {
  children: React.ReactNode
}

export const SyncProvider = ({ children }: Props) => {
  const client = useClient()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)
  // We track whether NetInfo last said offline so we can decide whether
  // doctypesync:start should flip the pill to 'syncing' or stay 'offline'.
  const offlineRef = useRef(false)

  // Lifecycle: start replication when client is available.
  useEffect(() => {
    if (!client) return
    pouchLink.startReplication()
    return () => {
      pouchLink.stopReplication()
    }
  }, [client])

  // AppState: stop on background, immediate sync on foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        pouchLink.stopReplication()
      } else if (next === 'active' && !offlineRef.current) {
        pouchLink.syncImmediately()
      }
    })
    return () => sub.remove()
  }, [])

  // NetInfo: track online/offline transitions.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected === true
      if (!online && !offlineRef.current) {
        offlineRef.current = true
        setStatus('offline')
        pouchLink.stopReplication()
      } else if (online && offlineRef.current) {
        offlineRef.current = false
        setStatus('syncing')
        pouchLink.startReplication()
        pouchLink.syncImmediately()
      }
    })
    return () => unsubscribe()
  }, [])

  // cozy-client events from the pouch link.
  useEffect(() => {
    if (!client) return
    const onDoctypeStart = () => {
      if (!offlineRef.current) setStatus('syncing')
    }
    const onSyncEnd = () => {
      if (!offlineRef.current) {
        setStatus('idle')
        setLastSyncedAt(new Date())
        setError(null)
      }
    }
    const onSyncError = (err: Error) => {
      if (!offlineRef.current) {
        setStatus('error')
        setError(err)
      }
    }
    client.on('pouchlink:doctypesync:start', onDoctypeStart)
    client.on('pouchlink:sync:end', onSyncEnd)
    client.on('pouchlink:sync:error', onSyncError)
    return () => {
      client.removeListener?.('pouchlink:doctypesync:start', onDoctypeStart)
      client.removeListener?.('pouchlink:sync:end', onSyncEnd)
      client.removeListener?.('pouchlink:sync:error', onSyncError)
    }
  }, [client])

  const triggerSync = useCallback(() => {
    if (offlineRef.current) return
    pouchLink.syncImmediately()
  }, [])

  const value: SyncContextValue = useMemo(
    () => ({ status, lastSyncedAt, error, triggerSync }),
    [status, lastSyncedAt, error, triggerSync]
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
```

- [ ] **Step 4: Run tests — pass**

```bash
npx jest src/sync/SyncProvider.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/sync/SyncProvider.tsx src/sync/SyncProvider.test.tsx
git commit -m "feat(sync): SyncProvider drives lifecycle (auth, AppState, NetInfo, events)"
```

---

## Phase 5 — UI: SyncBadge + AppBar + i18n

### Task 5.1: i18n keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/fr.json`

- [ ] **Step 1: Add the new keys to `en.json` under `drive`**

Append these inside the existing `drive` block (somewhere stable, e.g. after `delete`):

```json
"offline": {
  "requiresOnline": "Available when you're back online",
  "lastSynced": "Last synced {{when}}",
  "syncing": "Syncing…",
  "storageUnavailable": "Offline storage unavailable — the app works online"
}
```

- [ ] **Step 2: Add the FR equivalents**

```json
"offline": {
  "requiresOnline": "Disponible quand vous serez en ligne",
  "lastSynced": "Synchronisé {{when}}",
  "syncing": "Synchronisation…",
  "storageUnavailable": "Stockage hors-ligne indisponible — l'app fonctionne en ligne"
}
```

- [ ] **Step 3: Verify the JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/locales/fr.json','utf8')); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "i18n: keys for offline indicators and guards"
```

---

### Task 5.2: `SyncBadge` component

**Files:**
- Create: `src/ui/SyncBadge.tsx`
- Create: `src/ui/SyncBadge.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
// src/ui/SyncBadge.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

import { SyncContext, SyncContextValue } from '@/sync/SyncContext'
import { SyncBadge } from './SyncBadge'

const wrap = (value: Partial<SyncContextValue>) => {
  const full: SyncContextValue = {
    status: 'idle',
    lastSyncedAt: null,
    error: null,
    triggerSync: () => undefined,
    ...value
  }
  return render(
    <PaperProvider>
      <SyncContext.Provider value={full}>
        <SyncBadge />
      </SyncContext.Provider>
    </PaperProvider>
  )
}

describe('SyncBadge', () => {
  it('renders nothing when idle', () => {
    const { queryByTestId } = wrap({ status: 'idle' })
    expect(queryByTestId('sync-badge')).toBeNull()
  })

  it('renders a spinner when syncing', () => {
    const { getByTestId } = wrap({ status: 'syncing' })
    expect(getByTestId('sync-badge-syncing')).toBeTruthy()
  })

  it('renders a cloud-off icon when offline', () => {
    const { getByTestId } = wrap({ status: 'offline' })
    expect(getByTestId('sync-badge-offline')).toBeTruthy()
  })

  it('renders an alert icon when error', () => {
    const { getByTestId } = wrap({ status: 'error' })
    expect(getByTestId('sync-badge-error')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npx jest src/ui/SyncBadge.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// src/ui/SyncBadge.tsx
import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { IconButton } from 'react-native-paper'

import { useSyncStatus } from '@/sync/useSyncStatus'

export const SyncBadge = () => {
  const { status } = useSyncStatus()

  if (status === 'idle') return null

  if (status === 'syncing') {
    return (
      <View style={styles.wrapper} testID="sync-badge">
        <ActivityIndicator size="small" testID="sync-badge-syncing" />
      </View>
    )
  }

  if (status === 'offline') {
    return (
      <IconButton
        icon="cloud-off-outline"
        accessibilityLabel="offline"
        testID="sync-badge-offline"
        size={20}
      />
    )
  }

  // status === 'error'
  return (
    <IconButton
      icon="alert-circle-outline"
      accessibilityLabel="sync error"
      testID="sync-badge-error"
      size={20}
    />
  )
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 12, justifyContent: 'center' }
})
```

- [ ] **Step 4: Run — pass**

```bash
npx jest src/ui/SyncBadge.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/SyncBadge.tsx src/ui/SyncBadge.test.tsx
git commit -m "feat(ui): SyncBadge renders sync status pill"
```

---

### Task 5.3: Insert `SyncBadge` into `AppBar`

**Files:**
- Modify: `src/ui/AppBar.tsx`

- [ ] **Step 1: Add the import + render in the right slot, before the existing `onLogout` menu**

Open `src/ui/AppBar.tsx` and locate the section that builds the right-side actions in the **non-selection** branch (around the existing `<Menu ... onLogout>...`). Insert the badge just before:

```tsx
import { SyncBadge } from './SyncBadge'
```

Then inside the JSX, in the non-selection branch:

```tsx
<Appbar.Header>
  {onBack ? <Appbar.BackAction onPress={onBack} /> : null}
  <Appbar.Content title={title} />
  <SyncBadge />
  {onLogout ? (
    <Menu ...>...</Menu>
  ) : null}
</Appbar.Header>
```

- [ ] **Step 2: Run the existing AppBar tests (if any) + the new SyncBadge tests**

```bash
npx jest src/ui
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/AppBar.tsx
git commit -m "feat(ui): AppBar shows SyncBadge in the right slot"
```

---

## Phase 6 — Mutation helpers + screen guards

### Task 6.1: `softDeleteEntry` calls `syncImmediately` after success

**Files:**
- Modify: `src/files/deleteFile.ts`
- Modify: `src/files/deleteFile.test.ts`

- [ ] **Step 1: Update the test to assert `syncImmediately` is called**

Add a top-level mock and a new test:

```ts
// At the top of src/files/deleteFile.test.ts
jest.mock('@/client/createClient', () => ({
  pouchLink: { syncImmediately: jest.fn() }
}))
import { pouchLink } from '@/client/createClient'

// Add at the bottom:
describe('softDeleteEntry — pouch sync', () => {
  beforeEach(() => {
    ;(pouchLink.syncImmediately as jest.Mock).mockReset()
  })

  it('schedules an immediate pouch sync after a successful destroy', async () => {
    const destroy = jest.fn().mockResolvedValue({})
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await softDeleteEntry(client, { _id: 'abc' })
    expect(pouchLink.syncImmediately).toHaveBeenCalledTimes(1)
  })

  it('does not call syncImmediately when destroy throws', async () => {
    const destroy = jest.fn().mockRejectedValue(new Error('boom'))
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await expect(softDeleteEntry(client, { _id: 'abc' })).rejects.toThrow()
    expect(pouchLink.syncImmediately).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx jest src/files/deleteFile.test.ts
```

- [ ] **Step 3: Update `deleteFile.ts`**

Replace the body of `softDeleteEntry`:

```ts
import { pouchLink } from '@/client/createClient'
// ... existing imports

export const softDeleteEntry = async (
  client: CozyClient,
  entry: DeletableEntry
): Promise<void> => {
  await client.destroy({
    _id: entry._id,
    _rev: entry._rev,
    _type: entry._type ?? 'io.cozy.files'
  })
  pouchLink.syncImmediately()
}
```

- [ ] **Step 4: Run — pass**

```bash
npx jest src/files/deleteFile.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/files/deleteFile.ts src/files/deleteFile.test.ts
git commit -m "feat(sync): softDeleteEntry triggers immediate pouch sync"
```

---

### Task 6.2: `createFolder` triggers immediate pouch sync

**Files:**
- Modify: `src/files/createFolder.ts`
- Modify: `src/files/createFolder.test.ts`

- [ ] **Step 1: Add the test mock + assertion**

In `src/files/createFolder.test.ts`, add at top:

```ts
jest.mock('@/client/createClient', () => ({
  pouchLink: { syncImmediately: jest.fn() }
}))
import { pouchLink } from '@/client/createClient'
```

And add a test like the one in 6.1 for the success and error paths.

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Update the implementation**

In `src/files/createFolder.ts`, after the existing `await collection.create(...)`:

```ts
import { pouchLink } from '@/client/createClient'
// ... existing imports

export const createFolder = async (...) => {
  const result = await collection.create({...})
  pouchLink.syncImmediately()
  return result
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add src/files/createFolder.ts src/files/createFolder.test.ts
git commit -m "feat(sync): createFolder triggers immediate pouch sync"
```

---

### Task 6.3: `createCozyNote` triggers immediate pouch sync

**Files:**
- Modify: `src/files/createCozyNote.ts`
- Modify: `src/files/createCozyNote.test.ts`

- [ ] **Step 1: Add the mock + tests**

At the top of `src/files/createCozyNote.test.ts`:

```ts
jest.mock('@/client/createClient', () => ({
  pouchLink: { syncImmediately: jest.fn() }
}))
import { pouchLink } from '@/client/createClient'
```

Add tests:

```ts
describe('createCozyNote — pouch sync', () => {
  beforeEach(() => {
    ;(pouchLink.syncImmediately as jest.Mock).mockReset()
  })

  it('schedules an immediate pouch sync after success', async () => {
    // Re-use the existing happy-path mock setup of this file (an existing
    // test in createCozyNote.test.ts already wires up a successful client).
    // Adapt to that fixture; key assertion below.
    // ... call createCozyNote(client, 'parent-dir')
    expect(pouchLink.syncImmediately).toHaveBeenCalledTimes(1)
  })

  it('does not call syncImmediately when the API throws', async () => {
    // Replace the existing successful mock with one that rejects, then
    // assert syncImmediately was never reached.
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npx jest src/files/createCozyNote.test.ts
```

- [ ] **Step 3: Update `createCozyNote.ts`**

Add the import:

```ts
import { pouchLink } from '@/client/createClient'
```

Locate the success path (after the cozy-stack `POST /notes` call resolves and the result is built). Add `pouchLink.syncImmediately()` immediately before the return:

```ts
const created = await stackClient.fetchJSON('POST', '/notes', { ... })
pouchLink.syncImmediately()
return /* the existing return value */
```

- [ ] **Step 4: Run — pass**

```bash
npx jest src/files/createCozyNote.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/files/createCozyNote.ts src/files/createCozyNote.test.ts
git commit -m "feat(sync): createCozyNote triggers immediate pouch sync"
```

---

### Task 6.4: `createOfficeFile` triggers immediate pouch sync

**Files:**
- Modify: `src/files/createOfficeFile.ts`
- Modify: `src/files/createOfficeFile.test.ts`

- [ ] **Step 1: Add the mock + tests**

At the top of `src/files/createOfficeFile.test.ts`:

```ts
jest.mock('@/client/createClient', () => ({
  pouchLink: { syncImmediately: jest.fn() }
}))
import { pouchLink } from '@/client/createClient'
```

Add tests:

```ts
describe('createOfficeFile — pouch sync', () => {
  beforeEach(() => {
    ;(pouchLink.syncImmediately as jest.Mock).mockReset()
  })

  it('schedules an immediate pouch sync after success', async () => {
    // The existing happy-path test should already produce a created file;
    // re-use that fixture and assert:
    expect(pouchLink.syncImmediately).toHaveBeenCalledTimes(1)
  })

  it('does not call syncImmediately when the upload errors', async () => {
    // Replace the existing successful mock with one that rejects.
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npx jest src/files/createOfficeFile.test.ts
```

- [ ] **Step 3: Update `createOfficeFile.ts`**

Add:

```ts
import { pouchLink } from '@/client/createClient'
```

Then in the function, after the `POST /files/upload` (or `client.collection('io.cozy.files').create(...)`) returns successfully, add:

```ts
pouchLink.syncImmediately()
```

before returning the created doc.

- [ ] **Step 4: Run — pass**

```bash
npx jest src/files/createOfficeFile.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/files/createOfficeFile.ts src/files/createOfficeFile.test.ts
git commit -m "feat(sync): createOfficeFile triggers immediate pouch sync"
```

---

### Task 6.5: `sharing.ts` mutations trigger immediate pouch sync

**Files:**
- Modify: `src/files/sharing.ts`

In `src/files/sharing.ts`, identify each mutation function (public link create/destroy, recipient add/remove/revoke, right change). After each successful await, call `pouchLink.syncImmediately()`.

- [ ] **Step 1: Add the import**

```ts
import { pouchLink } from '@/client/createClient'
```

- [ ] **Step 2: Locate each mutation export and append `pouchLink.syncImmediately()` after the success line.** Don't introduce it inside try/catch — it should only run on the success path.

- [ ] **Step 3: Run the existing sharing tests**

```bash
npx jest src/files/sharing
```

Expected: still green (existing tests don't check the new call).

- [ ] **Step 4: Commit**

```bash
git add src/files/sharing.ts
git commit -m "feat(sync): sharing mutations trigger immediate pouch sync"
```

---

### Task 6.6: `requireOnline` guard in FilesScreen

**Files:**
- Modify: `app/(drive)/files/[...path].tsx`

- [ ] **Step 1: Import the guard + sync hook**

```tsx
import { useSyncStatus } from '@/sync/useSyncStatus'
import { requireOnline } from '@/sync/requireOnline'
```

- [ ] **Step 2: Inside the component, read the status**

```tsx
const { status: syncStatus } = useSyncStatus()
```

- [ ] **Step 3: Guard each mutation entry point**

Wrap the existing handlers. For `confirmDelete`:

```tsx
const confirmDelete = async (): Promise<void> => {
  if (!client || !pendingDelete) return
  if (!requireOnline(syncStatus, m => setSnackbar(m), t)) return
  setDeleting(true)
  try {
    await softDeleteEntry(client, {...})
    // ...
  }
}
```

Same for `confirmBulkDelete`, `handleCreate` (folder), `handleCreateOffice`, `handleCreateNote`, `handleCreateDocs`.

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/(drive)/files/[...path].tsx
git commit -m "feat(sync): FilesScreen mutations require online"
```

---

### Task 6.7: `requireOnline` guard in RecentScreen

**Files:**
- Modify: `app/(drive)/recent.tsx`

- [ ] **Step 1: Same pattern as Task 6.6 — import the guard + the hook, wrap `confirmDelete`.**

- [ ] **Step 2: typecheck + commit**

```bash
npx tsc --noEmit
git add app/(drive)/recent.tsx
git commit -m "feat(sync): RecentScreen delete requires online"
```

---

### Task 6.8: `requireOnline` guard in ShareSheet

**Files:**
- Modify: `src/ui/ShareSheet.tsx`

- [ ] **Step 1: Import + read status**

- [ ] **Step 2: Wrap each mutation in the sheet — `togglePublicLink`, `addRecipient`, `removeMember`, `changeMemberRights` — with `requireOnline`.**

```tsx
const onTogglePublicLink = async () => {
  if (!requireOnline(syncStatus, showSnackbar, t)) return
  // ... existing flow
}
```

The exact handler names depend on the current ShareSheet shape — look for any function calling `client.collection('io.cozy.permissions')...` or `client.collection('io.cozy.sharings').create(...)`.

- [ ] **Step 3: typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/ShareSheet.tsx
git commit -m "feat(sync): ShareSheet mutations require online"
```

---

## Phase 7 — Mount the provider

### Task 7.1: Wrap `(drive)/_layout.tsx` with `SyncProvider`

**Files:**
- Modify: `app/(drive)/_layout.tsx`

- [ ] **Step 1: Add the import**

```tsx
import { SyncProvider } from '@/sync/SyncProvider'
```

- [ ] **Step 2: Wrap the `Tabs`**

Existing structure is:

```tsx
<SharingProvider>
  <Tabs ...>...</Tabs>
</SharingProvider>
```

Becomes:

```tsx
<SharingProvider>
  <SyncProvider>
    <Tabs ...>...</Tabs>
  </SyncProvider>
</SharingProvider>
```

- [ ] **Step 3: typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/(drive)/_layout.tsx
git commit -m "feat(sync): mount SyncProvider in (drive) layout"
```

---

## Phase 8 — Final verification

### Task 8.1: All Jest tests + typecheck green

- [ ] **Step 1: Run full suite**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx jest --runInBand
```

Expected: all green. Total tests should grow by ~25 (sqliteStorage 6, pouchPlatform 4, useSyncStatus 2, requireOnline 4, SyncProvider 8, SyncBadge 4, plus 2 per mutation helper × 5 helpers = 10).

- [ ] **Step 2: typecheck**

```bash
npx tsc --noEmit
```

Expected: only the 4 pre-existing errors documented in earlier plans (`/(drive)/files` typed-routes warnings, `scope` ClientOptions). No new ones.

- [ ] **Step 3: Lint (if currently clean)**

```bash
npx eslint . --ext .ts,.tsx 2>&1 | tail -5
```

Expected: 0 errors / no new warnings.

---

### Task 8.2: iOS build + manual smoke checklist

- [ ] **Step 1: Rebuild + launch**

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd ios && pod install && cd ..
npx expo run:ios
```

Expected: app boots on iPhone 16 simulator.

- [ ] **Step 2: Smoke scenario A — first login on a fresh simulator**

Manual checks:
1. Login flow completes.
2. Mes fichiers screen appears immediately (StackLink fallback).
3. Top-right of AppBar: spinner appears for the duration of the initial sync, then disappears.
4. Force-quit the app, relaunch: Mes fichiers shows **instantly** (served from local SQLite).

- [ ] **Step 3: Smoke scenario B — toggle airplane mode**

1. Online: navigate into a sub-folder — list loads instantly.
2. Enable airplane mode in the simulator (`Device > Settings > Airplane Mode`).
3. AppBar shows the cloud-off icon.
4. Tap the icon → popover « Last synced: just now ».
5. Tap the bin icon on a folder → confirm dialog → Delete.
6. **Expected:** Snackbar « Disponible quand vous serez en ligne », folder still in the list.
7. Disable airplane mode → AppBar spinner briefly → cloud icon disappears.

- [ ] **Step 4: Smoke scenario C — mutation immediate-sync coherence**

1. Online: delete a file → it disappears immediately.
2. Force-quit the app.
3. Toggle airplane mode ON.
4. Relaunch the app → the deleted file is **not** in the listing (proof that `syncImmediately` after delete updated Pouch before the app was killed).

- [ ] **Step 5: Smoke scenario D — background → foreground**

1. Open the app, wait for sync `idle`.
2. Send the app to background, wait 1 minute.
3. Bring it back to foreground.
4. **Expected:** AppBar spinner appears briefly (catchup), then disappears.

- [ ] **Step 6: Document any deviations as follow-up issues** in this plan or in the project tracker.

- [ ] **Step 7: Final commit if any docs changed**

```bash
git add -A
git diff --cached --stat
git commit -m "chore(sync): smoke test results + plan annotations" || echo "nothing to commit"
git push
```

---

## Done criteria (recap from spec)

- [ ] `cozy-pouch-link`, `@op-engineering/op-sqlite`, `@cozy/minilog`, `@react-native-community/netinfo` installed; iOS build green.
- [ ] `sqliteStorage`, `pouchPlatform`, `SyncProvider`, `useSyncStatus`, `requireOnline`, `SyncBadge` created and unit-tested.
- [ ] `createClient` configures the link with `strategy: 'fromRemote'` for `io.cozy.files` and `io.cozy.sharings`.
- [ ] AppBar shows the badge only when `syncing` / `offline` / `error`.
- [ ] `softDeleteEntry`, `createFolder`, `createCozyNote`, `createOfficeFile`, and the mutations of `src/files/sharing.ts` call `pouchLink.syncImmediately()` after success.
- [ ] All mutation entry points (FilesScreen, RecentScreen, ShareSheet) use `requireOnline` to short-circuit on `offline`/`error` state.
- [ ] All five smoke scenarios pass.
- [ ] All Jest tests green and typecheck clean.
