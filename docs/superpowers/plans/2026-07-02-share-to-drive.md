# Share to Twake Drive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recevoir n'importe quel contenu partagé depuis l'OS (iOS Share Sheet / Android `ACTION_SEND`), laisser l'utilisateur parcourir ses dossiers Twake Drive, et uploader dans la destination choisie.

**Architecture:** Extension « mince » : la capture native (via `expo-share-intent`, isolée derrière `src/share/`) stage le contenu puis **ouvre l'app** ; l'app réutilise le `FolderPicker` existant et un pipeline d'upload **streaming** vers cozy-stack. L'extension iOS ne manipule ni cozy-client ni token — tout se passe dans l'app.

**Tech Stack:** Expo SDK 54 · expo-router · cozy-client / cozy-stack-client · `react-native-blob-util` (upload streaming) · `expo-share-intent` (capture) · react-native-paper · jest + @testing-library/react-native.

## Global Constraints

- **⚠️ BLOQUÉ sur FileProvider.** N'exécuter **aucune** tâche avant que le chantier FileProvider ait mergé sa fondation native. Voir « Préconditions ».
- **App Group id (verbatim) :** `group.com.linagora.twakedrive` — doit être **identique** à celui utilisé par FileProvider.
- **Bundle / applicationId :** `com.linagora.twakedrive` (iOS + Android).
- **`ios/` et `android/` sont prebuild-managed** — toute modif native passe par un **config-plugin** (jamais d'édition manuelle durable) et un `npx expo prebuild`.
- **Schemes déjà déclarés :** `cozy`, `twakedrive` (app.json). Ne pas les changer.
- **expo-file-system SDK 54 :** importer depuis `expo-file-system/legacy` pour `cacheDirectory` / `makeDirectoryAsync` / `writeAsStringAsync` (l'API racine les throw au runtime — cf. `src/files/openFile.ts:1-4`).
- **Worktree/PR dédié :** exécuter ce plan dans un worktree créé **par-dessus** l'état contenant FileProvider (cf. superpowers:using-git-worktrees au moment de l'exécution).
- **TDD, DRY, YAGNI, commits fréquents.**

---

## Préconditions (fournies par le chantier FileProvider — à vérifier AVANT de commencer)

- [ ] `ios/TwakeDrive/TwakeDrive.entitlements` contient `com.apple.security.application-groups` = `group.com.linagora.twakedrive`.
- [ ] Un **scaffold de config-plugin** existe (dossier `plugins/`) et le prebuild passe (`npx expo prebuild --clean` OK sur iOS + Android).
- [ ] La cible principale iOS build toujours après l'ajout de la fondation (App Group + entitlements).
- [ ] Accord confirmé avec la session FileProvider sur l'App Group id **identique**.

> Si l'une de ces préconditions manque, **stop** : la capture iOS (Task 6) ne peut pas être finalisée proprement. Les Tasks 1–4 (pur JS/TS) sont néanmoins réalisables et testables sans la fondation.

---

## File Structure

**Créés :**
- `src/files/uploadSharedFile.ts` — upload streaming d'un fichier local vers un `dirId` (bearer + `react-native-blob-util`, dédup 409). *Aucune dépendance à la couche share.*
- `src/files/uploadSharedFile.test.ts`
- `src/share/uploadBatch.ts` — orchestration multi-fichiers (progression agrégée, échecs partiels), déclenche la réplication une fois.
- `src/share/uploadBatch.test.ts`
- `src/share/useIncomingShare.ts` — **interface d'isolation** de la capture (wrappe `expo-share-intent`). Émet `SharedItem[]` + `text`.
- `src/share/textToFile.ts` — convertit un texte/URL partagé en fichier `.txt` en cache.
- `src/share/PendingShareProvider.tsx` — stocke le lot en attente, gère la reprise après login, navigue vers `/import`.
- `src/share/PendingShareProvider.test.tsx`
- `app/import/_layout.tsx` — provider de contexte + `Stack` imbriqué + `Snackbar` ; `onConfirm(dest)` = upload du lot. *(miroir de `app/move/[ids]/_layout.tsx`)*
- `app/import/_ImportScreen.tsx` — câble `FolderPicker` au contexte. *(miroir de `app/move/[ids]/_MoveScreen.tsx`)*
- `app/import/index.tsx` — racine du picker.
- `app/import/[...path].tsx` — sous-dossiers.
- `app/import/_ImportScreen.test.tsx`

**Modifiés :**
- `app/_layout.tsx` — enregistrer la modal `import` (pageSheet) + monter `ShareIntentProvider` (lib) et `PendingShareProvider`.
- `app.json` — ajouter le plugin `expo-share-intent` (App Group + activation rules + intent filters).
- `src/i18n/locales/en.json` & `src/i18n/locales/fr.json` — bloc `drive.import.*`.
- `package.json` — ajouter `expo-share-intent`.

---

## Task 1 : Pipeline d'upload streaming (`uploadSharedFile`)

**Files:**
- Create: `src/files/uploadSharedFile.ts`
- Test: `src/files/uploadSharedFile.test.ts`

**Interfaces:**
- Produces:
  - `interface SharedItem { uri: string; name: string; mimeType: string; size?: number }`
  - `interface UploadedFile { _id: string; name: string }`
  - `type UploadProgress = (fraction: number) => void`
  - `uploadSharedFile(client: CozyClient, item: SharedItem, dirId: string, onProgress?: UploadProgress): Promise<UploadedFile>`
- Consumes: `client.getStackClient()` → `{ uri, getAccessToken() }` (cf. `src/files/openFile.ts:55-58`).

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/files/uploadSharedFile.test.ts
import { uploadSharedFile } from './uploadSharedFile'

const mkResp = (status: number, body: unknown) => {
  const p: any = Promise.resolve({
    info: () => ({ status }),
    json: () => body
  })
  p.uploadProgress = jest.fn(() => p) // chainable, returns same thenable
  return p
}

const fetchMock = jest.fn()
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    wrap: (path: string) => ({ __wrapped: path })
  }
}))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

const client = {
  getStackClient: () => ({ uri: 'https://alice.example', getAccessToken: () => 'tok' })
} as unknown as import('cozy-client').default

const item = { uri: 'file:///tmp/pic.jpg', name: 'pic.jpg', mimeType: 'image/jpeg' }

beforeEach(() => fetchMock.mockReset())

test('POSTs the file to the folder upload route with a bearer token', async () => {
  fetchMock.mockReturnValueOnce(mkResp(201, { data: { id: 'f1', attributes: { name: 'pic.jpg' } } }))
  const res = await uploadSharedFile(client, item, 'dir42')
  expect(res).toEqual({ _id: 'f1', name: 'pic.jpg' })
  const [method, url, headers, wrapped] = fetchMock.mock.calls[0]
  expect(method).toBe('POST')
  expect(url).toBe('https://alice.example/files/dir42?Type=file&Name=pic.jpg')
  expect(headers.Authorization).toBe('Bearer tok')
  expect(headers['Content-Type']).toBe('image/jpeg')
  expect(wrapped).toEqual({ __wrapped: '/tmp/pic.jpg' })
})

test('retries with a numeric suffix on 409 name conflict', async () => {
  fetchMock
    .mockReturnValueOnce(mkResp(409, {}))
    .mockReturnValueOnce(mkResp(201, { data: { id: 'f2', attributes: { name: 'pic (1).jpg' } } }))
  const res = await uploadSharedFile(client, item, 'dir42')
  expect(res._id).toBe('f2')
  expect(fetchMock.mock.calls[1][1]).toBe('https://alice.example/files/dir42?Type=file&Name=pic%20(1).jpg')
})

test('throws on a non-conflict HTTP error', async () => {
  fetchMock.mockReturnValueOnce(mkResp(507, {}))
  await expect(uploadSharedFile(client, item, 'dir42')).rejects.toThrow('HTTP 507')
})

test('reports progress and completion', async () => {
  fetchMock.mockReturnValueOnce(mkResp(201, { data: { id: 'f1' } }))
  const seen: number[] = []
  await uploadSharedFile(client, item, 'dir42', f => seen.push(f))
  expect(seen[seen.length - 1]).toBe(1)
})
```

- [ ] **Step 2: Lancer le test — il échoue**

Run: `npx jest src/files/uploadSharedFile.test.ts`
Expected: FAIL — `Cannot find module './uploadSharedFile'`.

- [ ] **Step 3: Implémenter**

```typescript
// src/files/uploadSharedFile.ts
import ReactNativeBlobUtil from 'react-native-blob-util'
import type CozyClient from 'cozy-client'

export interface SharedItem {
  uri: string
  name: string
  mimeType: string
  size?: number
}
export interface UploadedFile {
  _id: string
  name: string
}
export type UploadProgress = (fraction: number) => void

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

const MAX_DEDUPE = 50

const splitName = (name: string): { base: string; ext: string } => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

const dedupeName = (name: string, attempt: number): string => {
  if (attempt === 0) return name
  const { base, ext } = splitName(name)
  return `${base} (${attempt})${ext}`
}

// react-native-blob-util streams from a real filesystem path (no file://).
const toLocalPath = (uri: string): string =>
  uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri

interface UploadResponse {
  info: () => { status: number }
  json: () => { data?: { id?: string; _id?: string; attributes?: { name?: string } } }
}

export const uploadSharedFile = async (
  client: CozyClient,
  item: SharedItem,
  dirId: string,
  onProgress?: UploadProgress
): Promise<UploadedFile> => {
  const stack = client.getStackClient() as unknown as MinimalStackClient
  const token = stack.getAccessToken()
  if (!token) throw new Error('No access token available')
  const path = toLocalPath(item.uri)
  const contentType = item.mimeType || 'application/octet-stream'

  for (let attempt = 0; attempt < MAX_DEDUPE; attempt++) {
    const name = dedupeName(item.name, attempt)
    const url =
      `${stack.uri}/files/${encodeURIComponent(dirId)}` +
      `?Type=file&Name=${encodeURIComponent(name)}`
    const res = (await ReactNativeBlobUtil.fetch(
      'POST',
      url,
      { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      ReactNativeBlobUtil.wrap(path)
    ).uploadProgress((written: number, total: number) => {
      if (total > 0) onProgress?.(written / total)
    })) as unknown as UploadResponse

    const status = res.info().status
    if (status === 409) continue // name conflict → retry with a suffix
    if (status >= 400) throw new Error(`Upload failed (HTTP ${status})`)

    const data = res.json().data ?? {}
    const id = data.id ?? data._id
    if (!id) throw new Error('Upload returned no id')
    onProgress?.(1)
    return { _id: id, name: data.attributes?.name ?? name }
  }
  throw new Error('Could not find a free filename after multiple attempts')
}
```

- [ ] **Step 4: Lancer les tests — ils passent**

Run: `npx jest src/files/uploadSharedFile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/files/uploadSharedFile.ts src/files/uploadSharedFile.test.ts
git commit -m "feat(share): streaming upload pipeline with 409 dedupe"
```

---

## Task 2 : Orchestrateur de lot (`uploadBatch`)

**Files:**
- Create: `src/share/uploadBatch.ts`
- Test: `src/share/uploadBatch.test.ts`

**Interfaces:**
- Consumes: `uploadSharedFile`, `SharedItem`, `UploadedFile` (Task 1) ; `triggerPouchReplication` (`@/pouchdb/triggerReplication`).
- Produces:
  - `interface BatchItemResult { item: SharedItem; ok: boolean; file?: UploadedFile; error?: string }`
  - `interface BatchResult { results: BatchItemResult[]; succeeded: number; failed: number }`
  - `type BatchProgress = (done: number, total: number, currentFraction: number) => void`
  - `uploadBatch(client, items, dirId, onProgress?): Promise<BatchResult>`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/share/uploadBatch.test.ts
import { uploadBatch } from './uploadBatch'
import { uploadSharedFile } from '@/files/uploadSharedFile'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

jest.mock('@/files/uploadSharedFile', () => ({ uploadSharedFile: jest.fn() }))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

const client = {} as unknown as import('cozy-client').default
const items = [
  { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' },
  { uri: 'file:///b.jpg', name: 'b.jpg', mimeType: 'image/jpeg' }
]

beforeEach(() => {
  ;(uploadSharedFile as jest.Mock).mockReset()
  ;(triggerPouchReplication as jest.Mock).mockReset()
})

test('uploads every item and triggers replication once on success', async () => {
  ;(uploadSharedFile as jest.Mock)
    .mockResolvedValueOnce({ _id: 'a', name: 'a.jpg' })
    .mockResolvedValueOnce({ _id: 'b', name: 'b.jpg' })
  const res = await uploadBatch(client, items, 'dir1')
  expect(res.succeeded).toBe(2)
  expect(res.failed).toBe(0)
  expect(triggerPouchReplication).toHaveBeenCalledTimes(1)
})

test('records partial failures without aborting the batch', async () => {
  ;(uploadSharedFile as jest.Mock)
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce({ _id: 'b', name: 'b.jpg' })
  const res = await uploadBatch(client, items, 'dir1')
  expect(res.succeeded).toBe(1)
  expect(res.failed).toBe(1)
  expect(res.results[0]).toMatchObject({ ok: false, error: 'boom' })
  expect(res.results[1]).toMatchObject({ ok: true })
  expect(triggerPouchReplication).toHaveBeenCalledTimes(1) // ≥1 success
})

test('does not trigger replication when everything fails', async () => {
  ;(uploadSharedFile as jest.Mock).mockRejectedValue(new Error('x'))
  const res = await uploadBatch(client, items, 'dir1')
  expect(res.succeeded).toBe(0)
  expect(triggerPouchReplication).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx jest src/share/uploadBatch.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```typescript
// src/share/uploadBatch.ts
import type CozyClient from 'cozy-client'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { uploadSharedFile, SharedItem, UploadedFile } from '@/files/uploadSharedFile'

export interface BatchItemResult {
  item: SharedItem
  ok: boolean
  file?: UploadedFile
  error?: string
}
export interface BatchResult {
  results: BatchItemResult[]
  succeeded: number
  failed: number
}
export type BatchProgress = (done: number, total: number, currentFraction: number) => void

export const uploadBatch = async (
  client: CozyClient,
  items: SharedItem[],
  dirId: string,
  onProgress?: BatchProgress
): Promise<BatchResult> => {
  const results: BatchItemResult[] = []
  let succeeded = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    try {
      const file = await uploadSharedFile(client, item, dirId, frac =>
        onProgress?.(i, items.length, frac)
      )
      results.push({ item, ok: true, file })
      succeeded++
    } catch (e) {
      results.push({ item, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (succeeded > 0) triggerPouchReplication(client, 'io.cozy.files')
  onProgress?.(items.length, items.length, 1)
  return { results, succeeded, failed: results.length - succeeded }
}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx jest src/share/uploadBatch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/share/uploadBatch.ts src/share/uploadBatch.test.ts
git commit -m "feat(share): batch upload orchestrator with partial-failure handling"
```

---

## Task 3 : Modal `/import` (miroir de `move`) + i18n

**Files:**
- Create: `app/import/_layout.tsx`, `app/import/_ImportScreen.tsx`, `app/import/index.tsx`, `app/import/[...path].tsx`, `app/import/_ImportScreen.test.tsx`
- Modify: `app/_layout.tsx` (enregistrer la route), `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`

**Interfaces:**
- Consumes: `uploadBatch` (Task 2) ; `usePendingShare()` (Task 4 — importé ici, implémenté en Task 4 ; en attendant, ce module lit le contexte via un provider fourni par les tests) ; `FolderPicker` (`@/ui/FolderPicker`) ; `ROOT_DIR_ID` (`@/client/queries`).
- Produces: `useImportContext()` → `{ items, isBusy, onConfirm(dest), onCancel }`.

> Note d'ordre : Task 3 importe `usePendingShare` de Task 4. Implémenter Task 4 **avant** l'intégration réelle, ou stubber `usePendingShare` dans le test de Task 3 (fait ci-dessous). Les deux tâches peuvent donc être écrites dans l'ordre 3→4 tant que le test stub le provider.

- [ ] **Step 1: Ajouter les clés i18n** (`src/i18n/locales/en.json`, sous `"drive"`)

```json
"import": {
  "title": "Import to…",
  "confirm": "Import here",
  "uploading": "Importing… {{done}}/{{total}}",
  "successFile": "File imported",
  "successBulk": "{{count}} files imported",
  "partial": "{{succeeded}}/{{total}} imported, {{failed}} failed",
  "errorGeneric": "Import failed",
  "errorOffline": "Connection required to import",
  "errorQuota": "Not enough storage",
  "loginRequired": "Sign in to import"
}
```

Et `src/i18n/locales/fr.json` (sous `"drive"`) :

```json
"import": {
  "title": "Importer dans…",
  "confirm": "Importer ici",
  "uploading": "Import en cours… {{done}}/{{total}}",
  "successFile": "Fichier importé",
  "successBulk": "{{count}} fichiers importés",
  "partial": "{{succeeded}}/{{total}} importés, {{failed}} en échec",
  "errorGeneric": "L'import a échoué",
  "errorOffline": "Connexion requise pour importer",
  "errorQuota": "Stockage insuffisant",
  "loginRequired": "Connectez-vous pour importer"
}
```

- [ ] **Step 2: Écrire le test composant qui échoue**

```tsx
// app/import/_ImportScreen.test.tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

const uploadBatchMock = jest.fn()
jest.mock('@/share/uploadBatch', () => ({ uploadBatch: (...a: unknown[]) => uploadBatchMock(...a) }))
jest.mock('@/share/PendingShareProvider', () => ({
  usePendingShare: () => ({
    items: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }],
    clear: jest.fn()
  })
}))
// FolderPicker is exercised elsewhere; stub it to a confirm button that hands back a folder.
jest.mock('@/ui/FolderPicker', () => {
  const { Button } = require('react-native-paper')
  return {
    FolderPicker: ({ onConfirm, confirmLabel }: any) => (
      <Button onPress={() => onConfirm({ _id: 'dest1', name: 'Docs' })}>{confirmLabel}</Button>
    )
  }
})

import ImportLayout from './_layout'
import { ImportScreen } from './_ImportScreen'

const wrap = () =>
  render(
    <ImportLayout>
      <ImportScreen pathSegments={[]} />
    </ImportLayout>
  )

beforeEach(() => uploadBatchMock.mockReset())

test('confirming a destination uploads the pending items there', async () => {
  uploadBatchMock.mockResolvedValueOnce({ results: [], succeeded: 1, failed: 0 })
  const { getByText } = wrap()
  fireEvent.press(getByText('Import here'))
  await waitFor(() => expect(uploadBatchMock).toHaveBeenCalledTimes(1))
  const [, items, dirId] = uploadBatchMock.mock.calls[0]
  expect(items).toEqual([{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }])
  expect(dirId).toBe('dest1')
})
```

> `ImportLayout` rend un `<Stack>` d'expo-router. Le `jest.setup.ts` du repo mocke déjà expo-router (voir les tests de `move`/`metadata`). Si `Stack`/`useRouter` ne sont pas mockés, ajouter un mock local `jest.mock('expo-router', ...)` calqué sur celui de `app/metadata/[fileId].test.tsx`.

- [ ] **Step 3: Lancer — échoue**

Run: `npx jest app/import/_ImportScreen.test.tsx`
Expected: FAIL — modules `./_layout` / `./_ImportScreen` introuvables.

- [ ] **Step 4: Implémenter `_layout.tsx`** (miroir de `app/move/[ids]/_layout.tsx`)

```tsx
// app/import/_layout.tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { uploadBatch } from '@/share/uploadBatch'
import { usePendingShare } from '@/share/PendingShareProvider'
import { SharedItem } from '@/files/uploadSharedFile'

const SNACKBAR_DISMISS_DELAY_MS = 600

interface ImportContextValue {
  items: SharedItem[]
  isBusy: boolean
  onConfirm: (dest: { _id: string; name: string }) => Promise<void>
  onCancel: () => void
}

const ImportContext = createContext<ImportContextValue | null>(null)
export const useImportContext = (): ImportContextValue => {
  const ctx = useContext(ImportContext)
  if (!ctx) throw new Error('useImportContext must be used inside ImportLayout')
  return ctx
}

export default function ImportLayout({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const { items, clear } = usePendingShare()
  const [isBusy, setIsBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    type MaybeDismiss = { dismiss?: () => void; canDismiss?: () => boolean }
    const r = router as unknown as MaybeDismiss
    if (typeof r.dismiss === 'function' && r.canDismiss?.() !== false) {
      r.dismiss()
      return
    }
    if (router.canGoBack()) router.back()
  }, [router])

  const onConfirm = useCallback(
    async (dest: { _id: string; name: string }): Promise<void> => {
      if (!client || items.length === 0) return
      setIsBusy(true)
      setSnackbar(null)
      try {
        const res = await uploadBatch(client, items, dest._id)
        if (res.failed > 0 && res.succeeded > 0) {
          setSnackbar(
            t('drive.import.partial', {
              succeeded: res.succeeded,
              total: res.results.length,
              failed: res.failed
            })
          )
        } else if (res.failed > 0) {
          setSnackbar(t('drive.import.errorGeneric'))
        } else {
          setSnackbar(
            res.succeeded > 1
              ? t('drive.import.successBulk', { count: res.succeeded })
              : t('drive.import.successFile')
          )
        }
        if (res.succeeded > 0) {
          clear()
          setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
        }
      } catch (e) {
        console.error('[ImportLayout] upload failed', e)
        setSnackbar(t('drive.import.errorGeneric'))
      } finally {
        setIsBusy(false)
      }
    },
    [client, items, t, close, clear]
  )

  const value = useMemo<ImportContextValue>(
    () => ({ items, isBusy, onConfirm, onCancel: close }),
    [items, isBusy, onConfirm, close]
  )

  return (
    <ImportContext.Provider value={value}>
      {children ?? (
        <Stack
          screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}
        />
      )}
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ImportContext.Provider>
  )
}
```

- [ ] **Step 5: Implémenter `_ImportScreen.tsx`** (miroir de `_MoveScreen.tsx`)

```tsx
// app/import/_ImportScreen.tsx
import React, { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { FolderPicker } from '@/ui/FolderPicker'
import { ROOT_DIR_ID } from '@/client/queries'

import { useImportContext } from './_layout'

interface Props {
  pathSegments: string[]
}

export const ImportScreen = ({ pathSegments }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const router = useRouter()
  const ctx = useImportContext()

  const onDrillIn = useCallback(
    (item: { _id: string }) => {
      const segments = [...pathSegments, item._id].filter(Boolean)
      router.push(`/import/${segments.join('/')}`)
    },
    [pathSegments, router]
  )

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back()
  }, [router])

  const currentFolderId =
    pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : ROOT_DIR_ID

  return (
    <FolderPicker
      currentFolderId={currentFolderId}
      excludeIds={new Set<string>()}
      confirmLabel={t('drive.import.confirm')}
      isBusy={ctx.isBusy}
      isAtRoot={pathSegments.length === 0}
      onDrillIn={onDrillIn}
      onBack={onBack}
      onConfirm={ctx.onConfirm}
      onCancel={ctx.onCancel}
    />
  )
}
```

- [ ] **Step 6: Implémenter `index.tsx` et `[...path].tsx`**

```tsx
// app/import/index.tsx
import React from 'react'
import { ImportScreen } from './_ImportScreen'

export default function ImportIndex() {
  return <ImportScreen pathSegments={[]} />
}
```

```tsx
// app/import/[...path].tsx
import React from 'react'
import { useLocalSearchParams } from 'expo-router'

import { ImportScreen } from './_ImportScreen'

export default function ImportDrillScreen() {
  const { path } = useLocalSearchParams<{ path: string | string[] }>()
  const pathSegments = Array.isArray(path) ? path.filter(Boolean) : path ? [path] : []
  return <ImportScreen pathSegments={pathSegments} />
}
```

- [ ] **Step 7: Enregistrer la route modale** dans `app/_layout.tsx` (après le bloc `move/[ids]`, lignes 63-66)

```tsx
<Stack.Screen
  name="import"
  options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
/>
```

- [ ] **Step 8: Lancer — passe**

Run: `npx jest app/import/_ImportScreen.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/import src/i18n/locales/en.json src/i18n/locales/fr.json app/_layout.tsx
git commit -m "feat(share): /import modal reusing FolderPicker + upload batch"
```

---

## Task 4 : Capture JS — types, `useIncomingShare`, texte→fichier, `PendingShareProvider`

**Files:**
- Create: `src/share/textToFile.ts`, `src/share/useIncomingShare.ts`, `src/share/PendingShareProvider.tsx`, `src/share/PendingShareProvider.test.tsx`
- Modify: `package.json` (ajouter `expo-share-intent`)

**Interfaces:**
- Consumes: `useShareIntent` (`expo-share-intent`) ; `useAuth` (`@/auth/useAuth`) ; `useRouter` (`expo-router`) ; `SharedItem` (Task 1).
- Produces: `usePendingShare()` → `{ items: SharedItem[]; clear: () => void }` ; `PendingShareProvider` ; `useIncomingShare()` → `{ items: SharedItem[]; text?: string; hasShare: boolean; reset: () => void }`.

- [ ] **Step 1: Installer la dépendance**

```bash
npx expo install expo-share-intent
```
Expected: `expo-share-intent` ajouté à `package.json`.

- [ ] **Step 2: Écrire le test qui échoue** (logique de reprise après login)

```tsx
// src/share/PendingShareProvider.test.tsx
import React from 'react'
import { Text } from 'react-native'
import { render, waitFor } from '@testing-library/react-native'

const pushMock = jest.fn()
const shareState = { items: [] as unknown[], text: undefined as string | undefined, hasShare: false, reset: jest.fn() }
const authState = { client: null as unknown }

jest.mock('expo-router', () => ({ useRouter: () => ({ push: pushMock }) }))
jest.mock('@/auth/useAuth', () => ({ useAuth: () => authState }))
jest.mock('@/share/useIncomingShare', () => ({ useIncomingShare: () => shareState }))

import { PendingShareProvider, usePendingShare } from './PendingShareProvider'

const Probe = () => {
  const { items } = usePendingShare()
  return <Text>count:{items.length}</Text>
}

beforeEach(() => {
  pushMock.mockReset()
  shareState.items = []
  shareState.text = undefined
  shareState.hasShare = false
  authState.client = null
})

test('does not navigate while unauthenticated, then navigates after login', async () => {
  shareState.items = [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]
  shareState.hasShare = true
  const { rerender, getByText } = render(<PendingShareProvider><Probe /></PendingShareProvider>)
  await waitFor(() => expect(getByText('count:1')).toBeTruthy())
  expect(pushMock).not.toHaveBeenCalled() // no client yet

  authState.client = {} // "login" happened
  rerender(<PendingShareProvider><Probe /></PendingShareProvider>)
  await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/import'))
})
```

- [ ] **Step 3: Lancer — échoue**

Run: `npx jest src/share/PendingShareProvider.test.tsx`
Expected: FAIL — module introuvable.

- [ ] **Step 4: Implémenter `useIncomingShare.ts`**

```typescript
// src/share/useIncomingShare.ts
import { useShareIntent } from 'expo-share-intent'
import type { SharedItem } from '@/files/uploadSharedFile'

export interface IncomingShare {
  items: SharedItem[]
  text?: string
  hasShare: boolean
  reset: () => void
}

interface RawFile {
  path?: string
  fileName?: string
  mimeType?: string
  size?: number
}

const normalizeUri = (path: string): string =>
  path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`

const toItems = (files: unknown): SharedItem[] => {
  if (!Array.isArray(files)) return []
  return (files as RawFile[]).map(f => ({
    uri: normalizeUri(f.path ?? ''),
    name: f.fileName ?? 'shared',
    mimeType: f.mimeType ?? 'application/octet-stream',
    size: f.size
  }))
}

export const useIncomingShare = (): IncomingShare => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const si = shareIntent as { files?: unknown; text?: string; webUrl?: string } | null
  const text = si?.text ?? si?.webUrl ?? undefined
  return {
    items: toItems(si?.files),
    text,
    hasShare: !!hasShareIntent,
    reset: resetShareIntent
  }
}
```

- [ ] **Step 5: Implémenter `textToFile.ts`**

```typescript
// src/share/textToFile.ts
import * as FileSystem from 'expo-file-system/legacy'
import type { SharedItem } from '@/files/uploadSharedFile'

// Persist a shared text/URL as a .txt file in cache so the upload pipeline can
// stream it like any other file. The name collides deterministically on
// "shared.txt"; uploadSharedFile's 409 dedupe assigns a unique server name.
export const textToSharedItem = async (text: string): Promise<SharedItem> => {
  const dir = FileSystem.cacheDirectory
  if (!dir) throw new Error('Cache directory unavailable')
  await FileSystem.makeDirectoryAsync(`${dir}twake-share/`, { intermediates: true })
  const path = `${dir}twake-share/shared.txt`
  await FileSystem.writeAsStringAsync(path, text)
  return { uri: path, name: 'shared.txt', mimeType: 'text/plain', size: text.length }
}
```

- [ ] **Step 6: Implémenter `PendingShareProvider.tsx`**

```tsx
// src/share/PendingShareProvider.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'

import { useAuth } from '@/auth/useAuth'
import { useIncomingShare } from '@/share/useIncomingShare'
import { textToSharedItem } from '@/share/textToFile'
import type { SharedItem } from '@/files/uploadSharedFile'

interface PendingShareValue {
  items: SharedItem[]
  clear: () => void
}
const PendingShareContext = createContext<PendingShareValue>({ items: [], clear: () => undefined })
export const usePendingShare = (): PendingShareValue => useContext(PendingShareContext)

export const PendingShareProvider = ({ children }: { children: React.ReactNode }) => {
  const { items: fileItems, text, hasShare, reset } = useIncomingShare()
  const { client } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState<SharedItem[]>([])

  // Stage the incoming OS share into the pending list. Convert a shared
  // text/URL into a .txt file so it flows through the same upload path.
  useEffect(() => {
    if (!hasShare) return
    let cancelled = false
    void (async () => {
      const extra = text ? [await textToSharedItem(text)] : []
      if (cancelled) return
      const all = [...fileItems, ...extra]
      if (all.length > 0) setPending(all)
      reset()
    })()
    return () => {
      cancelled = true
    }
  }, [hasShare, fileItems, text, reset])

  // Open the picker once we have pending items AND an authenticated client.
  // While unauthenticated the items wait here; this effect re-runs when the
  // client becomes available (after login) and navigates then.
  useEffect(() => {
    if (pending.length === 0 || !client) return
    router.push('/import')
  }, [pending, client, router])

  const clear = useCallback(() => setPending([]), [])
  return (
    <PendingShareContext.Provider value={{ items: pending, clear }}>
      {children}
    </PendingShareContext.Provider>
  )
}
```

- [ ] **Step 7: Lancer — passe**

Run: `npx jest src/share/PendingShareProvider.test.tsx`
Expected: PASS.

- [ ] **Step 8: Monter les providers** dans `app/_layout.tsx`

Ajouter les imports :
```tsx
import { ShareIntentProvider } from 'expo-share-intent'
import { PendingShareProvider } from '@/share/PendingShareProvider'
```
Envelopper le contenu : `ShareIntentProvider` au-dessus de tout le tree, et `PendingShareProvider` **à l'intérieur** de `CozyProvider`/`AuthProvider` (il utilise `useAuth`) et au-dessus du `<Stack>`. Concrètement, dans `InnerLayout`, envelopper le `<ErrorBoundary>…</ErrorBoundary>` par `<PendingShareProvider>`, et dans `RootLayout` envelopper `<AuthProvider>` par `<ShareIntentProvider>`:

```tsx
export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <AuthProvider>
        <InnerLayout />
      </AuthProvider>
    </ShareIntentProvider>
  )
}
```
Et dans `InnerLayout`, autour du `<ErrorBoundary>` :
```tsx
<PendingShareProvider>
  <ErrorBoundary>
    <Stack screenOptions={{ headerShown: false }}>
      {/* … routes … */}
    </Stack>
  </ErrorBoundary>
</PendingShareProvider>
```

- [ ] **Step 9: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/share/useIncomingShare.ts src/share/textToFile.ts src/share/PendingShareProvider.tsx src/share/PendingShareProvider.test.tsx app/_layout.tsx package.json package-lock.json
git commit -m "feat(share): incoming-share capture + auth-gated pending handoff"
```

---

## Task 5 : Capture Android (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`)

**Files:**
- Modify: `app.json` (config du plugin `expo-share-intent`), puis prebuild.

> **Précondition :** scaffold config-plugin FileProvider présent (le prebuild doit passer). Android est faiblement couplé, mais le **même** bloc de plugin `expo-share-intent` sert iOS + Android — on le configure ici et on le complète en Task 6.

- [ ] **Step 1: Ajouter le plugin** dans `app.json` → `expo.plugins`

```json
[
  "expo-share-intent",
  {
    "androidIntentFilters": ["image/*", "video/*", "application/*", "text/*", "*/*"],
    "androidMainActivityAttributes": { "android:launchMode": "singleTask" },
    "iosActivationRules": {
      "NSExtensionActivationSupportsImageWithMaxCount": 10,
      "NSExtensionActivationSupportsMovieWithMaxCount": 10,
      "NSExtensionActivationSupportsFileWithMaxCount": 10,
      "NSExtensionActivationSupportsText": true,
      "NSExtensionActivationSupportsWebURLWithMaxCount": 1
    },
    "iosAppGroupIdentifier": "group.com.linagora.twakedrive",
    "iosShareExtensionName": "Twake Drive"
  }
]
```

- [ ] **Step 2: Prebuild Android**

Run: `npx expo prebuild -p android`
Expected: succès ; `android/app/src/main/AndroidManifest.xml` contient désormais un `<intent-filter>` `android.intent.action.SEND` / `SEND_MULTIPLE` sur l'activité de partage, **sans** régression sur le `<provider>` FileProvider ni sur les deep-links `cozy`/`twakedrive`.

- [ ] **Step 3: Vérifier le manifest** (revue manuelle)

Run: `npx expo prebuild -p android` puis ouvrir `android/app/src/main/AndroidManifest.xml`.
Vérifier : les deep-links existants (`cozy`, `twakedrive`) + le `playbackService` + le `<provider>` FileProvider sont toujours présents ; un intent-filter `SEND`/`SEND_MULTIPLE` a été ajouté ; `applicationId` = `com.linagora.twakedrive`.

- [ ] **Step 4: Test device Android** (manuel)

Build + run : `npx expo run:android`. Depuis la Galerie → Partager → **Twake Drive** → l'app s'ouvre sur `/import`. Choisir un dossier → **Importer ici** → le fichier apparaît après réplication. Tester aussi le partage multi-photos (`ACTION_SEND_MULTIPLE`).

- [ ] **Step 5: Commit**

```bash
git add app.json android
git commit -m "feat(share): Android ACTION_SEND capture via expo-share-intent"
```

---

## Task 6 : Capture iOS (Share Extension + App Group)

**Files:**
- Modify: (plugin déjà configuré en Task 5), prebuild iOS + vérif entitlements.

> **Précondition (bloquante) :** App Group `group.com.linagora.twakedrive` présent dans `ios/TwakeDrive/TwakeDrive.entitlements` (posé par FileProvider). Le plugin `expo-share-intent` **réutilise** ce même App Group id (déjà mis en Task 5).

- [ ] **Step 1: Prebuild iOS**

Run: `npx expo prebuild -p ios`
Expected: succès ; une **nouvelle cible** Share Extension (`.appex`) apparaît dans `ios/TwakeDrive.xcodeproj/project.pbxproj` ; l'entitlement App Group est présent **sur la cible principale ET sur la cible extension**, avec la **même** valeur `group.com.linagora.twakedrive` que FileProvider.

- [ ] **Step 2: Vérifier la coexistence avec FileProvider** (revue manuelle — checkpoint clé)

Ouvrir `ios/TwakeDrive.xcodeproj/project.pbxproj` et les `*.entitlements`.
Vérifier :
- Cibles présentes : app principale + **FileProvider extension** + **Share extension** (aucune écrasée).
- `com.apple.security.application-groups` = `group.com.linagora.twakedrive` (identique partout, pas de doublon divergent).
- `CFBundleIdentifier` de la Share extension = `com.linagora.twakedrive.<suffixe>` (suffixe distinct de celui de FileProvider).

> Si le prebuild d'un plugin écrase la cible de l'autre, harmoniser via l'ordre des plugins dans `app.json` et re-prebuild `--clean`. C'est **le** point de friction anticipé du couplage iOS.

- [ ] **Step 3: Pods + build**

Run: `cd ios && pod install && cd .. && npx expo run:ios`
Expected: build OK, app + extension signées.

- [ ] **Step 4: Test device iOS** (manuel)

Depuis Photos → Partager → **Twake Drive** → l'app s'ouvre sur `/import`. Choisir un dossier → **Importer ici**. Tester : Fichiers.app (PDF/doc), Safari (URL → `.txt`), multi-sélection Photos, gros fichier vidéo (pas d'OOM grâce au streaming).

- [ ] **Step 5: Commit**

```bash
git add app.json ios
git commit -m "feat(share): iOS Share Extension on shared App Group foundation"
```

---

## Task 7 : Polish — progression, cleanup, états d'erreur, hors-ligne

**Files:**
- Modify: `app/import/_layout.tsx` (progression + mapping erreurs hors-ligne/quota), `src/share/uploadBatch.ts` (cleanup des fichiers stagés).
- Test: étendre `src/share/uploadBatch.test.ts`.

**Interfaces:**
- Consumes: `@react-native-community/netinfo` (déjà dépendance) pour l'état réseau.

- [ ] **Step 1: Test cleanup qui échoue** (les fichiers stagés en cache sont supprimés après upload)

```typescript
// src/share/uploadBatch.test.ts (ajouter)
import * as FileSystem from 'expo-file-system/legacy'
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn().mockResolvedValue(undefined) }))

test('deletes each staged cache file after the batch (success or failure)', async () => {
  ;(uploadSharedFile as jest.Mock).mockResolvedValue({ _id: 'a', name: 'a.jpg' })
  await uploadBatch(client, items, 'dir1')
  expect((FileSystem.deleteAsync as jest.Mock)).toHaveBeenCalledWith('file:///a.jpg', { idempotent: true })
  expect((FileSystem.deleteAsync as jest.Mock)).toHaveBeenCalledWith('file:///b.jpg', { idempotent: true })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx jest src/share/uploadBatch.test.ts`
Expected: FAIL (cleanup pas encore implémenté).

- [ ] **Step 3: Implémenter le cleanup** dans `uploadBatch.ts`

Ajouter en tête : `import * as FileSystem from 'expo-file-system/legacy'`
Puis, dans la boucle `for`, après le `try/catch`, ajouter :
```typescript
    // Free the staged copy the capture layer wrote to cache (idempotent: the
    // extension may have staged into the App Group container instead).
    try {
      await FileSystem.deleteAsync(item.uri, { idempotent: true })
    } catch {
      /* best-effort cleanup */
    }
```

- [ ] **Step 4: Lancer — passe**

Run: `npx jest src/share/uploadBatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Progression + erreurs réseau dans `_layout.tsx`**

Dans `onConfirm`, passer un `onProgress` à `uploadBatch` qui met à jour un state `progress` affiché via le `Snackbar` (`t('drive.import.uploading', { done, total })`), et **avant** l'upload, vérifier `NetInfo` :
```tsx
import NetInfo from '@react-native-community/netinfo'
// …au début de onConfirm, avant setIsBusy(true):
const net = await NetInfo.fetch()
if (!net.isConnected) { setSnackbar(t('drive.import.errorOffline')); return }
```
Et mapper l'erreur quota : si un message d'échec contient `HTTP 413` ou `HTTP 507`, afficher `t('drive.import.errorQuota')` au lieu de `errorGeneric`.

- [ ] **Step 6: Typecheck + full test run + commit**

```bash
npx tsc --noEmit && npx jest
git add app/import/_layout.tsx src/share/uploadBatch.ts src/share/uploadBatch.test.ts
git commit -m "feat(share): progress UI, offline/quota errors, staged-file cleanup"
```

---

## Task 8 : Matrice de tests manuels + PR

**Files:** aucun (validation + PR).

- [ ] **Step 1: Lint + typecheck + tests**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tout vert.

- [ ] **Step 2: Matrice manuelle** (cocher chaque cellule sur device réel)

| Scénario | iOS | Android |
|---|---|---|
| 1 image (Photos/Galerie) | ☐ | ☐ |
| N images (multi) | ☐ | ☐ |
| PDF / doc (Fichiers) | ☐ | ☐ |
| URL / texte (navigateur) → `.txt` | ☐ | ☐ |
| Gros fichier vidéo (pas d'OOM) | ☐ | ☐ |
| Non authentifié → login → reprise auto vers `/import` | ☐ | ☐ |
| Hors-ligne → message « connexion requise » | ☐ | ☐ |
| Conflit de nom → dédup `(1)` | ☐ | ☐ |
| Annulation du picker → rien uploadé, cache nettoyé | ☐ | ☐ |
| Création de dossier puis import dedans | ☐ | ☐ |

- [ ] **Step 3: Ouvrir la PR dédiée**

```bash
git push -u fork HEAD
gh pr create --base feat/android-support --title "feat(share): Share to Twake Drive (iOS + Android)" \
  --body "Implements docs/superpowers/specs/2026-07-02-share-to-drive-design.md. Built on top of the FileProvider App Group / config-plugin foundation. Manual test matrix in the plan."
```

> Base `feat/android-support` à ajuster si FileProvider a mergé ailleurs. Push sur `fork` (cf. mémoire projet), pas `origin`.

---

## Notes de séquencement inter-tâches

- **Tasks 1–4** : pur JS/TS, testables sans natif → réalisables dès l'ouverture du worktree.
- **Tasks 5–6** : natif, **bloquées** sur la fondation FileProvider (App Group + scaffold config-plugin + entitlements). Task 6 est le checkpoint de coexistence pbxproj.
- **Tasks 7–8** : polish + validation, après capture fonctionnelle.
