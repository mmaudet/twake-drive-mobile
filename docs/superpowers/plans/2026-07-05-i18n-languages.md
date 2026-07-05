# Full i18n (7 languages) + i18n Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the app in English, French, Spanish, Italian, German, Vietnamese and Russian, with reliable device-language detection, a persistent in-app language override, grammatically correct plurals, and a CI guarantee that locales stay key-complete.

**Architecture:** Keep the existing `i18next` + `react-i18next` + `expo-localization` stack. Add a language registry (single source of truth), an MMKV-backed preference store mirroring `src/ui/useViewMode.ts`, a pure `pickLanguage()` resolver, and a Settings language screen. Convert count-bearing strings to i18next plural families and add five locale files. A parity test locks every locale to the English key set and to each language's required plural categories.

**Tech Stack:** TypeScript, React Native / Expo Router, react-native-paper, i18next 26, react-i18next 17, react-native-mmkv, `intl-pluralrules` (new), Jest + @testing-library/react-native.

## Global Constraints

- **Languages (exact codes, this order):** `en`, `fr`, `es`, `it`, `de`, `vi`, `ru`.
- **Autonym labels** (shown identically in every locale): English, Français, Español, Italiano, Deutsch, Tiếng Việt, Русский.
- **Zero-regression rule:** when splitting a string into plural forms, the `_other` form MUST reproduce the current `en`/`fr` string **verbatim** (tests render French by default — see below — and must keep passing).
- **Test environment language is French:** `jest.setup.ts` mocks `expo-localization.getLocales()` → `[{ languageCode: 'fr' }]`, and the MMKV mock's `getString` returns `undefined`. So real-i18n tests resolve to `fr`.
- **MMKV API in this repo:** `createMMKV({ id })` → instance with `.getString(key)`, `.set(key, value)`, `.remove(key)`. Never use `new MMKV()` or `.delete()`.
- **Placeholder preservation:** every `{{name}}`, `{{count}}`, `{{size}}`, `{{total}}`, `{{done}}`, `{{succeeded}}`, `{{failed}}` interpolation token MUST appear, unchanged, in every translation.
- **One new dependency:** `intl-pluralrules` (imported once at the top of `src/i18n/index.ts`).
- Path alias `@/*` → `src/*`. Colocate tests next to source (`*.test.ts[x]`).
- DRY, YAGNI, TDD, frequent commits. Run `npx tsc --noEmit` and `npx jest` from the worktree root.

---

## File Structure

**New files**
- `src/i18n/languages.ts` — registry, `LanguageCode`/`LanguagePreference` types, `isSupportedLanguage`, pure `pickLanguage`.
- `src/i18n/languages.test.ts` — unit tests for the registry + resolver.
- `src/i18n/languagePreference.ts` — MMKV-backed preference store + `useLanguagePreference` hook + `resolveLanguage`.
- `src/i18n/languagePreference.test.ts` — store tests (in-memory MMKV).
- `src/i18n/index.test.ts` — bootstrap tests (all bundles present, test-env default).
- `src/i18n/locales.test.ts` — parity + plural-category test (D1).
- `src/i18n/locales/{es,it,de,vi,ru}.json` — new translations.
- `app/(drive)/settings/language.tsx` — language picker screen.
- `app/(drive)/settings/language.test.tsx` — switcher test (D3).

**Modified files**
- `src/i18n/index.ts` — polyfill import, register 7 bundles, resolve initial language.
- `src/i18n/locales/{en,fr}.json` — plural restructure + `settings.language*` + `a11y.*` keys.
- `app/(drive)/settings/index.tsx` — language row.
- `app/(drive)/settings/_layout.tsx` — register the `language` screen.
- `src/ui/ViewSwitcher.tsx` + `src/ui/ViewSwitcher.test.tsx` — i18n a11y labels + testIDs.
- `src/ui/FolderRow.tsx`, `src/ui/FileRow.tsx`, `app/share/[fileId].tsx` — i18n a11y labels.
- `package.json` — `intl-pluralrules`.

---

## Task 1: Language registry + resolver

**Files:**
- Create: `src/i18n/languages.ts`
- Test: `src/i18n/languages.test.ts`

**Interfaces:**
- Produces: `type LanguageCode = 'en'|'fr'|'es'|'it'|'de'|'vi'|'ru'`; `type LanguagePreference = LanguageCode | 'system'`; `SUPPORTED_LANGUAGES: readonly {code: LanguageCode; label: string}[]`; `DEFAULT_LANGUAGE: LanguageCode`; `isSupportedLanguage(code?: string | null): code is LanguageCode`; `pickLanguage(preference: LanguagePreference | null | undefined, deviceLocales: { languageCode?: string | null }[]): LanguageCode`.

- [ ] **Step 1: Write the failing test**

```ts
// src/i18n/languages.test.ts
import { isSupportedLanguage, pickLanguage, SUPPORTED_LANGUAGES } from './languages'

describe('isSupportedLanguage', () => {
  it('accepts every declared language code', () => {
    for (const { code } of SUPPORTED_LANGUAGES) expect(isSupportedLanguage(code)).toBe(true)
  })
  it('rejects unknown / empty codes', () => {
    expect(isSupportedLanguage('pt')).toBe(false)
    expect(isSupportedLanguage(null)).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
  })
})

describe('pickLanguage', () => {
  it('honours a concrete stored preference over the device locale', () => {
    expect(pickLanguage('ru', [{ languageCode: 'fr' }])).toBe('ru')
  })
  it('follows the first supported device locale when preference is "system"', () => {
    expect(pickLanguage('system', [{ languageCode: 'de' }, { languageCode: 'en' }])).toBe('de')
  })
  it('skips unsupported device locales in order', () => {
    expect(pickLanguage('system', [{ languageCode: 'pt' }, { languageCode: 'it' }])).toBe('it')
  })
  it('falls back to English when nothing matches', () => {
    expect(pickLanguage('system', [{ languageCode: 'ja' }])).toBe('en')
    expect(pickLanguage(null, [])).toBe('en')
  })
  it('ignores an unsupported stored preference and follows the OS', () => {
    expect(pickLanguage('pt' as never, [{ languageCode: 'es' }])).toBe('es')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/i18n/languages.test.ts`
Expected: FAIL — `Cannot find module './languages'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/i18n/languages.ts
export type LanguageCode = 'en' | 'fr' | 'es' | 'it' | 'de' | 'vi' | 'ru'

/** Stored language choice: a concrete code, or 'system' to follow the OS. */
export type LanguagePreference = LanguageCode | 'system'

export interface LanguageDef {
  code: LanguageCode
  /** Autonym — the language's own name, shown identically in every locale. */
  label: string
}

export const SUPPORTED_LANGUAGES: readonly LanguageDef[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ru', label: 'Русский' }
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function isSupportedLanguage(code?: string | null): code is LanguageCode {
  return !!code && SUPPORTED_LANGUAGES.some(l => l.code === code)
}

/**
 * Resolve the effective language from a stored preference and the device's
 * ordered locale list. A concrete supported preference wins; otherwise the first
 * supported device locale is used; otherwise English.
 */
export function pickLanguage(
  preference: LanguagePreference | null | undefined,
  deviceLocales: { languageCode?: string | null }[]
): LanguageCode {
  if (preference && preference !== 'system' && isSupportedLanguage(preference)) return preference
  for (const locale of deviceLocales) {
    if (isSupportedLanguage(locale.languageCode)) return locale.languageCode
  }
  return DEFAULT_LANGUAGE
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/i18n/languages.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/languages.ts src/i18n/languages.test.ts
git commit -m "feat(i18n): language registry + pure pickLanguage resolver"
```

---

## Task 2: Persisted language preference store

**Files:**
- Create: `src/i18n/languagePreference.ts`
- Test: `src/i18n/languagePreference.test.ts`

**Interfaces:**
- Consumes: `LanguageCode`, `LanguagePreference`, `pickLanguage` from `./languages`; the `i18next` singleton; `getLocales` from `expo-localization`; `createMMKV` from `react-native-mmkv`.
- Produces: `getStoredPreference(): LanguagePreference`; `resolveLanguage(preference?: LanguagePreference): LanguageCode`; `setLanguagePreference(preference: LanguagePreference): void`; `useLanguagePreference(): { preference: LanguagePreference; resolvedLanguage: LanguageCode; setPreference: (p: LanguagePreference) => void }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/i18n/languagePreference.test.ts
import i18n from 'i18next'
import { getStoredPreference, resolveLanguage, setLanguagePreference } from './languagePreference'

// In-memory MMKV so the store round-trips within the file. The factory owns its
// Map (self-contained; jest.mock factories may not close over outer variables).
// NOTE: do NOT use jest.resetModules() here — resetting the registry would give
// languagePreference a *different* i18next singleton than the one imported above,
// so the changeLanguage spy would never see the call. Top-level imports share one
// singleton; shared module state is reset in afterEach instead.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>()
  return {
    createMMKV: () => ({
      getString: (k: string) => store.get(k),
      set: (k: string, v: string) => void store.set(k, v),
      remove: (k: string) => void store.delete(k)
    })
  }
})

describe('language preference store', () => {
  let changeLanguage: jest.SpyInstance
  beforeEach(() => {
    // Mock for the whole test so setLanguagePreference never touches the
    // (uninitialised) real i18next and prints init warnings.
    changeLanguage = jest.spyOn(i18n, 'changeLanguage').mockResolvedValue(undefined as never)
  })
  afterEach(() => {
    setLanguagePreference('system') // reset shared module state (uses the mock)
    changeLanguage.mockRestore()
  })

  it('defaults to "system" when nothing is stored', () => {
    expect(getStoredPreference()).toBe('system')
  })

  it('persists and reports a concrete preference', () => {
    setLanguagePreference('es')
    expect(getStoredPreference()).toBe('es')
  })

  it('changes the i18next language on set', () => {
    setLanguagePreference('de')
    expect(changeLanguage).toHaveBeenCalledWith('de')
  })

  it('resolves "system" against the device locale (fr in tests)', () => {
    expect(resolveLanguage('system')).toBe('fr')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/i18n/languagePreference.test.ts`
Expected: FAIL — `Cannot find module './languagePreference'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/i18n/languagePreference.ts
import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'
import i18n from 'i18next'
import { getLocales } from 'expo-localization'
import { LanguageCode, LanguagePreference, isSupportedLanguage, pickLanguage } from './languages'

const STORAGE_KEY = 'language'

// Module-level store, mirroring src/ui/useViewMode.ts. Guarded so tests / envs
// without the native module fall back to in-memory 'system'.
let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-settings' })
} catch {
  storage = null
}

function readStored(): LanguagePreference {
  const raw = storage?.getString(STORAGE_KEY)
  return isSupportedLanguage(raw) ? raw : 'system'
}

let currentPreference: LanguagePreference = readStored()
const listeners = new Set<() => void>()

export function getStoredPreference(): LanguagePreference {
  return currentPreference
}

/** Effective language, resolving 'system' against the current device locales. */
export function resolveLanguage(preference: LanguagePreference = currentPreference): LanguageCode {
  return pickLanguage(preference, getLocales())
}

/** Persist a preference, switch i18next, and notify subscribers. */
export function setLanguagePreference(preference: LanguagePreference): void {
  currentPreference = preference
  storage?.set(STORAGE_KEY, preference) // stores 'system' | concrete code
  void i18n.changeLanguage(resolveLanguage(preference))
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useLanguagePreference(): {
  preference: LanguagePreference
  resolvedLanguage: LanguageCode
  setPreference: (p: LanguagePreference) => void
} {
  const preference = useSyncExternalStore(subscribe, getStoredPreference, getStoredPreference)
  return {
    preference,
    resolvedLanguage: resolveLanguage(preference),
    setPreference: setLanguagePreference
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/i18n/languagePreference.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/languagePreference.ts src/i18n/languagePreference.test.ts
git commit -m "feat(i18n): MMKV-backed language preference store + hook"
```

---

## Task 3: Plural restructure of en.json + fr.json

Split count-bearing strings into i18next plural families (`_one`/`_other` for en & fr) and add the new `settings.language*` and `a11y.*` UI keys so later tasks (and the parity test) have an English/French reference. **`_other` reproduces the current string verbatim** (zero-regression rule).

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/fr.json`

**Keys to pluralize** (base → `_one`/`_other`): `drive.delete.confirmBulkTitle`, `drive.delete.confirmBulkBody`, `drive.delete.successBulk`, `drive.move.successBulk`, `drive.import.successBulk`, `drive.offline.folderSummary`, `drive.offline.folderConfirm`, `drive.offline.deleteAllConfirm`. (`drive.selection.count` is already `_one`/`_other`.)

**Left non-plural** (ratio / progress, verified — do not touch): `drive.offline.folderPartial`, `drive.import.uploading`, `drive.import.partial`.

- [ ] **Step 1: Edit `en.json`** — apply these exact replacements.

`drive.delete`: replace the three bulk lines
```json
      "confirmBulkTitle": "Delete {{count}} items?",
```
with
```json
      "confirmBulkTitle_one": "Delete {{count}} item?",
      "confirmBulkTitle_other": "Delete {{count}} items?",
```
```json
      "confirmBulkBody": "{{count}} items will be moved to the trash.",
```
with
```json
      "confirmBulkBody_one": "{{count}} item will be moved to the trash.",
      "confirmBulkBody_other": "{{count}} items will be moved to the trash.",
```
```json
      "successBulk": "{{count}} items moved to trash",
```
with
```json
      "successBulk_one": "{{count}} item moved to trash",
      "successBulk_other": "{{count}} items moved to trash",
```
`drive.move`:
```json
      "successBulk": "{{count}} items moved",
```
→
```json
      "successBulk_one": "{{count}} item moved",
      "successBulk_other": "{{count}} items moved",
```
`drive.import`:
```json
      "successBulk": "{{count}} files imported",
```
→
```json
      "successBulk_one": "{{count}} file imported",
      "successBulk_other": "{{count}} files imported",
```
`drive.offline`:
```json
      "folderSummary": "{{count}} files · {{size}}",
```
→
```json
      "folderSummary_one": "{{count}} file · {{size}}",
      "folderSummary_other": "{{count}} files · {{size}}",
```
```json
      "folderConfirm": "This folder contains {{count}} files (~{{size}}). Continue?",
```
→
```json
      "folderConfirm_one": "This folder contains {{count}} file (~{{size}}). Continue?",
      "folderConfirm_other": "This folder contains {{count}} files (~{{size}}). Continue?",
```
```json
      "deleteAllConfirm": "Remove {{count}} files ({{size}})? This cannot be undone.",
```
→
```json
      "deleteAllConfirm_one": "Remove {{count}} file ({{size}})? This cannot be undone.",
      "deleteAllConfirm_other": "Remove {{count}} files ({{size}})? This cannot be undone.",
```

Then add to the `settings` object:
```json
    "language": "Language",
    "languageSystem": "System default",
```
and add a new top-level `a11y` object (before `errors`):
```json
  "a11y": {
    "listView": "List view",
    "gridView": "Grid view",
    "folderActions": "Folder actions",
    "fileActions": "File actions",
    "removeRecipient": "Remove recipient"
  },
```

- [ ] **Step 2: Edit `fr.json`** — the same structural changes; `_other` keeps the current French string.

```json
      "confirmBulkTitle_one": "Supprimer {{count}} élément ?",
      "confirmBulkTitle_other": "Supprimer {{count}} éléments ?",
      "confirmBulkBody_one": "{{count}} élément sera déplacé dans la corbeille.",
      "confirmBulkBody_other": "{{count}} éléments seront déplacés dans la corbeille.",
      "successBulk_one": "{{count}} élément déplacé dans la corbeille",
      "successBulk_other": "{{count}} éléments déplacés dans la corbeille",
```
```json
      "successBulk_one": "{{count}} élément déplacé",
      "successBulk_other": "{{count}} éléments déplacés",
```
```json
      "successBulk_one": "{{count}} fichier importé",
      "successBulk_other": "{{count}} fichiers importés",
```
```json
      "folderSummary_one": "{{count}} fichier · {{size}}",
      "folderSummary_other": "{{count}} fichiers · {{size}}",
      "folderConfirm_one": "Ce dossier contient {{count}} fichier (~{{size}}). Continuer ?",
      "folderConfirm_other": "Ce dossier contient {{count}} fichiers (~{{size}}). Continuer ?",
      "deleteAllConfirm_one": "Supprimer {{count}} fichier ({{size}}) ? Cette action est irréversible.",
      "deleteAllConfirm_other": "Supprimer {{count}} fichiers ({{size}}) ? Cette action est irréversible.",
```
`settings`:
```json
    "language": "Langue",
    "languageSystem": "Langue du système",
```
`a11y`:
```json
  "a11y": {
    "listView": "Vue liste",
    "gridView": "Vue grille",
    "folderActions": "Actions du dossier",
    "fileActions": "Actions du fichier",
    "removeRecipient": "Retirer le destinataire"
  },
```

- [ ] **Step 3: Validate JSON + run the full suite (zero-regression check)**

Run: `node -e "require('./src/i18n/locales/en.json'); require('./src/i18n/locales/fr.json'); console.log('json ok')"`
Run: `npx jest`
Expected: `json ok`, then **78 suites / all green** — real-i18n tests (e.g. `favorites.test.tsx`) are unaffected because bulk call sites pass `count > 1` and hit the verbatim `_other` form.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(i18n): pluralize count strings + add language/a11y keys (en, fr)"
```

---

## Task 4: Five locale files + parity test (D1)

Write the parity test first (it fails while `es/it/de/vi/ru` are missing), then add each translation file until green. The test is the executable spec for structure + plural categories; human review covers nuance (§ native-review note).

**Files:**
- Create: `src/i18n/locales.test.ts`
- Create: `src/i18n/locales/es.json`, `it.json`, `de.json`, `vi.json`, `ru.json`

**Interfaces:**
- Consumes: `SUPPORTED_LANGUAGES`, `LanguageCode` from `./languages`; the seven locale JSONs.

- [ ] **Step 1: Write the parity + plural-category test**

```ts
// src/i18n/locales.test.ts
import { SUPPORTED_LANGUAGES, LanguageCode } from './languages'
import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import de from './locales/de.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'

const bundles: Record<LanguageCode, unknown> = { en, fr, es, it, de, vi, ru }
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

/** Leaf [dotted-key, value] pairs. */
function entries(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    entries(v, prefix ? `${prefix}.${k}` : k)
  )
}
const stripPlural = (k: string) =>
  PLURAL_SUFFIXES.reduce((acc, s) => (acc.endsWith(s) ? acc.slice(0, -s.length) : acc), k)
const logicalKeys = (o: unknown) => new Set(entries(o).map(([k]) => stripPlural(k)))
const rawKeys = (o: unknown) => new Set(entries(o).map(([k]) => k))

const enLogical = logicalKeys(en)
const pluralBases = new Set(
  entries(en).map(([k]) => k).filter(k => k !== stripPlural(k)).map(stripPlural)
)

describe('locale parity', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    describe(code, () => {
      it('has exactly the English logical key set', () => {
        const keys = logicalKeys(bundles[code])
        expect([...enLogical].filter(k => !keys.has(k))).toEqual([]) // missing
        expect([...keys].filter(k => !enLogical.has(k))).toEqual([]) // extra
      })
      it('carries the plural categories its grammar requires', () => {
        const keys = rawKeys(bundles[code])
        const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories
        for (const base of pluralBases) {
          for (const cat of cats) expect(keys.has(`${base}_${cat}`)).toBe(true)
        }
      })
      it('has no empty values', () => {
        expect(entries(bundles[code]).filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([])
      })
    })
  }
})
```

- [ ] **Step 2: Run — expect failure for the five missing files**

Run: `npx jest src/i18n/locales.test.ts`
Expected: FAIL — `Cannot find module './locales/es.json'`.

- [ ] **Steps 3–7: Create each locale file, re-running D1 after each**

Produce `es.json`, then `it.json`, `de.json`, `vi.json`, `ru.json`. Each file **mirrors the structure of the restructured `en.json` exactly** (same keys, same nesting, same interpolation tokens), translating every value. Rules:

- **Preserve every `{{…}}` token unchanged.**
- **Plural categories per language** (D1 enforces): `es`, `it`, `de` → `_one` + `_other`; `vi` → `_other` only; `ru` → `_one` + `_few` + `_many` + `_other`.
- Use the **glossary** below for domain terms (keeps terminology consistent). Keep proper nouns "Twake Drive", "Drive", "Excalidraw", "VLC", "WiFi", "Word", "Docs" as-is.
- `sortAZ`/`sortZA` stay `"A-Z"`/`"Z-A"` in every language.

**Glossary (EN → ES · IT · DE · VI · RU):**

| EN | ES | IT | DE | VI | RU |
|----|----|----|----|----|----|
| File | Archivo | File | Datei | Tệp | Файл |
| Folder | Carpeta | Cartella | Ordner | Thư mục | Папка |
| Drive | Drive | Drive | Drive | Drive | Диск |
| Favorites | Favoritos | Preferiti | Favoriten | Yêu thích | Избранное |
| Trash | Papelera | Cestino | Papierkorb | Thùng rác | Корзина |
| Recent | Recientes | Recenti | Zuletzt verwendet | Gần đây | Недавние |
| Shared with me | Compartidos conmigo | Condivisi con me | Für mich freigegeben | Được chia sẻ với tôi | Доступные мне |
| Move | Mover | Sposta | Verschieben | Di chuyển | Переместить |
| Rename | Renombrar | Rinomina | Umbenennen | Đổi tên | Переименовать |
| Delete | Eliminar | Elimina | Löschen | Xóa | Удалить |
| Download | Descargar | Scarica | Herunterladen | Tải xuống | Скачать |
| Share | Compartir | Condividi | Teilen | Chia sẻ | Поделиться |
| Import | Importar | Importa | Importieren | Nhập | Импортировать |
| Offline | Sin conexión | Offline | Offline | Ngoại tuyến | Офлайн |
| Settings | Ajustes | Impostazioni | Einstellungen | Cài đặt | Настройки |
| Search | Buscar | Cerca | Suchen | Tìm kiếm | Поиск |
| Preview | Vista previa | Anteprima | Vorschau | Xem trước | Просмотр |
| Recipient | Destinatario | Destinatario | Empfänger | Người nhận | Получатель |
| Public link | Enlace público | Link pubblico | Öffentlicher Link | Liên kết công khai | Публичная ссылка |
| Reader | Lector | Lettore | Leser | Người đọc | Читатель |
| Editor | Editor | Editore | Bearbeiter | Người chỉnh sửa | Редактор |
| Shortcut | Acceso directo | Scorciatoia | Verknüpfung | Lối tắt | Ярлык |
| Note | Nota | Nota | Notiz | Ghi chú | Заметка |
| Document | Documento | Documento | Dokument | Tài liệu | Документ |
| Spreadsheet | Hoja de cálculo | Foglio di calcolo | Tabelle | Bảng tính | Таблица |
| Presentation | Presentación | Presentazione | Präsentation | Bản trình bày | Презентация |
| Storage | Almacenamiento | Archiviazione | Speicher | Bộ nhớ | Хранилище |
| Restore | Restaurar | Ripristina | Wiederherstellen | Khôi phục | Восстановить |
| Cancel | Cancelar | Annulla | Abbrechen | Hủy | Отмена |
| Continue | Continuar | Continua | Weiter | Tiếp tục | Продолжить |
| Retry | Reintentar | Riprova | Erneut versuchen | Thử lại | Повторить |
| Language | Idioma | Lingua | Sprache | Ngôn ngữ | Язык |
| System default | Predeterminado del sistema | Predefinito di sistema | Systemstandard | Mặc định của hệ thống | Системный язык |

**Pinned plural forms** (the error-prone part — use exactly these). Every language also needs the already-plural `drive.selection.count`:

`es` (one/other), items = elemento(s), files = archivo(s):
```json
"confirmBulkTitle_one": "¿Eliminar {{count}} elemento?"        / "_other": "¿Eliminar {{count}} elementos?"
"confirmBulkBody_one": "{{count}} elemento se moverá a la papelera."  / "_other": "{{count}} elementos se moverán a la papelera."
"delete.successBulk_one": "{{count}} elemento movido a la papelera" / "_other": "{{count}} elementos movidos a la papelera"
"move.successBulk_one": "{{count}} elemento movido"            / "_other": "{{count}} elementos movidos"
"import.successBulk_one": "{{count}} archivo importado"        / "_other": "{{count}} archivos importados"
"folderSummary_one": "{{count}} archivo · {{size}}"           / "_other": "{{count}} archivos · {{size}}"
"folderConfirm_one": "Esta carpeta contiene {{count}} archivo (~{{size}}). ¿Continuar?" / "_other": "…{{count}} archivos…"
"deleteAllConfirm_one": "¿Eliminar {{count}} archivo ({{size}})? Esta acción no se puede deshacer." / "_other": "…{{count}} archivos…"
"selection.count_one": "{{count}} seleccionado"               / "_other": "{{count}} seleccionados"
```

`it` (one/other), items = elemento/i, files = file (invariant):
```json
"confirmBulkTitle_one": "Eliminare {{count}} elemento?"        / "_other": "Eliminare {{count}} elementi?"
"confirmBulkBody_one": "{{count}} elemento verrà spostato nel cestino."  / "_other": "{{count}} elementi verranno spostati nel cestino."
"delete.successBulk_one": "{{count}} elemento spostato nel cestino" / "_other": "{{count}} elementi spostati nel cestino"
"move.successBulk_one": "{{count}} elemento spostato"          / "_other": "{{count}} elementi spostati"
"import.successBulk_one": "{{count}} file importato"          / "_other": "{{count}} file importati"
"folderSummary_one": "{{count}} file · {{size}}"             / "_other": "{{count}} file · {{size}}"
"folderConfirm_one": "Questa cartella contiene {{count}} file (~{{size}}). Continuare?" / "_other": "… {{count}} file …"
"deleteAllConfirm_one": "Rimuovere {{count}} file ({{size}})? L'azione è irreversibile." / "_other": "… {{count}} file …"
"selection.count_one": "{{count}} selezionato"               / "_other": "{{count}} selezionati"
```

`de` (one/other), items = Element(e), files = Datei/Dateien:
```json
"confirmBulkTitle_one": "{{count}} Element löschen?"           / "_other": "{{count}} Elemente löschen?"
"confirmBulkBody_one": "{{count}} Element wird in den Papierkorb verschoben."  / "_other": "{{count}} Elemente werden in den Papierkorb verschoben."
"delete.successBulk_one": "{{count}} Element in den Papierkorb verschoben" / "_other": "{{count}} Elemente in den Papierkorb verschoben"
"move.successBulk_one": "{{count}} Element verschoben"         / "_other": "{{count}} Elemente verschoben"
"import.successBulk_one": "{{count}} Datei importiert"        / "_other": "{{count}} Dateien importiert"
"folderSummary_one": "{{count}} Datei · {{size}}"            / "_other": "{{count}} Dateien · {{size}}"
"folderConfirm_one": "Dieser Ordner enthält {{count}} Datei (~{{size}}). Fortfahren?" / "_other": "… {{count}} Dateien …"
"deleteAllConfirm_one": "{{count}} Datei ({{size}}) entfernen? Dies kann nicht rückgängig gemacht werden." / "_other": "{{count}} Dateien …"
"selection.count_one": "{{count}} ausgewählt"                / "_other": "{{count}} ausgewählt"
```

`vi` (other only — no inflection):
```json
"confirmBulkTitle_other": "Xóa {{count}} mục?"
"confirmBulkBody_other": "{{count}} mục sẽ được chuyển vào thùng rác."
"delete.successBulk_other": "Đã chuyển {{count}} mục vào thùng rác"
"move.successBulk_other": "Đã di chuyển {{count}} mục"
"import.successBulk_other": "Đã nhập {{count}} tệp"
"folderSummary_other": "{{count}} tệp · {{size}}"
"folderConfirm_other": "Thư mục này chứa {{count}} tệp (~{{size}}). Tiếp tục?"
"deleteAllConfirm_other": "Xóa {{count}} tệp ({{size}})? Hành động này không thể hoàn tác."
"selection.count_other": "Đã chọn {{count}}"
```

`ru` (one/few/many/other), items = элемент, files = файл:
```json
"confirmBulkTitle_one": "Удалить {{count}} элемент?"  "_few": "Удалить {{count}} элемента?"  "_many": "Удалить {{count}} элементов?"  "_other": "Удалить {{count}} элемента?"
"confirmBulkBody_one": "{{count}} элемент будет перемещён в корзину."  "_few": "{{count}} элемента будут перемещены в корзину."  "_many": "{{count}} элементов будут перемещены в корзину."  "_other": "{{count}} элемента будут перемещены в корзину."
"delete.successBulk_one": "{{count}} элемент перемещён в корзину"  "_few": "{{count}} элемента перемещены в корзину"  "_many": "{{count}} элементов перемещены в корзину"  "_other": "{{count}} элемента перемещены в корзину"
"move.successBulk_one": "{{count}} элемент перемещён"  "_few": "{{count}} элемента перемещены"  "_many": "{{count}} элементов перемещены"  "_other": "{{count}} элемента перемещены"
"import.successBulk_one": "{{count}} файл импортирован"  "_few": "{{count}} файла импортировано"  "_many": "{{count}} файлов импортировано"  "_other": "{{count}} файла импортировано"
"folderSummary_one": "{{count}} файл · {{size}}"  "_few": "{{count}} файла · {{size}}"  "_many": "{{count}} файлов · {{size}}"  "_other": "{{count}} файла · {{size}}"
"folderConfirm_one": "Эта папка содержит {{count}} файл (~{{size}}). Продолжить?"  "_few": "… {{count}} файла …"  "_many": "… {{count}} файлов …"  "_other": "… {{count}} файла …"
"deleteAllConfirm_one": "Удалить {{count}} файл ({{size}})? Это действие необратимо."  "_few": "… {{count}} файла …"  "_many": "… {{count}} файлов …"  "_other": "… {{count}} файла …"
"selection.count_one": "{{count}} выбран"  "_few": "{{count}} выбрано"  "_many": "{{count}} выбрано"  "_other": "{{count}} выбрано"
```

Also translate `settings.language`/`settings.languageSystem` (glossary) and the `a11y.*` block into each file:
- `a11y.listView / gridView / folderActions / fileActions / removeRecipient`
  - `es`: "Vista de lista" / "Vista de cuadrícula" / "Acciones de carpeta" / "Acciones de archivo" / "Quitar destinatario"
  - `it`: "Vista elenco" / "Vista griglia" / "Azioni cartella" / "Azioni file" / "Rimuovi destinatario"
  - `de`: "Listenansicht" / "Rasteransicht" / "Ordneraktionen" / "Dateiaktionen" / "Empfänger entfernen"
  - `vi`: "Xem dạng danh sách" / "Xem dạng lưới" / "Tác vụ thư mục" / "Tác vụ tệp" / "Xóa người nhận"
  - `ru`: "Список" / "Сетка" / "Действия с папкой" / "Действия с файлом" / "Удалить получателя"

After **each** file: `npx jest src/i18n/locales.test.ts` — that language's `describe` block must go green (structure + plural categories + no empties).

- [ ] **Step 8: Full green + commit**

Run: `npx jest src/i18n/locales.test.ts`
Expected: PASS for all seven languages.

```bash
git add src/i18n/locales.test.ts src/i18n/locales/es.json src/i18n/locales/it.json src/i18n/locales/de.json src/i18n/locales/vi.json src/i18n/locales/ru.json
git commit -m "feat(i18n): add es/it/de/vi/ru locales + locale parity test"
```

---

## Task 5: Wire the runtime (index.ts) + polyfill

**Files:**
- Modify: `src/i18n/index.ts`
- Modify: `package.json` (+ `intl-pluralrules`)
- Test: `src/i18n/index.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_LANGUAGE` from `./languages`; `getStoredPreference`, `resolveLanguage` from `./languagePreference`; the seven locale JSONs.
- Produces: default-exported configured `i18n` singleton with 7 bundles, initial language resolved from stored pref + device locale.

- [ ] **Step 1: Install the polyfill**

Run: `npm install intl-pluralrules`
Expected: adds `intl-pluralrules` to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Write the failing test**

```ts
// src/i18n/index.test.ts
import i18n from './index'
import { SUPPORTED_LANGUAGES } from './languages'

describe('i18n bootstrap', () => {
  it('registers a translation bundle for every supported language', () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      expect(i18n.hasResourceBundle(code, 'translation')).toBe(true)
    }
  })
  it('defaults to the device language in the test env (fr)', () => {
    expect(i18n.language).toBe('fr')
  })
  it('renders a Russian plural form correctly', () => {
    const t = i18n.getFixedT('ru')
    expect(t('drive.move.successBulk', { count: 1 })).toContain('перемещён')
    expect(t('drive.move.successBulk', { count: 3 })).toContain('перемещены')
    expect(t('drive.move.successBulk', { count: 8 })).toContain('элементов')
  })
})
```

- [ ] **Step 3: Run — expect failure**

Run: `npx jest src/i18n/index.test.ts`
Expected: FAIL — only `en`/`fr` bundles registered (and language logic still the old ternary).

- [ ] **Step 4: Rewrite `src/i18n/index.ts`**

```ts
import 'intl-pluralrules'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import de from './locales/de.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'
import { DEFAULT_LANGUAGE } from './languages'
import { getStoredPreference, resolveLanguage } from './languagePreference'

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  de: { translation: de },
  vi: { translation: vi },
  ru: { translation: ru }
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getStoredPreference()),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }
})

export default i18n
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/i18n/index.test.ts`
Expected: PASS (7 bundles, default `fr`, Russian plurals select `перемещён`/`перемещены`/`элементов`).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/index.ts src/i18n/index.test.ts package.json package-lock.json
git commit -m "feat(i18n): register 7 locales, resolve device language, add intl-pluralrules"
```

---

## Task 6: Language switcher UI

**Files:**
- Create: `app/(drive)/settings/language.tsx`
- Modify: `app/(drive)/settings/index.tsx`
- Modify: `app/(drive)/settings/_layout.tsx`
- Test: `app/(drive)/settings/language.test.tsx`

**Interfaces:**
- Consumes: `SUPPORTED_LANGUAGES` from `@/i18n/languages`; `useLanguagePreference`, `setLanguagePreference` from `@/i18n/languagePreference`; `ScreenContainer` from `@/ui/ScreenContainer`.

- [ ] **Step 1: Write the failing switcher test**

```tsx
// app/(drive)/settings/language.test.tsx
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import { setLanguagePreference } from '@/i18n/languagePreference'
import LanguageSettings from './language'

const renderScreen = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <LanguageSettings />
    </I18nextProvider>
  )

describe('language switcher', () => {
  afterEach(() => setLanguagePreference('system')) // back to device default (fr)

  it('lists System + all seven languages', () => {
    renderScreen()
    expect(screen.getByTestId('lang-system')).toBeOnTheScreen()
    for (const code of ['en', 'fr', 'es', 'it', 'de', 'vi', 'ru']) {
      expect(screen.getByTestId(`lang-${code}`)).toBeOnTheScreen()
    }
  })

  it('switches the app language when a language is picked', async () => {
    renderScreen()
    fireEvent.press(screen.getByTestId('lang-ru'))
    await waitFor(() => expect(i18n.language).toBe('ru'))
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `npx jest "app/(drive)/settings/language.test.tsx"`
Expected: FAIL — `Cannot find module './language'`.

- [ ] **Step 3: Create `app/(drive)/settings/language.tsx`**

```tsx
import React from 'react'
import { ScrollView } from 'react-native'
import { RadioButton } from 'react-native-paper'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/i18n/languages'
import { useLanguagePreference } from '@/i18n/languagePreference'

export default function LanguageSettings() {
  const { t } = useTranslation()
  const { preference, setPreference } = useLanguagePreference()
  return (
    <ScreenContainer>
      <ScrollView>
        <RadioButton.Group value={preference} onValueChange={v => setPreference(v as never)}>
          <RadioButton.Item
            label={t('settings.languageSystem')}
            value="system"
            testID="lang-system"
          />
          {SUPPORTED_LANGUAGES.map(l => (
            <RadioButton.Item key={l.code} label={l.label} value={l.code} testID={`lang-${l.code}`} />
          ))}
        </RadioButton.Group>
      </ScrollView>
    </ScreenContainer>
  )
}
```

- [ ] **Step 4: Add the Settings row** — edit `app/(drive)/settings/index.tsx` to this:

```tsx
import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { SUPPORTED_LANGUAGES } from '@/i18n/languages'
import { useLanguagePreference } from '@/i18n/languagePreference'

export default function SettingsIndex() {
  const { t } = useTranslation()
  const router = useRouter()
  const { preference, resolvedLanguage } = useLanguagePreference()
  const currentLanguageLabel =
    preference === 'system'
      ? t('settings.languageSystem')
      : (SUPPORTED_LANGUAGES.find(l => l.code === resolvedLanguage)?.label ?? '')
  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={t('settings.language')}
          description={currentLanguageLabel}
          left={p => <List.Icon {...p} icon="translate" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/(drive)/settings/language')}
          testID="settings-language"
        />
        <List.Item
          title={t('drive.offline.storageTitle')}
          left={p => <List.Icon {...p} icon="cloud-download-outline" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/(drive)/settings/offline-storage')}
        />
      </ScrollView>
    </ScreenContainer>
  )
}
```

- [ ] **Step 5: Register the screen** — edit `app/(drive)/settings/_layout.tsx`, add after the `offline-storage` line:

```tsx
      <Stack.Screen name="language" options={{ title: t('settings.language') }} />
```

- [ ] **Step 6: Run switcher test + typecheck**

Run: `npx jest "app/(drive)/settings/language.test.tsx"`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add "app/(drive)/settings/language.tsx" "app/(drive)/settings/language.test.tsx" "app/(drive)/settings/index.tsx" "app/(drive)/settings/_layout.tsx"
git commit -m "feat(i18n): language picker screen + Settings entry"
```

---

## Task 7: Internationalize the stray a11y labels

The `a11y.*` keys already exist in all seven locales (Tasks 3–4). Now point the components at them. `ViewSwitcher`'s labels are used by its test via `getByLabelText`, so add language-independent `testID`s and migrate the test.

**Files:**
- Modify: `src/ui/ViewSwitcher.tsx`, `src/ui/ViewSwitcher.test.tsx`
- Modify: `src/ui/FolderRow.tsx`, `src/ui/FileRow.tsx`, `app/share/[fileId].tsx`

- [ ] **Step 1: `ViewSwitcher.tsx`** — add the i18n import + hook and replace both `Pressable`s' labels with translated keys plus stable testIDs.

Add after the existing imports:
```tsx
import { useTranslation } from 'react-i18next'
```
Inside `ViewSwitcher`, after `const { colors } = useTheme()`:
```tsx
  const { t } = useTranslation()
```
List button — replace `accessibilityLabel="list view"` with:
```tsx
        accessibilityLabel={t('a11y.listView')}
        testID="view-list"
```
Grid button — replace `accessibilityLabel="grid view"` with:
```tsx
        accessibilityLabel={t('a11y.gridView')}
        testID="view-grid"
```

- [ ] **Step 2: Migrate `ViewSwitcher.test.tsx`** — replace every `getByLabelText('list view')` with `getByTestId('view-list')` and every `getByLabelText('grid view')` with `getByTestId('view-grid')`. Leave `toBeSelected()`/`not.toBeSelected()` assertions unchanged (they read `accessibilityState`, which is untouched).

- [ ] **Step 3: `FolderRow.tsx`** — replace `accessibilityLabel="folder actions"` with `accessibilityLabel={t('a11y.folderActions')}` (`t` is already in scope; keep the existing `testID="folder-actions"`).

- [ ] **Step 4: `FileRow.tsx`** — replace `accessibilityLabel="file actions"` with `accessibilityLabel={t('a11y.fileActions')}` (keep `testID="file-actions"`).

- [ ] **Step 5: `app/share/[fileId].tsx`** — replace `accessibilityLabel="remove recipient"` with `accessibilityLabel={t('a11y.removeRecipient')}` and add `testID="remove-recipient"` on that `IconButton` (`t` already in scope).

- [ ] **Step 6: Run the affected tests + typecheck**

Run: `npx jest src/ui/ViewSwitcher.test.tsx "app/share/[fileId].test.tsx" src/ui/FileRow.test.tsx src/ui/FolderPicker/FolderPicker.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ViewSwitcher.tsx src/ui/ViewSwitcher.test.tsx src/ui/FolderRow.tsx src/ui/FileRow.tsx "app/share/[fileId].tsx"
git commit -m "feat(i18n): internationalize accessibility labels (+ testIDs for switcher)"
```

---

## Task 8: Full verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Whole-suite gate**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx jest` → **all suites green** (baseline was 78 suites / 509 tests; expect ~+6 suites for the new i18n tests).
Run: `npx eslint . --ext .ts,.tsx` → no new errors in touched files.

- [ ] **Step 2: JSON sanity (no accidental drift)**

Run:
```bash
node -e "const c=require('./src/i18n/languages').SUPPORTED_LANGUAGES.map(l=>l.code); for (const x of c){const j=require('./src/i18n/locales/'+x+'.json'); const n=JSON.stringify(j).length; console.log(x, n)} console.log('all locales parse')"
```
Expected: prints a byte count per language and `all locales parse`.

- [ ] **Step 3: Manual smoke (device or simulator) — checklist**

- Launch on a French device → UI is French. On a German device → German. On a Japanese (unsupported) device → English.
- Settings → **Language** → pick **Русский**: UI switches live (tabs, dialogs), the Settings row description updates.
- Kill and relaunch the app → still Russian (persistence).
- Trigger a bulk action with 1 / 2 / 5 items in Russian → confirm singular/few/many wording differs; in Vietnamese → single form reads correctly.
- Settings → Language → **System default** → returns to the device language.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR to `fork/main`. PR description MUST include: the seven supported languages, the reliability changes (detection, persistence, plurals, parity test), and a **native-speaker review flag for Vietnamese and Russian** before a store release.

---

## Self-Review (author)

- **Spec coverage:** A1 registry → T1; A2 preference → T2; A3 resolution → T1 (`pickLanguage`) + T5 (wiring); A4 switcher → T6; B1 plurals → T3 (en/fr) + T4 (new langs); B2 five files → T4; B3 registration → T5; B4 UI keys → T3/T4/T6; C a11y → T7; D1 parity → T4; D2 resolution → T1; D3 switcher → T6; risk/polyfill → T5. All covered.
- **Placeholder scan:** all code steps show full code; translation values are pinned (glossary + full plural table) and gated by D1 — no "translate later". No TBD/TODO.
- **Type consistency:** `LanguageCode`/`LanguagePreference`, `getStoredPreference`/`resolveLanguage`/`setLanguagePreference`/`useLanguagePreference`, `pickLanguage`, `SUPPORTED_LANGUAGES` used identically across T1→T7. MMKV `.set/.getString` match repo API. Test default language `fr` consistent with `jest.setup.ts`.
