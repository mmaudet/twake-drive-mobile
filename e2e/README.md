# Maestro E2E suite — Twake Drive

**Cross-platform** E2E smoke tests (Android device + iOS simulator), run locally
before a signed build. Driven by [Maestro](https://maestro.mobile.dev/).

## Installation
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash   # installs ~/.maestro/bin/maestro
export PATH="$PATH:$HOME/.maestro/bin"
```
Android: `adb` + a connected device. iOS: Xcode + a booted simulator.

## Setup (once)
The flows assume a **pre-authenticated session** (the OIDC login + email code is not
automated — see `flows/00-login.yaml`, excluded from runs).
1. Launch the app and log in by hand (device / simulator).
2. iOS simulator: install a build **with the keychain fallback fix** (otherwise SecureStore
   fails on an unsigned build — see DEVICE-NOTES). Build: `gh workflow run build-ios.yml`.
3. The account must have ≥1 folder at the root (flows 01/03 depend on it).

## Run
```bash
npm run e2e:ios       # iOS simulator (in-app flows)
npm run e2e:android   # Android device (in-app + cross-app File Provider/Share)
# a targeted flow (always target the platform if 2 devices are connected):
maestro --platform ios test e2e/maestro/flows/in-app/02-tabs.yaml
```

## Device selection (gotcha)
With **two devices connected**, `maestro test` auto-selects one (often the Android one).
**Always** `--platform ios|android` or `--udid <UDID>`. The run-scripts do this.

## Cross-platform selectors
Labels/accessibility differ iOS↔Android. Rules (details in `DEVICE-NOTES.md`):
- Tabs / folders: text regex `{ text: 'Récents.*' }`, `{ text: 'name.*' }`.
- Buttons / fields: **testIDs** (`appbar-search-button`, `drive-fab`, `search-input`…).
- Back: `{ id: 'appbar-back-button' }` (no `pressKey: Back` — iOS has no hardware back).

## Structure
```
e2e/
  maestro/
    config.yaml           # excludes login from runs
    subflows/             # assertLoggedIn, openDrive, cleanup
    flows/
      00-login.yaml       # login tag (semi-manual, excluded)
      00-welcome.yaml     # preauth tag (app boot + login form)
      in-app/             # inapp tags (iOS + Android): 01-07
      android/            # android tags: 10 File Provider, 11 Share
  scripts/                # run-android.sh, run-ios.sh
  fixtures/               # sample.jpg (share)
  DEVICE-NOTES.md         # device results + recipe + quirks
```

## Status & scope
See `DEVICE-NOTES.md`. In short: 01-04 + 00-welcome **green cross-platform**; 10 File
Provider **green on Android**; 05/06 (preview/editor) and 07 (offline-pin iOS) + 11 (Share auto)
= to be finalized (fixtures / selectors). The keychain fallback fix unblocks **iOS auth on
the simulator without a real device**.
