# Design — Full i18n (7 languages) + i18n reliability hardening

- **Date:** 2026-07-05
- **Status:** Approved (design), spec under review
- **Worktree / branch:** `../twake-drive-mobile-i18n` on `feat/i18n-languages`
- **Base:** `fork/main` (`d479bfd`, PR #25) — i18n files are byte-identical to the current
  `feat/ios-file-provider` tip, so nothing is lost by basing here; the PR diffs cleanly
  against main with no unrelated iOS commits.
- **Target:** new PR → `fork/main`.

## 1. Goal

Ship the app in **seven languages** — English, French, Spanish, Italian, German (reliability
pass) plus **Vietnamese and Russian** (new) — and make the i18n runtime *reliable*: correct
device-language detection, a user-facing language override that persists, grammatically
correct plurals in every language, and a CI guarantee that no locale can silently drift out
of sync.

## 2. Current state (findings)

- Stack already in place: `i18next@^26`, `react-i18next@^17`, `expo-localization@~17`.
- Locales: only `en.json` + `fr.json` (well namespaced: `common`, `settings`, `auth`,
  `drive.*`, `errors`). ~228 lines each.
- **The app is already ~95% internationalised** — alerts, dialogs and screens go through
  `t()` (62 call sites across ~38 files). Only a handful of stray hardcoded strings remain
  (a few `accessibilityLabel`s).
- Gaps that make it *unreliable* today:
  - Detection is naive: `deviceLocale === 'fr' ? 'fr' : 'en'` — every non-French device
    falls to English, and there is no way to pick another language.
  - No manual language selector, no persistence of a choice.
  - No plural handling beyond `selection.count` (fine for en/fr, wrong for Russian).
  - Nothing guarantees the locale files stay key-complete.

## 3. Decisions locked (from brainstorming)

1. **Language selection model:** follow the OS language on first run (English fallback), plus a
   **manual override in Settings that persists** (MMKV). The user is never trapped in the wrong
   language.
2. **Plurals:** convert **all** count-bearing strings to proper i18next plural families
   (`_one/_other`, and `_few/_many` for Russian). Mostly a JSON change — call sites already
   pass `count`.

## 4. Non-goals (YAGNI)

- RTL layout (none of the 7 languages are RTL).
- Regional variants (`es-MX`, `de-AT`, `pt-BR`, …) — base languages only.
- Remote / over-the-air translation loading — translations stay bundled (offline-first).
- Reworking date/number/currency formatting.
- Professional/native translation review (advisory note only — see §9).

## 5. Architecture

### A. i18n infrastructure (`src/i18n/`)

**A1 — Language registry (`languages.ts`).** Single source of truth:

```ts
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ru', label: 'Русский' },
] as const
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']
export const isSupportedLanguage = (c?: string | null): c is LanguageCode =>
  SUPPORTED_LANGUAGES.some(l => l.code === c)
```

Labels are **autonyms** (each language named in itself) — the standard for language pickers,
identical in every locale, so they are constants, not translation keys.

**A2 — Persisted preference (`languagePreference.ts`).** Mirrors the existing
`src/ui/useViewMode.ts` MMKV pattern exactly (module-level instance, `useSyncExternalStore`,
graceful fallback when the native module is absent in tests):

- MMKV id `app-settings`, key `language`.
- Stored value: `LanguageCode | 'system'` (`'system'` = follow the OS). Default `'system'`.
- `getStoredPreference(): LanguageCode | 'system'`
- `setLanguagePreference(pref)`: writes MMKV, calls `i18n.changeLanguage(resolved)`, notifies
  subscribers.
- `useLanguagePreference()`: `{ preference, resolvedLanguage, setPreference }`.

**A3 — Startup resolution (`index.ts`).** Replaces the naive check:

```ts
function resolveInitialLanguage(): LanguageCode {
  const stored = getStoredPreference()
  if (stored !== 'system' && isSupportedLanguage(stored)) return stored
  for (const loc of getLocales()) {              // ordered by user preference
    if (isSupportedLanguage(loc.languageCode)) return loc.languageCode
  }
  return 'en'
}
```

**A4 — Language switcher UI.**
- `app/(drive)/settings/index.tsx`: add a `List.Item` titled `settings.language`, its
  description showing the current selection (autonym, or the "system" label), navigating to →
- `app/(drive)/settings/language.tsx`: a radio list — **System (automatic)** followed by the 7
  autonyms, current one checked. Selecting an item calls `setLanguagePreference`; react-i18next
  re-renders the whole tree. No RTL ⇒ no layout reload needed.

### B. Translation content

**B1 — Plural restructuring.** These keys become plural families (`en`/`fr`/`es`/`it`/`de` →
`_one`/`_other`; `ru` → `_one`/`_few`/`_many`/`_other`; `vi` → `_other` only):

- `drive.delete.confirmBulkTitle`, `drive.delete.confirmBulkBody`, `drive.delete.successBulk`
- `drive.move.successBulk`
- `drive.import.successBulk`
- `drive.offline.folderSummary`, `drive.offline.folderConfirm`, `drive.offline.deleteAllConfirm`
- `drive.selection.count` (already plural — extend with `ru`/`vi` forms)

Each call site already passes `{ count }` (verified per-site during implementation; adjust any
that pass a differently-named variable). i18next picks the suffix via `Intl.PluralRules`.

**Intentionally left non-plural** (ratio / progress strings, not a count of one noun):
`drive.offline.folderPartial` (`{{count}}/{{total}} files`), `drive.import.uploading`
(`{{done}}/{{total}}`), `drive.import.partial` (`{{succeeded}}/{{total}} … {{failed}} failed`).

**B2 — Five new locale files** `es.json`, `it.json`, `de.json`, `vi.json`, `ru.json` — full
translations, **key structure identical** to the restructured `en.json`. Authored directly
(native-quality target for fr/es/it/de, strong for ru, careful for vi). `en.json` and `fr.json`
are updated for the plural split.

**B3 — Registration.** All five added to `resources` in `index.ts`.

**B4 — New UI keys** added to every locale: `settings.language`, `settings.languageSystem`.

### C. Cleanup — stray hardcoded strings

Internationalise the remaining `accessibilityLabel` literals:
`src/ui/ViewSwitcher.tsx` ("list view" / "grid view"), `src/ui/FolderRow.tsx`
("folder actions"), `src/ui/FileRow.tsx` ("file actions"),
`app/share/[fileId].tsx` ("remove recipient"). New `a11y.*` keys.

**Test-coupling guard:** these labels may anchor E2E/RN test selectors. Where a test depends on
one, add a **language-independent `testID`** and point the selector at it, so translating the
label cannot break the suite. Verified by running the full suite after the change.

### D. Reliability guarantees (tests) — the core of "make it reliable"

- **D1 — Key-parity test** (`src/i18n/locales.test.ts`): flatten all 7 JSONs to dot-paths,
  strip plural suffixes to "logical keys", and assert every language's logical-key set equals
  `en`'s (reporting missing/extra). Then, for each plural base, assert every language contains
  **exactly** the suffixes its `Intl.PluralRules(lang)` requires (so `ru` must have
  one/few/many/other, `vi` only other). Assert no empty values. → CI fails on any drift.
- **D2 — Resolution test**: `resolveInitialLanguage()` — stored override wins; OS match;
  multi-locale ordering; unsupported ⇒ `en`.
- **D3 — Switcher test**: rendering the language screen and selecting an entry changes
  `i18n.language` and persists the preference.
- **D4 — Suite stays green**: typecheck + jest + no E2E selector regressions.

## 6. Risk — `Intl.PluralRules` on Hermes

i18next (v21+) delegates plural selection to `Intl.PluralRules`. Recent Expo/Hermes ship it,
but to make Russian plurals deterministic on **every** engine we add the `intl-pluralrules`
polyfill (tiny; installs a spec-compliant implementation only when the engine lacks one) and
import it once at the top of `src/i18n/index.ts`. This is the one new JS dependency, and it is
the idiomatic react-i18next-on-RN setup.

## 7. File inventory

**New:** `src/i18n/languages.ts`, `src/i18n/languagePreference.ts`,
`app/(drive)/settings/language.tsx`, `src/i18n/locales/{es,it,de,vi,ru}.json`,
tests (`locales.test.ts`, resolution test, switcher test).

**Modified:** `src/i18n/index.ts`, `src/i18n/locales/{en,fr}.json`,
`app/(drive)/settings/index.tsx`, `src/ui/{ViewSwitcher,FolderRow,FileRow}.tsx`,
`app/share/[fileId].tsx`, `package.json` (+`intl-pluralrules`).

## 8. Verification plan

1. `npx tsc --noEmit` clean.
2. `npm test` green, including D1–D3.
3. Manual smoke (or E2E) — switch language in Settings, confirm UI updates live and the choice
   survives an app restart; confirm a Russian device defaults to Russian.
4. Spot-check Russian plural forms (1 / 2 / 5 items) and Vietnamese single-form output.

## 9. Translation quality note

Machine-assisted, human-reviewed by the author. Consistent with common cloud-drive terminology.
**Vietnamese and Russian especially should get a native-speaker proofreading pass before a store
release** — flagged in the PR description; not a merge blocker.
