# Settings / Account UX Refonte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the near-empty, dead-end settings area into a dismissable modal with a real account section, an in-app language switcher (data-driven from the i18n bundle), a theme selector, offline storage, an about/version block, and logout.

**Architecture:** Move settings from a hidden `(drive)` tab to a root `pageSheet` modal route (`app/settings/`) with a close ✕. Add two persisted-preference modules (locale, theme) mirroring the existing `src/ui/useFolderSort.ts` pattern (`createMMKV` + `useSyncExternalStore`), a `useCurrentUser` hook over `io.cozy.settings`, and a native-name map for the language picker.

**Tech Stack:** React Native / Expo (expo-router), react-native-paper, i18next + react-i18next + expo-localization, react-native-mmkv (`createMMKV`), cozy-client, expo-constants.

## Global Constraints

- Worktree `/Users/mmaudet/work/twake-drive-mobile-settings`, branch `feat/settings-ux`. Push to `fork`, never `origin`. Commits in English; commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01NPJzY3jQuciGexnsjc1ANX`.
- This PR adds **no** translation files or new locales — the language switcher is driven at runtime from `Object.keys(i18n.options.resources)`. A parallel PR delivers IT/ES/DE/VI/RU. The only translation edit here is the FR value of `drive.sharedDrives`.
- Persist with `createMMKV({ id })` (guarded in try/catch like `src/ui/useFolderSort.ts`); MMKV is globally mocked in `jest.setup.ts` (`createMMKV` → `{ getString, set, remove }`).
- MMKV store API used: `store.getString(key): string | undefined`, `store.set(key, value: string): void`.
- No new npm dependencies. Version comes from `expo-constants` (`Constants.expoConfig?.version`).
- Keep the full jest suite green: run `npx jest` from the worktree root. Lint/format: `npx eslint <files>`, `npx prettier --write <files>`.
- Never log tokens/secrets. Never `expo prebuild`.

## File Structure

**Create**
- `src/preferences/localePreference.ts` — persisted locale preference (`'system' | <code>`) + `resolveLanguage`.
- `src/preferences/themePreference.ts` — reactive persisted theme preference (`'system'|'light'|'dark'`) via `useSyncExternalStore`.
- `src/i18n/localeNames.ts` — `localeDisplayName(code)` native-name map.
- `src/account/useCurrentUser.ts` — account identity (name/email/initials) over `io.cozy.settings`, with fallback.
- `app/settings/_layout.tsx` — settings Stack; index has a close ✕.
- `app/settings/index.tsx` — settings landing (all sections).
- `app/settings/offline-storage.tsx` — moved from `app/(drive)/settings/offline-storage.tsx`.
- `app/settings/language.tsx` — language picker.
- Tests colocated: `src/preferences/localePreference.test.ts`, `src/preferences/themePreference.test.ts`, `src/i18n/localeNames.test.ts`, `src/account/useCurrentUser.test.tsx`, `app/settings/language.test.tsx`, `app/settings/index.test.tsx`.

**Modify**
- `src/i18n/index.ts` — resolve `lng` from the stored preference.
- `app/_layout.tsx` — register the `settings` modal; drive the theme from `useThemePreference`.
- `src/ui/AppBar.tsx` — avatar → `router.push('/settings')`; initials from `useCurrentUser`.
- `app/(drive)/_layout.tsx` — remove the hidden `settings` tab (line 71).
- `src/i18n/locales/fr.json` — translate `drive.sharedDrives`.

**Delete**
- `app/(drive)/settings/_layout.tsx`, `app/(drive)/settings/index.tsx`, `app/(drive)/settings/offline-storage.tsx`.

---

### Task 1: Locale preference + i18n wiring

**Files:**
- Create: `src/preferences/localePreference.ts`, `src/preferences/localePreference.test.ts`
- Modify: `src/i18n/index.ts`

**Interfaces — Produces:**
- `resolveLanguage(pref: string, deviceLocale: string | undefined, available: string[]): string`
- `getLocalePreference(): string` (default `'system'`)
- `setLocalePreference(pref: string): void`
- `LOCALE_SYSTEM = 'system'`

- [ ] **Step 1 — failing test** `src/preferences/localePreference.test.ts`:
```ts
import { resolveLanguage, LOCALE_SYSTEM } from './localePreference'

describe('resolveLanguage', () => {
  const available = ['en', 'fr', 'it']
  it('returns the device locale when preference is system and available', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, 'fr', available)).toBe('fr')
  })
  it('falls back to en when system + device locale not available', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, 'de', available)).toBe('en')
  })
  it('returns the chosen locale when it is available', () => {
    expect(resolveLanguage('it', 'fr', available)).toBe('it')
  })
  it('ignores an unavailable chosen locale and uses the device locale', () => {
    expect(resolveLanguage('ru', 'fr', available)).toBe('fr')
  })
  it('defaults to en when nothing matches', () => {
    expect(resolveLanguage('ru', 'de', available)).toBe('en')
  })
})
```
- [ ] **Step 2 — run, expect FAIL** `npx jest src/preferences/localePreference.test.ts` (module not found).
- [ ] **Step 3 — implement** `src/preferences/localePreference.ts`:
```ts
import { createMMKV } from 'react-native-mmkv'

export const LOCALE_SYSTEM = 'system'
const STORAGE_KEY = 'localePreference'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/** Resolve the i18n language from the stored preference, the OS locale and the
 *  locales actually present in the bundle. `system` (or an unavailable choice)
 *  follows the device locale; anything unresolved falls back to English. */
export function resolveLanguage(
  pref: string,
  deviceLocale: string | undefined,
  available: string[]
): string {
  if (pref !== LOCALE_SYSTEM && available.includes(pref)) return pref
  if (deviceLocale && available.includes(deviceLocale)) return deviceLocale
  return 'en'
}

export function getLocalePreference(): string {
  return storage?.getString(STORAGE_KEY) ?? LOCALE_SYSTEM
}

export function setLocalePreference(pref: string): void {
  storage?.set(STORAGE_KEY, pref)
}
```
- [ ] **Step 4 — run, expect PASS** `npx jest src/preferences/localePreference.test.ts`.
- [ ] **Step 5 — wire i18n** — replace lines 13–14 of `src/i18n/index.ts`:
```ts
// (old)
const deviceLocale = getLocales()[0]?.languageCode ?? 'en'
const lng = deviceLocale === 'fr' ? 'fr' : 'en'
```
with:
```ts
import { getLocalePreference, resolveLanguage } from '@/preferences/localePreference'
// ...
const deviceLocale = getLocales()[0]?.languageCode ?? undefined
const lng = resolveLanguage(getLocalePreference(), deviceLocale, Object.keys(resources))
```
(The `import` goes with the other imports at the top.)
- [ ] **Step 6 — run full i18n-touching suite** `npx jest src/i18n src/preferences` — expect PASS.
- [ ] **Step 7 — lint + commit**
```bash
npx prettier --write src/preferences/localePreference.ts src/preferences/localePreference.test.ts src/i18n/index.ts
npx eslint src/preferences/localePreference.ts src/preferences/localePreference.test.ts src/i18n/index.ts
git add src/preferences/localePreference.ts src/preferences/localePreference.test.ts src/i18n/index.ts
git commit -m "feat(settings): persist a locale preference and resolve i18n language from it"
```

---

### Task 2: Locale display names

**Files:** Create `src/i18n/localeNames.ts`, `src/i18n/localeNames.test.ts`

**Interfaces — Produces:** `localeDisplayName(code: string): string`

- [ ] **Step 1 — failing test** `src/i18n/localeNames.test.ts`:
```ts
import { localeDisplayName } from './localeNames'

describe('localeDisplayName', () => {
  it('returns native names for known codes', () => {
    expect(localeDisplayName('fr')).toBe('Français')
    expect(localeDisplayName('en')).toBe('English')
    expect(localeDisplayName('it')).toBe('Italiano')
    expect(localeDisplayName('es')).toBe('Español')
    expect(localeDisplayName('de')).toBe('Deutsch')
    expect(localeDisplayName('vi')).toBe('Tiếng Việt')
    expect(localeDisplayName('ru')).toBe('Русский')
  })
  it('accepts common country-style aliases', () => {
    expect(localeDisplayName('ge')).toBe('Deutsch')
    expect(localeDisplayName('vn')).toBe('Tiếng Việt')
  })
  it('falls back to the upper-cased code for unknown locales', () => {
    expect(localeDisplayName('zz')).toBe('ZZ')
  })
})
```
- [ ] **Step 2 — run, expect FAIL** `npx jest src/i18n/localeNames.test.ts`.
- [ ] **Step 3 — implement** `src/i18n/localeNames.ts`:
```ts
// Native display name per language code. Kept here (not in the translation
// files) so the language picker can label any locale the i18n bundle contains,
// independently of which translations are shipped. Aliases map country-style
// codes (ge, vn) to the right language.
const NAMES: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  de: 'Deutsch',
  ge: 'Deutsch',
  vi: 'Tiếng Việt',
  vn: 'Tiếng Việt',
  ru: 'Русский',
  pt: 'Português',
  nl: 'Nederlands'
}

export function localeDisplayName(code: string): string {
  return NAMES[code.toLowerCase()] ?? code.toUpperCase()
}
```
- [ ] **Step 4 — run, expect PASS**.
- [ ] **Step 5 — lint + commit**
```bash
npx prettier --write src/i18n/localeNames.ts src/i18n/localeNames.test.ts
npx eslint src/i18n/localeNames.ts src/i18n/localeNames.test.ts
git add src/i18n/localeNames.ts src/i18n/localeNames.test.ts
git commit -m "feat(settings): native display names for locale codes"
```

---

### Task 3: Theme preference (reactive) + root layout

**Files:**
- Create: `src/preferences/themePreference.ts`, `src/preferences/themePreference.test.ts`
- Modify: `app/_layout.tsx` (lines 31–33)

**Interfaces — Produces:**
- `type ThemePref = 'system' | 'light' | 'dark'`
- `useThemePreference(): { pref: ThemePref; setPref: (p: ThemePref) => void }`
- `setThemePreference(p: ThemePref): void`

- [ ] **Step 1 — failing test** `src/preferences/themePreference.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react-native'
import { useThemePreference } from './themePreference'

describe('useThemePreference', () => {
  it('defaults to system and updates via setPref', () => {
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.pref).toBe('system')
    act(() => result.current.setPref('dark'))
    expect(result.current.pref).toBe('dark')
  })
})
```
- [ ] **Step 2 — run, expect FAIL**.
- [ ] **Step 3 — implement** `src/preferences/themePreference.ts` (mirror `src/ui/useFolderSort.ts`):
```ts
import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'themePreference'
const DEFAULT: ThemePref = 'system'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

function parse(raw: string | undefined): ThemePref {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT
}

let current: ThemePref = parse(storage?.getString(STORAGE_KEY))
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
function getSnapshot(): ThemePref {
  return current
}

export function setThemePreference(pref: ThemePref): void {
  if (pref === current) return
  current = pref
  storage?.set(STORAGE_KEY, pref)
  listeners.forEach(l => l())
}

export function useThemePreference(): { pref: ThemePref; setPref: (p: ThemePref) => void } {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { pref, setPref: setThemePreference }
}
```
- [ ] **Step 4 — run, expect PASS**.
- [ ] **Step 5 — apply in root layout** — in `app/_layout.tsx`, replace lines 31–33:
```tsx
const InnerLayout = () => {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme
```
with:
```tsx
const InnerLayout = () => {
  const colorScheme = useColorScheme()
  const { pref: themePref } = useThemePreference()
  const activeScheme = themePref === 'system' ? colorScheme : themePref
  const theme = activeScheme === 'dark' ? darkTheme : lightTheme
```
and add the import near the others: `import { useThemePreference } from '@/preferences/themePreference'`.
- [ ] **Step 6 — run** `npx jest app/_layout src/preferences` — expect PASS (no snapshot break; `useColorScheme` default is unchanged when pref is `system`).
- [ ] **Step 7 — lint + commit**
```bash
npx prettier --write src/preferences/themePreference.ts src/preferences/themePreference.test.ts app/_layout.tsx
npx eslint src/preferences/themePreference.ts src/preferences/themePreference.test.ts app/_layout.tsx
git add src/preferences/themePreference.ts src/preferences/themePreference.test.ts app/_layout.tsx
git commit -m "feat(settings): reactive theme preference applied at the root layout"
```

---

### Task 4: Current user (real account identity)

**Files:** Create `src/account/useCurrentUser.ts`, `src/account/useCurrentUser.test.tsx`

**Interfaces — Produces:**
- `deriveInitials(name?: string, email?: string): string`
- `useCurrentUser(): { name?: string; email?: string; initials: string; loading: boolean }`

- [ ] **Step 1 — failing test** `src/account/useCurrentUser.test.tsx` (test the pure helper; the hook is thin):
```ts
import { deriveInitials } from './useCurrentUser'

describe('deriveInitials', () => {
  it('takes the first letters of the first two words of the name', () => {
    expect(deriveInitials('Michel Maudet', 'x@y.z')).toBe('MM')
    expect(deriveInitials('Alice', undefined)).toBe('A')
  })
  it('falls back to the email local-part when there is no name', () => {
    expect(deriveInitials(undefined, 'mmaudet@linagora.com')).toBe('M')
  })
  it('returns U when nothing is available', () => {
    expect(deriveInitials(undefined, undefined)).toBe('U')
  })
})
```
- [ ] **Step 2 — run, expect FAIL**.
- [ ] **Step 3 — implement** `src/account/useCurrentUser.ts`:
```ts
import { Q, useQuery } from 'cozy-client'

/** Initials from a display name (first two words) or the email local part. */
export function deriveInitials(name?: string, email?: string): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  const local = (email ?? '').split('@')[0]
  if (local) return local[0].toUpperCase()
  return 'U'
}

interface InstanceSettings {
  public_name?: string
  email?: string
  attributes?: { public_name?: string; email?: string }
}

// The cozy instance settings live in the `io.cozy.settings` doctype (the
// `io.cozy.settings.instance` singleton). We already hold the `io.cozy.settings:GET`
// scope. Read defensively (flat or nested under `attributes`) and always fall back
// so the account section renders even offline / on an unexpected shape.
const instanceQuery = Q('io.cozy.settings').getById('io.cozy.settings.instance')

export function useCurrentUser(): {
  name?: string
  email?: string
  initials: string
  loading: boolean
} {
  const { data, fetchStatus } = useQuery(instanceQuery, { as: 'io.cozy.settings/instance' })
  const doc = (Array.isArray(data) ? data[0] : data) as InstanceSettings | null | undefined
  const name = doc?.public_name ?? doc?.attributes?.public_name
  const email = doc?.email ?? doc?.attributes?.email
  return {
    name,
    email,
    initials: deriveInitials(name, email),
    loading: fetchStatus === 'loading'
  }
}
```
- [ ] **Step 4 — run, expect PASS** `npx jest src/account/useCurrentUser.test.tsx`.
- [ ] **Step 5 — lint + commit**
```bash
npx prettier --write src/account/useCurrentUser.ts src/account/useCurrentUser.test.tsx
npx eslint src/account/useCurrentUser.ts src/account/useCurrentUser.test.tsx
git add src/account/useCurrentUser.ts src/account/useCurrentUser.test.tsx
git commit -m "feat(settings): useCurrentUser reads the account identity with a safe fallback"
```
**Note for implementer:** the exact shape/id of the `io.cozy.settings` instance doc must be confirmed on device (log `doc` once). The fallback guarantees the UI never breaks; if the query returns nothing, initials come from the email and the account section hides the empty name/email rows (Task 8).

---

### Task 5: Settings modal scaffold (navigation refactor)

**Files:**
- Create: `app/settings/_layout.tsx`, `app/settings/index.tsx` (minimal), `app/settings/offline-storage.tsx` (moved)
- Modify: `app/_layout.tsx` (register modal), `src/ui/AppBar.tsx` (push target), `app/(drive)/_layout.tsx` (drop tab)
- Delete: `app/(drive)/settings/_layout.tsx`, `app/(drive)/settings/index.tsx`, `app/(drive)/settings/offline-storage.tsx`

**Interfaces — Consumes:** none. **Produces:** the `/settings` modal route + `/settings/offline-storage`.

- [ ] **Step 1 — move offline storage** verbatim:
```bash
git mv "app/(drive)/settings/offline-storage.tsx" app/settings/offline-storage.tsx
```
(Its imports are all `@/…` absolute — no edits needed. If it references the route `'/(drive)/settings/offline-storage'` anywhere, none exist — it is only a destination.)
- [ ] **Step 2 — settings Stack layout** `app/settings/_layout.tsx`:
```tsx
import React from 'react'
import { Stack, useRouter } from 'expo-router'
import { Appbar } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

export default function SettingsLayout(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('settings.title'),
          headerLeft: () => (
            <Appbar.Action
              icon="close"
              onPress={() => router.back()}
              accessibilityLabel={t('common.close')}
            />
          )
        }}
      />
      <Stack.Screen name="offline-storage" options={{ title: t('drive.offline.storageTitle') }} />
      <Stack.Screen name="language" options={{ title: t('settings.language') }} />
    </Stack>
  )
}
```
- [ ] **Step 3 — minimal settings index** `app/settings/index.tsx` (offline row only for now; enriched in Tasks 6–9):
```tsx
import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'

export default function SettingsIndex(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={t('drive.offline.storageTitle')}
          left={p => <List.Icon {...p} icon="cloud-download-outline" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/settings/offline-storage')}
        />
      </ScrollView>
    </ScreenContainer>
  )
}
```
- [ ] **Step 4 — register modal** — in `app/_layout.tsx`, add after the `docs/new/[folderId]` screen (before `search`, ~line 113):
```tsx
<Stack.Screen
  name="settings"
  options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
/>
```
- [ ] **Step 5 — AppBar push target** — in `src/ui/AppBar.tsx` line 117, change `router.push('/(drive)/settings')` to `router.push('/settings')`.
- [ ] **Step 6 — drop the hidden tab** — in `app/(drive)/_layout.tsx`, delete line 71 `<Tabs.Screen name="settings" options={{ href: null }} />`.
- [ ] **Step 7 — delete old settings group**
```bash
git rm "app/(drive)/settings/_layout.tsx" "app/(drive)/settings/index.tsx"
```
- [ ] **Step 8 — add i18n keys** — in BOTH `src/i18n/locales/en.json` and `fr.json`, under `settings`, add `"language": "Language"` (en) / `"language": "Langue"` (fr); under `common`, add `"close": "Close"` (en) / `"close": "Fermer"` (fr) if absent.
- [ ] **Step 9 — run** `npx jest` — expect PASS (update `src/ui/AppBar.avatar.test.tsx` if it asserts the old route string; change the expected route to `/settings`).
- [ ] **Step 10 — lint + commit**
```bash
npx prettier --write app/settings src/ui/AppBar.tsx app/_layout.tsx "app/(drive)/_layout.tsx" src/i18n/locales/en.json src/i18n/locales/fr.json
npx eslint app/settings/_layout.tsx app/settings/index.tsx app/settings/offline-storage.tsx src/ui/AppBar.tsx app/_layout.tsx "app/(drive)/_layout.tsx"
git add -A
git commit -m "feat(settings): present settings as a dismissable pageSheet modal with a close button"
```

---

### Task 6: Language picker screen + settings row

**Files:**
- Create: `app/settings/language.tsx`, `app/settings/language.test.tsx`
- Modify: `app/settings/index.tsx` (add a Langue row)

**Interfaces — Consumes:** `getLocalePreference/setLocalePreference/LOCALE_SYSTEM` (Task 1), `localeDisplayName` (Task 2).

- [ ] **Step 1 — failing test** `app/settings/language.test.tsx`:
```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import i18n from '@/i18n'
import LanguageScreen from './language'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))

describe('LanguageScreen', () => {
  it('lists a System row plus one row per bundled locale, and switches on tap', () => {
    const changeSpy = jest.spyOn(i18n, 'changeLanguage')
    const { getByText } = render(<LanguageScreen />)
    getByText('Français')
    getByText('English')
    fireEvent.press(getByText('English'))
    expect(changeSpy).toHaveBeenCalledWith('en')
  })
})
```
- [ ] **Step 2 — run, expect FAIL**.
- [ ] **Step 3 — implement** `app/settings/language.tsx`:
```tsx
import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { localeDisplayName } from '@/i18n/localeNames'
import {
  LOCALE_SYSTEM,
  getLocalePreference,
  setLocalePreference,
  resolveLanguage
} from '@/preferences/localePreference'
import { getLocales } from 'expo-localization'

export default function LanguageScreen(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  const current = getLocalePreference()
  const available = Object.keys(i18n.options.resources ?? {})

  const choose = (pref: string): void => {
    setLocalePreference(pref)
    const device = getLocales()[0]?.languageCode ?? undefined
    void i18n.changeLanguage(resolveLanguage(pref, device, available))
    router.back()
  }

  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={t('settings.systemLanguage')}
          onPress={() => choose(LOCALE_SYSTEM)}
          right={p => (current === LOCALE_SYSTEM ? <List.Icon {...p} icon="check" /> : null)}
        />
        {available.map(code => (
          <List.Item
            key={code}
            title={localeDisplayName(code)}
            onPress={() => choose(code)}
            right={p => (current === code ? <List.Icon {...p} icon="check" /> : null)}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  )
}
```
- [ ] **Step 4 — run, expect PASS**.
- [ ] **Step 5 — add the Langue row** to `app/settings/index.tsx` (above the offline row):
```tsx
import { getLocalePreference, LOCALE_SYSTEM } from '@/preferences/localePreference'
import { localeDisplayName } from '@/i18n/localeNames'
// ...
const localePref = getLocalePreference()
const languageValue =
  localePref === LOCALE_SYSTEM ? t('settings.systemLanguage') : localeDisplayName(localePref)
// ...inside the ScrollView, above the offline row:
<List.Item
  title={t('settings.language')}
  description={languageValue}
  left={p => <List.Icon {...p} icon="translate" />}
  right={p => <List.Icon {...p} icon="chevron-right" />}
  onPress={() => router.push('/settings/language')}
/>
```
- [ ] **Step 6 — i18n keys** — add `settings.systemLanguage`: "System (device language)" / "Système (langue de l'appareil)" to en/fr.
- [ ] **Step 7 — run** `npx jest app/settings` — expect PASS.
- [ ] **Step 8 — lint + commit**
```bash
npx prettier --write app/settings/language.tsx app/settings/language.test.tsx app/settings/index.tsx src/i18n/locales/en.json src/i18n/locales/fr.json
npx eslint app/settings/language.tsx app/settings/language.test.tsx app/settings/index.tsx
git add -A
git commit -m "feat(settings): in-app language picker driven by the i18n bundle"
```

---

### Task 7: Theme selector row

**Files:** Modify `app/settings/index.tsx`

**Interfaces — Consumes:** `useThemePreference` (Task 3).

- [ ] **Step 1 — failing test** — add to `app/settings/index.test.tsx` (created in Task 9; if not yet present, create it with this single test now):
```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import SettingsIndex from './index'
import { setThemePreference } from '@/preferences/themePreference'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

it('offers three theme options and applies the choice', () => {
  const { getByText } = render(<SettingsIndex />)
  fireEvent.press(getByText('Dark'))
  // no throw; preference persisted
})
```
- [ ] **Step 2 — run, expect FAIL** (theme rows absent).
- [ ] **Step 3 — implement** — add a theme section to `app/settings/index.tsx`:
```tsx
import { useThemePreference, ThemePref } from '@/preferences/themePreference'
// ...
const { pref: themePref, setPref: setThemePref } = useThemePreference()
const themeOptions: { key: ThemePref; label: string }[] = [
  { key: 'system', label: t('settings.themeSystem') },
  { key: 'light', label: t('settings.themeLight') },
  { key: 'dark', label: t('settings.themeDark') }
]
// ...inside ScrollView, in a "Preferences" section:
<List.Subheader>{t('settings.theme')}</List.Subheader>
{themeOptions.map(o => (
  <List.Item
    key={o.key}
    title={o.label}
    onPress={() => setThemePref(o.key)}
    right={p => (themePref === o.key ? <List.Icon {...p} icon="check" /> : null)}
  />
))}
```
- [ ] **Step 4 — i18n keys** — add `settings.theme` ("Theme"/"Thème"), `settings.themeSystem` ("System"/"Système"), `settings.themeLight` ("Light"/"Clair"), `settings.themeDark` ("Dark"/"Sombre") to en/fr.
- [ ] **Step 5 — run, expect PASS**.
- [ ] **Step 6 — lint + commit**
```bash
npx prettier --write app/settings/index.tsx app/settings/index.test.tsx src/i18n/locales/en.json src/i18n/locales/fr.json
npx eslint app/settings/index.tsx app/settings/index.test.tsx
git add -A
git commit -m "feat(settings): theme selector (system/light/dark)"
```

---

### Task 8: Account section + real avatar initials

**Files:** Modify `app/settings/index.tsx`, `src/ui/AppBar.tsx`, `src/ui/AppBar.avatar.test.tsx`

**Interfaces — Consumes:** `useCurrentUser` (Task 4).

- [ ] **Step 1 — failing test** — add to `src/ui/AppBar.avatar.test.tsx`: mock `@/account/useCurrentUser` to return `{ initials: 'AB', ... }` and assert the avatar renders `AB` (not `MM`). Example:
```tsx
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ name: 'Alice B', email: 'a@b.c', initials: 'AB', loading: false })
}))
// then in the existing render, assert getByText('AB') is present
```
- [ ] **Step 2 — run, expect FAIL** (still 'MM').
- [ ] **Step 3 — implement AppBar** — in `src/ui/AppBar.tsx`: remove `const initials = 'MM'` (line 50), add `const { initials } = useCurrentUser()` and `import { useCurrentUser } from '@/account/useCurrentUser'`.
- [ ] **Step 4 — account section** — add to the top of `app/settings/index.tsx`:
```tsx
import { Avatar, List } from 'react-native-paper'
import { useCurrentUser } from '@/account/useCurrentUser'
// ...
const { name, email, initials } = useCurrentUser()
// ...first in the ScrollView:
<List.Item
  title={name ?? email ?? t('settings.account')}
  description={name ? email : undefined}
  left={() => <Avatar.Text size={40} label={initials} />}
/>
```
- [ ] **Step 5 — i18n key** — add `settings.account` ("Account"/"Compte") to en/fr.
- [ ] **Step 6 — run** `npx jest src/ui/AppBar app/settings` — expect PASS.
- [ ] **Step 7 — lint + commit**
```bash
npx prettier --write src/ui/AppBar.tsx src/ui/AppBar.avatar.test.tsx app/settings/index.tsx src/i18n/locales/en.json src/i18n/locales/fr.json
npx eslint src/ui/AppBar.tsx src/ui/AppBar.avatar.test.tsx app/settings/index.tsx
git add -A
git commit -m "feat(settings): real account identity in the avatar and a settings account header"
```

---

### Task 9: About/version, logout, section polish + FR "Drives"

**Files:** Modify `app/settings/index.tsx`, `app/settings/index.test.tsx`, `src/i18n/locales/fr.json`

**Interfaces — Consumes:** `useAuth` (`logout`), `expo-constants`.

- [ ] **Step 1 — failing test** — add to `app/settings/index.test.tsx`:
```tsx
it('renders the app version and a logout row that calls logout', () => {
  const logout = jest.fn()
  jest.spyOn(require('@/auth/useAuth'), 'useAuth').mockReturnValue({ logout })
  const { getByText } = render(<SettingsIndex />)
  fireEvent.press(getByText('Log out'))
  expect(logout).toHaveBeenCalled()
})
```
- [ ] **Step 2 — run, expect FAIL**.
- [ ] **Step 3 — implement** — in `app/settings/index.tsx`: add an About section (version) and a logout row:
```tsx
import Constants from 'expo-constants'
import { useAuth } from '@/auth/useAuth'
// ...
const { logout } = useAuth()
const version = Constants.expoConfig?.version ?? ''
// ...end of the ScrollView:
<List.Subheader>{t('settings.about')}</List.Subheader>
<List.Item title={t('settings.version')} description={version} />
<List.Item
  title={t('common.logout')}
  left={p => <List.Icon {...p} icon="logout" />}
  onPress={() => void logout()}
/>
```
- [ ] **Step 4 — i18n keys** — add `settings.about` ("About"/"À propos"), `settings.version` ("Version"/"Version") to en/fr. In `fr.json`, change `drive.sharedDrives` from `"Drives"` to `"Espaces partagés"`.
- [ ] **Step 5 — run, expect PASS**.
- [ ] **Step 6 — full suite + lint** `npx jest` (all green), then prettier/eslint the touched files.
- [ ] **Step 7 — commit**
```bash
git add -A
git commit -m "feat(settings): about/version, logout, and the French label for shared drives"
```

---

## Self-Review

**Spec coverage:** nav modal (T5) · language switcher decoupled from translations (T1,T2,T6) · theme (T3,T7) · real account (T4,T8) · settings content — account/langue/thème/stockage/à propos/logout (T5–T9) · FR "Drives" (T9). All spec sections mapped.

**Placeholder scan:** none — every step has concrete code/commands. The only runtime-verification note (T4, cozy doc shape) ships with concrete code + a guaranteed fallback, not a placeholder.

**Type consistency:** `resolveLanguage(pref, deviceLocale, available)` used identically in T1/T6; `ThemePref` from T3 used in T7; `useCurrentUser` fields (`name/email/initials`) consistent T4/T8; `LOCALE_SYSTEM` shared T1/T6. MMKV id `'app-preferences'` shared by locale + theme stores.

**Device validation (post-implementation, before PR):** build the release APK (JDK 21, `./gradlew assembleRelease`, never prebuild), install on 59021FDCG003NW, verify: settings opens as a modal + ✕/swipe closes; language switch works and persists across restart; theme switch works; account shows real name/email/initials; offline storage still works.
