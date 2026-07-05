# Settings / Account UX Refonte — Design

**Date:** 2026-07-05
**Worktree / branch:** `/Users/mmaudet/work/twake-drive-mobile-settings` — `feat/settings-ux`

## Goal

Turn the near-empty, dead-end settings area into a proper, escapable, account-aware
settings experience: presented as a dismissable modal, with a real account section,
an in-app language switcher (decoupled from the parallel translations PR), a theme
selector, the existing offline-storage, an About/version block, and logout.

## Problems being fixed (from the review)

- **No way back** from the settings landing — it is the initial route of a nested
  `Stack` with no `headerLeft`/close configured, so the user is stuck (esp. iOS).
  `app/(drive)/settings/_layout.tsx`.
- **No in-app language switch** — locale is resolved once at module load from the OS
  locale, no persistence/override/UI. `src/i18n/index.ts`.
- **Hardcoded avatar initials** `'MM'`; no real identity displayed anywhere.
  `src/ui/AppBar.tsx:50`.
- **Settings is nearly empty** — a single "Offline storage" row.
  `app/(drive)/settings/index.tsx`.
- Theme is **OS-only**; `drive.sharedDrives` is **untranslated in FR**; logout is
  **buried** in the avatar dropdown.

## Non-goals (out of scope)

- **The additional translation files (IT/ES/DE/VI/RU)** — delivered by a separate
  dedicated PR. This PR builds only the **switcher**, which is **data-driven from
  whatever locales the i18n bundle contains**, so those languages light up
  automatically when that PR lands. This PR does not add/modify translation content
  except the one-word `drive.sharedDrives` FR fix.
- **The avatar dropdown interaction** stays (Settings / Drives / Logout); only its
  "Settings" target (`/settings`) and the initials source change.

## Architecture

### Navigation — Settings as a root `pageSheet` modal

- New route group `app/settings/`, registered as a modal on the **root** Stack
  (`app/_layout.tsx`): `<Stack.Screen name="settings" options={{ headerShown: false,
  presentation: 'pageSheet' }} />`, alongside the existing preview/share/move modals.
- `app/settings/_layout.tsx`: a nested `<Stack>`. The `index` screen gets a
  `headerLeft` **close (✕)** action → `router.back()` (dismisses the modal).
  Sub-screens (`offline-storage`, `language`) keep the default native back arrow.
- Remove the hidden `settings` tab from `app/(drive)/_layout.tsx` and delete the old
  `app/(drive)/settings/` group.
- `src/ui/AppBar.tsx`: avatar-menu "Settings" → `router.push('/settings')`.
- Result: dismiss via ✕ or swipe-down (pageSheet), consistent with share/move/preview,
  on iOS **and** Android.

### File plan

- **Create:** `app/settings/_layout.tsx`, `app/settings/index.tsx`,
  `app/settings/offline-storage.tsx` (moved), `app/settings/language.tsx`.
- **Create:** `src/preferences/localePreference.ts`, `src/preferences/ThemePreference.tsx`,
  `src/account/useCurrentUser.ts`, `src/i18n/localeNames.ts`.
- **Modify:** `app/_layout.tsx` (register the modal, wrap in ThemePreference provider,
  drive PaperProvider theme from the resolved scheme), `src/i18n/index.ts` (read the
  persisted preference at init), `src/ui/AppBar.tsx` (push target + real initials),
  `app/(drive)/_layout.tsx` (drop the settings tab), `src/i18n/locales/fr.json`
  (translate `drive.sharedDrives`).
- **Delete:** `app/(drive)/settings/_layout.tsx`, `.../index.tsx`, `.../offline-storage.tsx`.

## Units

### 1. Locale preference (the language-switcher infra)

- `src/preferences/localePreference.ts` — persisted in the app's local KV store
  (MMKV wrapper already used in the app; mocked in tests):
  - `getStoredLocalePreference(): 'system' | string` (sync)
  - `setLocalePreference(pref): void`
  - `resolveLanguage(pref, deviceLocale, available): string` — `pref` if it is an
    available locale, else `deviceLocale` if available, else `'en'`.
- `src/i18n/index.ts` at init:
  `lng = resolveLanguage(getStoredLocalePreference(), getLocales()[0]?.languageCode, Object.keys(resources))`.
- Runtime apply: `app/settings/language.tsx` calls `setLocalePreference(pref)` +
  `i18n.changeLanguage(resolved)`; react-i18next re-renders all `t()` consumers.
- `src/i18n/localeNames.ts` — `localeDisplayName(code): string`, a native-name map
  (`fr`→Français, `en`→English, `it`→Italiano, `es`→Español, `de`/`ge`→Deutsch,
  `vi`/`vn`→Tiếng Việt, `ru`→Русский, …), fallback to the code upper-cased.
- `app/settings/language.tsx` — lists **"Système (langue de l'appareil)"** plus one
  row per `Object.keys(i18n.options.resources ?? {})`, each labelled via
  `localeDisplayName`, a checkmark on the active preference. Tap → persist +
  `changeLanguage` + `router.back()`.
- **Decoupling:** the row list is derived at runtime from the bundle, so the parallel
  translations PR (adding it/es/de/vi/ru resources) surfaces them with **zero change
  here**; unknown codes fall back to the code label.

### 2. Theme preference

- `src/preferences/ThemePreference.tsx` — a context provider holding
  `themePref: 'system' | 'light' | 'dark'` (persisted) + `setThemePref`; hook
  `useThemePreference()`.
- `app/_layout.tsx` — wrap the tree in the provider; the active scheme =
  `themePref === 'system' ? useColorScheme() : themePref`; feed it to `PaperProvider`
  (replacing the current direct `useColorScheme()` at line 33).
- `app/settings/index.tsx` — a **Thème** row → inline picker (three options:
  Système / Clair / Sombre) writing `setThemePref`.

### 3. Current user (real account)

- `src/account/useCurrentUser.ts` — via cozy-client, read the instance settings
  (`io.cozy.settings`, instance doc → `public_name`, `email`) with `useQuery`; derive
  `initials` from `public_name` (else `email`). Returns
  `{ name, email, initials, loading }` with a **safe fallback** (email-derived or
  instance-domain initials, or a generic person) so nothing breaks when the doctype/
  fields are unavailable or offline.
- `src/ui/AppBar.tsx` — avatar uses `useCurrentUser().initials` (no more `'MM'`).
- `app/settings/index.tsx` — an **Account** header: avatar (initials) + name + email.

### 4. Settings landing content — `app/settings/index.tsx`

react-native-paper `List` sections:

1. **Compte** — avatar + `public_name` + `email`.
2. **Préférences** — *Langue* (→ `language.tsx`, shows the current language) · *Thème*
   (Système / Clair / Sombre).
3. **Stockage** — *Stockage hors-ligne* (→ `offline-storage.tsx`, unchanged logic).
4. **À propos** — app version (`expo-application` / `expo-constants`) + a "Twake" link
   (twake.app).
5. **Se déconnecter** — calls `logout()` from `useAuth`.

### 5. Minor

- `src/i18n/locales/fr.json` — translate `drive.sharedDrives` (currently "Drives") to
  a French term (proposed: **"Espaces partagés"**; confirm wording).

## Error handling

- Account query failure/offline → fallback identity (section still renders; no crash).
- Empty locale/theme preference → `'system'`.
- `changeLanguage` only ever receives an available locale (picker offers only those).

## Testing (unit, jest)

- `localePreference`: `resolveLanguage` for system / available / unavailable inputs;
  persistence round-trip (MMKV mock).
- `localeNames`: known + unknown codes.
- `ThemePreference`: default `'system'`, persistence, setter.
- `useCurrentUser`: initials from `public_name` / `email`; fallback when query empty.
- `language.tsx`: renders "Système" + one row per available locale; selecting calls
  `changeLanguage` + persists.
- `settings/index.tsx`: renders the 5 sections; logout row calls `logout`; ✕ calls
  `router.back`.
- `AppBar`: initials come from `useCurrentUser` (mocked), not `'MM'`.
- `fr.json`: `drive.sharedDrives` translated.

## Coordination note

The parallel translations PR will also edit `src/i18n/index.ts` (adding `resources`).
Both edits are additive; on merge, keep both (their `resources` + our
`resolveLanguage` at init). We deliberately avoid a shared `SUPPORTED_LOCALES`
constant — the picker derives the list from the runtime bundle — to minimise the
merge surface.
