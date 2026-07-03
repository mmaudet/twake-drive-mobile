# Recherche de fichiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une recherche globale de fichiers/dossiers par nom, hors-ligne, dans l'app mobile Twake Drive.

**Architecture:** Une requête Mango `$regex` sur `io.cozy.files`, servie depuis PouchDB local par `PouchLink` (réplication complète du doctype), affichée dans un écran dédié ouvert par une loupe dans l'en-tête du navigateur de fichiers. Miroir de `buildDriveQuery` et de la plomberie de l'écran de fichiers existant.

**Tech Stack:** React Native 0.81 + Expo ~54, TypeScript, expo-router, cozy-client + cozy-pouch-link (PouchDB/SQLite), react-native-paper 5.15.1, jest + @testing-library/react-native 12.9.

**Spec:** `docs/superpowers/specs/2026-07-02-web-search-design.md`

## Global Constraints

- **Branche/worktree :** `feat/web-search` → `twake-drive-mobile-search`. **Prérequis baseline vert** : la PR de nettoyage #5 (`fix/jest-test-baseline`) doit être présente — soit `main` l'a mergée puis rebase, soit empiler cette branche sur `fix/jest-test-baseline` — sinon `npm test` démarre rouge (9 échecs pré-existants). Vérifier `npm test` vert **avant** la Task 1.
- **Offline-first :** `io.cozy.files` est entièrement répliqué localement ; `PouchLink` sert les requêtes `where` depuis PouchDB. La recherche est donc locale + hors-ligne, aucun code réseau.
- **Matching :** sous-chaîne « contient », **insensible à la casse**. La saisie utilisateur **doit être échappée** (métacaractères regex). `buildSearchRegex` renvoie un **objet `RegExp` avec le flag `i`** — `pouchdb-selector-core` fait `new RegExp(userValue)`, qui préserve les flags d'un `RegExp` (une string `(?i)…` planterait en JS).
- **Réglages (verbatim) :** anti-rebond **300 ms**, minimum **2 caractères**, `limitBy(50)`.
- **i18n :** nouvelles clés sous **`drive.search.*`** dans `src/i18n/locales/fr.json` **et** `en.json`.
- **Route :** écran de 1er niveau **`app/search.tsx`** (⚠️ **pas** `app/(drive)/search.tsx` : `(drive)` est un `Tabs`, ça créerait un onglet), enregistré dans `app/_layout.tsx`, ouvert par `router.push('/search')`.
- **Sécurité :** aucun nouveau scope OAuth (lecture `io.cozy.files` déjà accordée).
- **Tests :** aucune régression — chaque task garde `npm test` vert. Un test unitaire par nouveau module.

---

### Task 1: `buildSearchRegex` — construction sûre de la regex de recherche

**Files:**
- Create: `src/search/buildSearchRegex.ts`
- Test: `src/search/buildSearchRegex.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `buildSearchRegex(term: string): RegExp` — regex insensible à la casse, métacaractères de `term` échappés (correspondance littérale « contient »).

- [ ] **Step 1: Écrire le test qui échoue**

Create `src/search/buildSearchRegex.test.ts`:
```ts
import { buildSearchRegex } from './buildSearchRegex'

describe('buildSearchRegex', () => {
  it('matche en insensible à la casse', () => {
    expect(buildSearchRegex('report').test('Q3 REPORT.pdf')).toBe(true)
    expect(buildSearchRegex('REPORT').test('q3 report.pdf')).toBe(true)
  })

  it('échappe les métacaractères regex (correspondance littérale)', () => {
    expect(buildSearchRegex('a.b').test('axb')).toBe(false)
    expect(buildSearchRegex('a.b').test('xx a.b yy')).toBe(true)
    expect(buildSearchRegex('(a+)+').test('literal (a+)+ text')).toBe(true)
  })

  it('renvoie un RegExp portant le flag i', () => {
    const re = buildSearchRegex('x')
    expect(re).toBeInstanceOf(RegExp)
    expect(re.flags).toContain('i')
  })

  it('trim la saisie', () => {
    expect(buildSearchRegex('  hi  ').source).toBe('hi')
  })
})
```

- [ ] **Step 2: Lancer le test — vérifier l'échec**

Run: `CI=true npx jest src/search/buildSearchRegex.test.ts`
Expected: FAIL — « Cannot find module './buildSearchRegex' ».

- [ ] **Step 3: Implémenter le minimum**

Create `src/search/buildSearchRegex.ts`:
```ts
// Escape every regex metacharacter so user input matches literally.
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a case-insensitive "contains" matcher for a search term.
 *
 * Returns a RegExp (NOT a pattern string): pouchdb-selector-core evaluates
 * `$regex` via `new RegExp(userValue)`, which preserves the flags of a RegExp
 * argument — a `(?i)` inline-flag string would throw in JS. sift (cozy-client's
 * in-memory evaluator) accepts a RegExp too.
 */
export const buildSearchRegex = (term: string): RegExp => new RegExp(escapeRegExp(term.trim()), 'i')
```

- [ ] **Step 4: Lancer le test — vérifier le succès**

Run: `CI=true npx jest src/search/buildSearchRegex.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/buildSearchRegex.ts src/search/buildSearchRegex.test.ts
git commit -m "feat(search): add buildSearchRegex (escaped, case-insensitive)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `useDebouncedValue` — anti-rebond de la saisie

**Files:**
- Create: `src/search/useDebouncedValue.ts`
- Test: `src/search/useDebouncedValue.test.tsx`

**Interfaces:**
- Consumes: —
- Produces: `useDebouncedValue<T>(value: T, delayMs: number): T` — renvoie `value` après `delayMs` sans changement ; réinitialise le minuteur à chaque changement.

- [ ] **Step 1: Écrire le test qui échoue**

Create `src/search/useDebouncedValue.test.tsx`:
```tsx
import React from 'react'
import { Text } from 'react-native'
import { render, screen, act } from '@testing-library/react-native'
import { useDebouncedValue } from './useDebouncedValue'

jest.useFakeTimers()

const Probe = ({ value }: { value: string }) => {
  const debounced = useDebouncedValue(value, 300)
  return <Text testID="out">{debounced}</Text>
}

describe('useDebouncedValue', () => {
  it('renvoie la valeur initiale immédiatement', () => {
    render(<Probe value="apple" />)
    expect(screen.getByTestId('out')).toHaveTextContent('apple')
  })

  it('ne met à jour qu\'après le délai', () => {
    const { rerender } = render(<Probe value="apple" />)
    rerender(<Probe value="banana" />)
    expect(screen.getByTestId('out')).toHaveTextContent('apple')
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(screen.getByTestId('out')).toHaveTextContent('banana')
  })
})
```

- [ ] **Step 2: Lancer le test — vérifier l'échec**

Run: `CI=true npx jest src/search/useDebouncedValue.test.tsx`
Expected: FAIL — « Cannot find module './useDebouncedValue' ».

- [ ] **Step 3: Implémenter le minimum**

Create `src/search/useDebouncedValue.ts`:
```ts
import { useEffect, useState } from 'react'

/** Returns `value` after it has stayed unchanged for `delayMs`. */
export const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
```

- [ ] **Step 4: Lancer le test — vérifier le succès**

Run: `CI=true npx jest src/search/useDebouncedValue.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/useDebouncedValue.ts src/search/useDebouncedValue.test.tsx
git commit -m "feat(search): add useDebouncedValue hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `searchFilesQuery` — requête Mango de recherche

**Files:**
- Modify: `src/client/queries.ts` (ajout en fin de fichier ; imports en tête)
- Test: `src/client/searchFilesQuery.test.ts`

**Interfaces:**
- Consumes: `buildSearchRegex` (Task 1) ; `Q, QueryDefinition` (cozy-client, déjà importés `queries.ts:1`) ; `HIDDEN_ROOT_DIR_IDS` (`queries.ts:15`).
- Produces:
  - `searchFilesQuery(term: string): QueryDefinition`
  - `searchFilesQueryAs(term: string): string`

- [ ] **Step 1: Écrire le test qui échoue**

Create `src/client/searchFilesQuery.test.ts`:
```ts
// queries.ts imports the real cozy-client `Q`, whose module entry eagerly
// requires RN native modules absent under jest (inappbrowser, ios11-devicecheck…).
// Mock cozy-client with a recording chainable so we assert the query is BUILT
// correctly, without importing the real client.
const mockCalls: Record<string, unknown> = {}
jest.mock('cozy-client', () => {
  const mkChain = () => {
    const qd = {
      where: (s: unknown) => {
        mockCalls.where = s
        return qd
      },
      partialIndex: (p: unknown) => {
        mockCalls.partialIndex = p
        return qd
      },
      indexFields: (f: unknown) => {
        mockCalls.indexFields = f
        return qd
      },
      sortBy: (s: unknown) => {
        mockCalls.sort = s
        return qd
      },
      limitBy: (n: unknown) => {
        mockCalls.limit = n
        return qd
      }
    }
    return qd
  }
  return {
    Q: (doctype: string) => {
      mockCalls.doctype = doctype
      return mkChain()
    }
  }
})

import { searchFilesQuery, searchFilesQueryAs, HIDDEN_ROOT_DIR_IDS } from './queries'

describe('searchFilesQuery', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockCalls)) delete mockCalls[k]
  })

  it('construit un $regex insensible à la casse sur name, hors corbeille', () => {
    searchFilesQuery('report')
    const sel = mockCalls.where as { name: { $regex: RegExp }; trashed: unknown }
    expect(mockCalls.doctype).toBe('io.cozy.files')
    expect(sel.name.$regex).toBeInstanceOf(RegExp)
    expect(sel.name.$regex.flags).toContain('i')
    expect(sel.name.$regex.test('Q3 REPORT.pdf')).toBe(true)
    expect(sel.trashed).toEqual({ $ne: true })
    expect(mockCalls.partialIndex).toEqual({ _id: { $nin: HIDDEN_ROOT_DIR_IDS } })
    expect(mockCalls.indexFields).toEqual(['name'])
    expect(mockCalls.sort).toEqual([{ name: 'asc' }])
    expect(mockCalls.limit).toBe(50)
  })

  it('échappe les métacaractères de la saisie', () => {
    searchFilesQuery('a.b')
    const sel = mockCalls.where as { name: { $regex: RegExp } }
    expect(sel.name.$regex.test('axb')).toBe(false)
    expect(sel.name.$regex.test('a.b')).toBe(true)
  })

  it('namespace la clé de cache par terme', () => {
    expect(searchFilesQueryAs('report')).toBe('io.cozy.files/search/report')
  })
})
```

- [ ] **Step 2: Lancer le test — vérifier l'échec**

Run: `CI=true npx jest src/client/searchFilesQuery.test.ts`
Expected: FAIL — `searchFilesQuery is not a function` (export absent).

- [ ] **Step 3: Ajouter l'import de `buildSearchRegex` en tête de `src/client/queries.ts`**

Après la ligne `import { Q, QueryDefinition } from 'cozy-client'` (ligne 1), ajouter :
```ts
import { buildSearchRegex } from '@/search/buildSearchRegex'
```

- [ ] **Step 4: Ajouter les fonctions en fin de `src/client/queries.ts`**

```ts
// Global filename search. Mirrors buildDriveQuery but scans by name across the
// whole (locally-replicated) io.cozy.files doctype. Served from PouchDB by
// PouchLink → global + offline. $regex is an in-memory scan (see spec §7), so
// keep it debounced + limited on the caller side.
export const searchFilesQuery = (term: string): QueryDefinition =>
  Q('io.cozy.files')
    .where({ name: { $regex: buildSearchRegex(term) }, trashed: { $ne: true } })
    .partialIndex({ _id: { $nin: HIDDEN_ROOT_DIR_IDS } })
    .indexFields(['name'])
    .sortBy([{ name: 'asc' }])
    .limitBy(50)

export const searchFilesQueryAs = (term: string): string => `io.cozy.files/search/${term}`
```

- [ ] **Step 5: Lancer le test — vérifier le succès**

Run: `CI=true npx jest src/client/searchFilesQuery.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/client/queries.ts src/client/searchFilesQuery.test.ts
git commit -m "feat(search): add searchFilesQuery / searchFilesQueryAs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Préchauffer l'index `name` (perf du premier scan)

**Files:**
- Modify: `src/pouchdb/getLinks.ts` (ajout d'une entrée à `filesIndexWarmupQueries`)

**Interfaces:**
- Consumes: pattern `filesIndexWarmupQueries` existant (`getLinks.ts`).
- Produces: un warmup `io.cozy.files/warmup/search` qui pré-bâtit l'index `['name']` avant le premier search.

> Note : `getLinks.test.ts` (corrigé par la PR #5) asserte les options via `toMatchObject({ strategy: 'fromRemote' })` et ne compte pas les warmups → aucun changement de test requis. Vérifier tout de même que `getLinks.test.ts` reste vert.

- [ ] **Step 1: Ajouter l'entrée de warmup**

Dans `src/pouchdb/getLinks.ts`, à la fin du tableau `const filesIndexWarmupQueries: unknown[] = [ … ]` (après l'entrée « Folder listing »), ajouter :
```ts
  ,
  // Search view (sort by name) — pre-builds the `name` index searchFilesQuery uses.
  {
    definition: () =>
      Q('io.cozy.files')
        .where({ name: { $gt: null } })
        .indexFields(['name'])
        .sortBy([{ name: 'asc' }])
        .limitBy(1),
    options: { as: 'io.cozy.files/warmup/search' }
  }
```

- [ ] **Step 2: Lancer les tests pouchdb — vérifier qu'ils restent verts**

Run: `CI=true npx jest src/pouchdb/getLinks.test.ts`
Expected: PASS (aucune régression).

- [ ] **Step 3: Commit**

```bash
git add src/pouchdb/getLinks.ts
git commit -m "perf(search): warm up the name index for filename search

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Écran de recherche + route + i18n

**Files:**
- Create: `app/search.tsx`
- Modify: `app/_layout.tsx` (enregistrer la route `search`)
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json` (clés `drive.search.*`)
- Test: `app/search.test.tsx`

**Interfaces:**
- Consumes: `searchFilesQuery`, `searchFilesQueryAs`, `FileQueryResult` (Task 3) ; `useDebouncedValue` (Task 2) ; `openFileFromList` (`@/files/openFromList`) ; `FileRow`/`FolderRow`, `LoadingState`/`EmptyState`/`ErrorState`, `ScreenContainer`, `getErrorMessageKey`.
- Produces: route `/search` (default export `SearchScreen`).

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/locales/fr.json`, à l'intérieur de l'objet `"drive"`, ajouter :
```json
"search": {
  "placeholder": "Rechercher dans le Drive",
  "hint": "Tapez au moins 2 caractères",
  "empty": "Aucun fichier trouvé",
  "action": "Rechercher"
},
```
Dans `src/i18n/locales/en.json`, à l'intérieur de l'objet `"drive"`, ajouter :
```json
"search": {
  "placeholder": "Search in Drive",
  "hint": "Type at least 2 characters",
  "empty": "No file found",
  "action": "Search"
},
```

- [ ] **Step 2: Écrire le test qui échoue**

Create `app/search.test.tsx`:
```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack })
}))

const mockUseQuery = jest.fn()
jest.mock('cozy-client', () => ({
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args)
}))

// Isolate the screen from the debounce timing (tested in Task 2).
jest.mock('@/search/useDebouncedValue', () => ({
  useDebouncedValue: (v: string) => v
}))

const mockOpen = jest.fn().mockResolvedValue(undefined)
jest.mock('@/files/openFromList', () => ({
  openFileFromList: (...args: unknown[]) => mockOpen(...args)
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

// Query internals are covered in Task 3 — stub them so this test never touches
// the real cozy-client Q() builder (which would be undefined under the mock above).
jest.mock('@/client/queries', () => ({
  searchFilesQuery: (term: string) => ({ term }),
  searchFilesQueryAs: (term: string) => `as:${term}`
}))

// Render rows as minimal pressable text so assertions target the screen's logic.
jest.mock('@/ui/FileRow', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    FileRow: (props: { file: { name: string }; onPress: (f: { name: string }) => void }) =>
      React.createElement(Text, { onPress: () => props.onPress(props.file) }, props.file.name)
  }
})
jest.mock('@/ui/FolderRow', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    FolderRow: (props: { folder: { name: string; _id: string }; onPress: (f: { _id: string }) => void }) =>
      React.createElement(Text, { onPress: () => props.onPress(props.folder) }, props.folder.name)
  }
})

import SearchScreen from './search'

const setQuery = (over: Record<string, unknown> = {}): void => {
  mockUseQuery.mockReturnValue({
    data: [],
    fetchStatus: 'idle',
    lastError: null,
    fetch: jest.fn(),
    ...over
  })
}

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setQuery()
  })

  it('affiche l\'invite tant que < 2 caractères', () => {
    render(<SearchScreen />)
    expect(screen.getByText('drive.search.hint')).toBeTruthy()
    // requête désactivée
    expect(mockUseQuery.mock.calls[0][1]).toMatchObject({ enabled: false })
  })

  it('active la requête et affiche les résultats à partir de 2 caractères', () => {
    setQuery({ data: [{ _id: 'f1', name: 'report.pdf', type: 'file', size: 10 }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.getByText('report.pdf')).toBeTruthy()
  })

  it('ouvre un fichier au tap', () => {
    setQuery({ data: [{ _id: 'f1', name: 'report.pdf', type: 'file', size: 10 }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    fireEvent.press(screen.getByText('report.pdf'))
    expect(mockOpen).toHaveBeenCalled()
  })

  it('navigue dans un dossier au tap', () => {
    setQuery({ data: [{ _id: 'd1', name: 'Docs', type: 'directory' }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 'do')
    fireEvent.press(screen.getByText('Docs'))
    expect(mockPush).toHaveBeenCalledWith('/(drive)/files/d1')
  })
})
```

- [ ] **Step 3: Lancer le test — vérifier l'échec**

Run: `CI=true npx jest app/search.test.tsx`
Expected: FAIL — « Cannot find module './search' ».

- [ ] **Step 4: Créer l'écran `app/search.tsx`**

```tsx
import React, { useState } from 'react'
import { FlatList } from 'react-native'
import { Searchbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { openFileFromList } from '@/files/openFromList'
import { useDebouncedValue } from '@/search/useDebouncedValue'
import { searchFilesQuery, searchFilesQueryAs, FileQueryResult } from '@/client/queries'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

export default function SearchScreen() {
  const router = useRouter()
  const client = useClient()
  const { t } = useTranslation()
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term.trim(), DEBOUNCE_MS)
  const enabled = debounced.length >= MIN_CHARS

  const query = useQuery(searchFilesQuery(debounced), {
    as: searchFilesQueryAs(debounced),
    enabled
  })
  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return <FolderRow folder={item} onPress={folder => router.push(`/(drive)/files/${folder._id}`)} />
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(() => undefined)
        }}
      />
    )
  }

  return (
    <ScreenContainer>
      <Searchbar
        placeholder={t('drive.search.placeholder')}
        value={term}
        onChangeText={setTerm}
        icon="arrow-left"
        onIconPress={() => router.back()}
        autoFocus
      />
      {!enabled ? (
        <EmptyState message={t('drive.search.hint')} />
      ) : query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState message={t(getErrorMessageKey(query.lastError))} onRetry={() => void query.fetch()} />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.search.empty')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </ScreenContainer>
  )
}
```

- [ ] **Step 5: Enregistrer la route dans `app/_layout.tsx`**

Dans le `<Stack>` de `app/_layout.tsx`, après `<Stack.Screen name="docs/new/[folderId]" … />`, ajouter :
```tsx
                    <Stack.Screen name="search" options={{ animation: 'slide_from_bottom' }} />
```
(Plein écran poussé au-dessus des onglets — pas de `presentation: 'pageSheet'` pour laisser la place au clavier + à la liste.)

- [ ] **Step 6: Lancer le test — vérifier le succès**

Run: `CI=true npx jest app/search.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add app/search.tsx app/search.test.tsx app/_layout.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(search): dedicated search screen + route + i18n

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Point d'entrée — loupe dans l'AppBar, câblée au navigateur de fichiers

**Files:**
- Modify: `src/ui/AppBar.tsx` (prop optionnelle `onSearch` + action loupe)
- Modify: `app/(drive)/files/[...path].tsx` (passer `onSearch` à l'`AppBar`)
- Test: `src/ui/AppBar.test.tsx`

**Interfaces:**
- Consumes: `AppBar` (props existantes) ; route `/search` (Task 5).
- Produces: prop `AppBar.onSearch?: () => void` → rend une `Appbar.Action` loupe (hors mode sélection).

- [ ] **Step 1: Écrire le test qui échoue**

Create `src/ui/AppBar.test.tsx`:
```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))
jest.mock('./SyncIndicator', () => ({ SyncIndicator: () => null }))

import { AppBar } from './AppBar'

describe('AppBar onSearch', () => {
  it('rend une action loupe qui déclenche onSearch', () => {
    const onSearch = jest.fn()
    render(<AppBar title="Mes fichiers" onSearch={onSearch} />)
    fireEvent.press(screen.getByLabelText('drive.search.action'))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('ne rend pas la loupe sans onSearch', () => {
    render(<AppBar title="Mes fichiers" />)
    expect(screen.queryByLabelText('drive.search.action')).toBeNull()
  })

  it('masque la loupe en mode sélection', () => {
    const onSearch = jest.fn()
    render(
      <AppBar
        title="Mes fichiers"
        onSearch={onSearch}
        selection={{ count: 1, onCancel: jest.fn(), actions: [] }}
      />
    )
    expect(screen.queryByLabelText('drive.search.action')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer le test — vérifier l'échec**

Run: `CI=true npx jest src/ui/AppBar.test.tsx`
Expected: FAIL — la loupe n'existe pas (`getByLabelText` ne trouve rien).

- [ ] **Step 3: Ajouter la prop `onSearch` au type `Props` de `src/ui/AppBar.tsx`**

Dans l'interface `Props` (après `onLogout?: () => void`), ajouter :
```ts
  /** When set, a magnify action is shown (outside selection mode) → opens search. */
  onSearch?: () => void
```
Et l'ajouter à la déstructuration :
```ts
export const AppBar = ({ title, onBack, onLogout, onSearch, selection }: Props) => {
```

- [ ] **Step 4: Rendre l'action loupe dans le header hors-sélection**

Dans le `return` non-sélection de `src/ui/AppBar.tsx`, entre `<Appbar.Content title={title} />` et `<SyncIndicator />`, insérer :
```tsx
      {onSearch ? (
        <Appbar.Action
          icon="magnify"
          onPress={onSearch}
          accessibilityLabel={t('drive.search.action')}
        />
      ) : null}
```

- [ ] **Step 5: Lancer le test — vérifier le succès**

Run: `CI=true npx jest src/ui/AppBar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Câbler l'AppBar du navigateur de fichiers**

Dans `app/(drive)/files/[...path].tsx`, sur le `<AppBar … />` (vers la ligne 349), ajouter la prop :
```tsx
        onSearch={() => router.push('/search')}
```
(à placer à côté de `title=` / `onBack=` ; `router` est déjà défini dans le composant.)

- [ ] **Step 7: Lancer toute la suite — vérifier zéro régression**

Run: `CI=true npm test`
Expected: toutes les suites vertes (aucune régression ; les nouveaux tests inclus).

- [ ] **Step 8: Commit**

```bash
git add src/ui/AppBar.tsx src/ui/AppBar.test.tsx "app/(drive)/files/[...path].tsx"
git commit -m "feat(search): magnify entry point in file-browser AppBar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Vérification finale (après Task 6)

- [ ] `CI=true npm test` → **toutes suites vertes** (44 existantes + nouvelles).
- [ ] `npm run typecheck` → **pas de NOUVELLE** erreur (les 2 `scope` cozy-client pré-existantes restent, cf. Global Constraints ; aucune dans les fichiers créés/modifiés ici).
- [ ] `npx eslint src/search app/search.tsx src/client/queries.ts src/ui/AppBar.tsx` → propre sur les fichiers touchés.
- [ ] **Manuel (device/simulateur)** : loupe → écran ; `< 2` car. = invite ; terme sans résultat = vide ; casse indifférente ; hors-ligne = résultats locaux ; tap fichier (pdf/image/doc) = aperçu ; tap dossier = navigation.
- [ ] Ouvrir la **PR dédiée** `feat/web-search` (interne au fork, base `main`).

## Découpage en PR

Une seule PR `feat/web-search`. Ordre de merge : la PR de nettoyage #5 **d'abord** (baseline vert), puis celle-ci.
