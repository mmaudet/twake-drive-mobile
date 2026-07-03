# Mobile CI & Build Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions that automatically build installable, unsigned iOS-Simulator and Android test artifacts (plus lint/typecheck/test and a dependency scan) with zero user-managed secrets.

**Architecture:** Five additive files under `.github/workflows/` and `docs/`. No changes to the committed `android/`/`ios/` native projects — Android uses the already-committed `debug.keystore` via `assembleRelease`; iOS builds a Release Simulator `.app` with signing disabled. All store/signing automation (the visio-mobile Fastlane port) is documented as a phase-2 runbook, not built.

**Tech Stack:** GitHub Actions, Node 20 + npm, JDK 17 + Gradle 8.14.3 (Android), Xcode 16 + CocoaPods (iOS), Trivy (scan). Expo SDK 54 / React Native 0.81.5, New Architecture enabled.

## Global Constraints

Every task's requirements implicitly include these (exact values from the spec):

- **No code signing. No user-managed secrets.** Workflows use only the built-in `GITHUB_TOKEN` (`${{ github.token }}`).
- **No `expo prebuild`.** Build the committed native projects in place; do not modify `android/` or `ios/` sources.
- **JDK 17** for Android (Gradle 8.14.3; JDK 24 breaks Gradle). **Node 20** everywhere.
- **New Architecture is enabled** (`newArchEnabled=true`) → native compilation happens on both platforms; builds are slow on a cold cache.
- **App id** `com.linagora.twakedrive`. **iOS** workspace `ios/TwakeDrive.xcworkspace`, shared scheme `TwakeDrive`. **Android** `./gradlew assembleRelease` (debug-signed via committed `android/app/debug.keystore`).
- **Pinned action SHAs** (reuse verbatim — vetted in visio-mobile):
  - `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6`
  - `actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6`
  - `actions/setup-java@be666c2fcd27ec809703dec50e508c2fdc7f6654 # v5`
  - `actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7`
  - `aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # master`
- **Artifacts:** iOS is **Simulator-only** (no signing ⇒ no physical-device install). Android APK installs on any device (debug-signed).

## Note on "tests" for this plan

CI workflows can't be unit-tested before they run on GitHub. The verification for each YAML task is: **(a)** lint locally with `actionlint`, and **(b)** for `ci.yml`, run the wrapped npm scripts locally to prove the jobs pass. True end-to-end validation (artifacts build, install, run) happens in the final task by observing the live Actions runs.

Install `actionlint` once (macOS): `brew install actionlint`. Fallback syntax check if `actionlint` is unavailable: `python3 -c "import yaml; yaml.safe_load(open('<file>'))"` (note: GH Actions YAML parses the `on:` key as boolean `True` — this is expected and harmless).

## File Structure

```
.github/workflows/ci.yml            # lint · typecheck · jest (PR + main + dispatch)
.github/workflows/build-android.yml # installable app-release.apk + PR comment
.github/workflows/build-ios.yml     # Release Simulator .app (main + dispatch + tags)
.github/workflows/security.yml      # Trivy filesystem vuln scan
docs/ci-cd.md                       # runbook + phase-2 (signing/stores) activation guide
```

---

### Task 1: CI checks workflow (`ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing npm scripts `lint` (`eslint . --ext .ts,.tsx`), `typecheck` (`tsc --noEmit`), `test` (`jest`).
- Produces: three **non-blocking** checks named `lint`, `typecheck`, `test` on PRs and `main` pushes (informational until the codebase is clean).

- [ ] **Step 1: Note current check status — jobs are non-blocking by decision**

`npm run lint` (293 errors), `npm run typecheck` (~4), and `npm test` (9/356) all currently fail on pre-existing app source (largely the parallel dev session's in-flight work). By decision, the three jobs are **non-blocking** (`continue-on-error: true`) so they surface status without gating PRs red. Do NOT modify app source and do NOT run a local green-gate — just create and lint the workflow file.

- [ ] **Step 2: Create the workflow file**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

# lint/typecheck/test currently report pre-existing failures across app source.
# Jobs are non-blocking (continue-on-error) so they surface status without
# gating PRs. Drop continue-on-error per job once each is green. See docs/ci-cd.md.
jobs:
  lint:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
```

- [ ] **Step 3: Lint the workflow**

Run: `actionlint .github/workflows/ci.yml`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/test workflow"
```

---

### Task 2: Android test-APK workflow (`build-android.yml`)

**Files:**
- Create: `.github/workflows/build-android.yml`

**Interfaces:**
- Consumes: committed `android/` project, `android/app/debug.keystore`, `npm ci` (bundles JS via the RN gradle plugin).
- Produces: artifact `twake-drive-android-apk-<run_number>` containing `app-release.apk`; a PR comment linking the run (PR events only).

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/build-android.yml`:
```yaml
name: Build Android (test APK)

on:
  pull_request:
  push:
    branches: [main]
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+*'
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  build-android:
    runs-on: ubuntu-24.04
    # New Arch compiles native code; cold cache may also download the NDK.
    # Warm builds are ~15-20 min. Cap high so a cold first build doesn't
    # trip a spurious timeout; the cap only guards genuine hangs.
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6

      - name: Set up JDK 17
        uses: actions/setup-java@be666c2fcd27ec809703dec50e508c2fdc7f6654 # v5
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: 'gradle'

      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      # assembleRelease signs with the committed debug keystore (no secret) and
      # embeds the JS bundle -> standalone, installable APK. Restrict ABIs to
      # arm64 (real devices) + x86_64 (emulators) to halve build time and size.
      - name: Build release APK
        working-directory: android
        run: ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,x86_64

      - name: Locate APK
        id: apk
        run: |
          APK=$(find android/app/build/outputs/apk/release -name "*.apk" | head -1)
          if [ -z "$APK" ]; then echo "::error::No APK produced"; exit 1; fi
          echo "path=$APK" >> "$GITHUB_OUTPUT"
          echo "Found: $APK"

      - name: Upload APK artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7
        with:
          name: twake-drive-android-apk-${{ github.run_number }}
          path: ${{ steps.apk.outputs.path }}
          if-no-files-found: error
          retention-days: 14

      - name: Comment build link on PR
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh pr comment "${{ github.event.pull_request.number }}" --body \
          "📱 **Android test APK** built in [run #${{ github.run_number }}](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}). Download it from the run's **Artifacts** → \`twake-drive-android-apk-${{ github.run_number }}\`. Install with \`adb install <file>.apk\` or enable 'install from unknown sources' on the device."
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/build-android.yml`
Expected: no output (exit 0).

- [ ] **Step 3: (Optional) Local smoke build**

Only if you have the Android SDK/NDK locally and want to de-risk before pushing (heavy, ~15-20 min):
```bash
cd android && ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
ls -la app/build/outputs/apk/release/
```
Expected: `app-release.apk` exists. Skip if you'd rather let CI be the first build.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build-android.yml
git commit -m "ci: build installable Android test APK artifact"
```

---

### Task 3: iOS Simulator build workflow (`build-ios.yml`)

**Files:**
- Create: `.github/workflows/build-ios.yml`

**Interfaces:**
- Consumes: committed `ios/` project (`TwakeDrive.xcworkspace`, scheme `TwakeDrive`, `Podfile`), `npm ci`, `pod install`.
- Produces: artifact `twake-drive-ios-simulator-<run_number>` containing `TwakeDrive-Simulator.app.zip`.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/build-ios.yml`:
```yaml
name: Build iOS (Simulator)

# Not on every PR — macOS runner minutes cost ~10x. Runs on main pushes,
# manual dispatch, and release tags. Enable pull_request later if desired.
on:
  push:
    branches: [main]
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+*'
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  build-ios:
    runs-on: macos-15
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6

      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install CocoaPods
        working-directory: ios
        run: pod install

      # Release config embeds the JS bundle -> standalone .app. Simulator SDK
      # needs no code signing; the three flags neutralize any pod signing phase.
      - name: Build for iOS Simulator (unsigned)
        run: |
          set -o pipefail
          xcodebuild \
            -workspace ios/TwakeDrive.xcworkspace \
            -scheme TwakeDrive \
            -configuration Release \
            -sdk iphonesimulator \
            -derivedDataPath ios/build \
            CODE_SIGNING_ALLOWED=NO \
            CODE_SIGNING_REQUIRED=NO \
            CODE_SIGN_IDENTITY="" \
            build

      - name: Zip the .app
        run: |
          APP="ios/build/Build/Products/Release-iphonesimulator/TwakeDrive.app"
          if [ ! -d "$APP" ]; then echo "::error::$APP not found"; exit 1; fi
          ditto -c -k --keepParent "$APP" "TwakeDrive-Simulator.app.zip"

      - name: Upload Simulator app artifact
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7
        with:
          name: twake-drive-ios-simulator-${{ github.run_number }}
          path: TwakeDrive-Simulator.app.zip
          if-no-files-found: error
          retention-days: 14
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/build-ios.yml`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-ios.yml
git commit -m "ci: build iOS Simulator test artifact"
```

---

### Task 4: Security scan workflow (`security.yml`)

**Files:**
- Create: `.github/workflows/security.yml`

**Interfaces:**
- Consumes: repo filesystem (`package-lock.json` et al.).
- Produces: check `Trivy - filesystem scan`; fails on CRITICAL/HIGH fixable vulns.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/security.yml`:
```yaml
name: Security

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  trivy-fs:
    name: Trivy - filesystem scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - name: Run Trivy (fs, vuln)
        uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          scanners: 'vuln'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
          ignore-unfixed: true
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/security.yml`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "ci: add Trivy filesystem vulnerability scan"
```

---

### Task 5: CI/CD runbook (`docs/ci-cd.md`)

**Files:**
- Create: `docs/ci-cd.md`

**Interfaces:**
- Consumes: nothing (documentation).
- Produces: operator guide for phase-1 usage + phase-2 activation.

- [ ] **Step 1: Create the runbook**

Create `docs/ci-cd.md`:
````markdown
# CI / CD — Mobile builds

GitHub Actions build **unsigned dev/test artifacts** with no secrets. Signing
and store distribution are documented below as a phase-2 activation guide.

## Current status (introduced 2026-07-02)

The `ci.yml` checks are **non-blocking** (`continue-on-error`) because the app
source is not yet clean. Snapshot at introduction:

- **lint** — 293 errors: ~275 auto-fixable `prettier/prettier`, plus 18
  `@typescript-eslint/no-explicit-any` "rule not found". Root cause:
  `.eslintrc.js` never registers the `@typescript-eslint` plugin (it *is*
  installed under `node_modules/`). Fix: add the plugin to the ESLint config,
  then `npm run lint -- --fix` for the formatting.
- **typecheck** — expo typed-routes reject `"/(drive)/files"`; and `scope` is
  not in cozy-client's `ClientOptions` type (surfaced by the scoped-OAuth work).
- **test** — 9 of 356 failing (4 suites, incl. `src/auth/useAuth.test.tsx`).

Flip each job to blocking (remove its `continue-on-error`) once it is green.

## Workflows (phase 1)

| Workflow | Triggers | Output |
| --- | --- | --- |
| `ci.yml` | PR, push `main`, manual | `lint` · `typecheck` · `test` checks |
| `build-android.yml` | PR, push `main`, tags `v*`, manual | Installable `app-release.apk` artifact + PR comment |
| `build-ios.yml` | push `main`, tags `v*`, manual | iOS **Simulator** `.app` artifact |
| `security.yml` | PR, push `main` | Trivy dependency scan (CRITICAL/HIGH) |

`build-ios.yml` skips PRs on purpose (macOS runner minutes cost ~10x). Trigger
it manually from the **Actions** tab (**Run workflow**) or by pushing a `v*` tag.

## Getting a test build

Open the workflow run in the **Actions** tab → **Artifacts** → download.

- **Android** (`twake-drive-android-apk-<run>`): installs on any device.
  ```bash
  adb install twake-drive-app-release.apk
  ```
  Or copy to the device and allow "install from unknown sources". The APK is
  signed with the debug key — fine for testing, not for the Play Store.
- **iOS** (`twake-drive-ios-simulator-<run>`): unzip, then run in the iOS
  Simulator (no physical-device install without signing — see phase 2).
  ```bash
  unzip TwakeDrive-Simulator.app.zip
  xcrun simctl boot "iPhone 16"        # if no Simulator is booted
  xcrun simctl install booted TwakeDrive.app
  xcrun simctl launch booted com.linagora.twakedrive
  ```

## Why iOS is Simulator-only here

Installing on a physical iPhone requires an Apple signing identity and a
provisioning profile. That's phase 2 (TestFlight via Fastlane `match`).

---

## Phase 2 — activation guide (signing + stores)

Ported from the visio-mobile CI. Each section lists the exact secrets to add
under **Settings → Secrets and variables → Actions**, then the workflow change.

### Android release signing + Google Play (internal track)

1. Generate an upload keystore (once):
   ```bash
   keytool -genkeypair -v -keystore upload.keystore -alias twakedrive \
     -keyalg RSA -keysize 2048 -validity 10000
   base64 -i upload.keystore | pbcopy   # paste into ANDROID_KEYSTORE_BASE64
   ```
2. Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. Add a real `release` `signingConfig` to `android/app/build.gradle` reading
   those from the environment (fall back to `signingConfigs.debug` when unset,
   so local dev keeps working), and set `versionCode` from
   `System.getenv("VERSION_CODE") ?: 1`.
4. Play upload: create a Google Play service account with the *Release manager*
   role, add `PLAY_SERVICE_ACCOUNT_JSON`, and use Fastlane `supply`
   (`track: internal`) after `bundleRelease`. (WIF is a later hardening; start
   with the JSON key.)

### iOS signing + TestFlight

1. Apple Developer + App Store Connect (you have these). Create an ASC API key
   (**Users and Access → Keys**).
2. Create a **private** git repo for `fastlane match` certificates.
3. Secrets: `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
   `APP_STORE_CONNECT_API_KEY_CONTENT` (base64), `APPLE_TEAM_ID`,
   `MATCH_GIT_URL`, `MATCH_PASSWORD`, `MATCH_DEPLOY_KEY` (SSH key for the match
   repo).
4. Fastlane `distribute` lane: `match(type: "appstore")` → `gym(workspace:
   "TwakeDrive.xcworkspace", scheme: "TwakeDrive", export_method: "app-store")`
   → `pilot` (TestFlight). Note the **workspace** (CocoaPods), not a bare
   `.xcodeproj`.

### Other visio-mobile pieces (optional)

- **GitGuardian** secret scan — add `GITGUARDIAN_API_KEY`, add a
  `GitGuardian/ggshield-action` job to `security.yml`.
- **SonarCloud** — add `SONAR_TOKEN` + a `sonar-project.properties`
  (org + projectKey), add a scan workflow.
- **SLSA build provenance** — `actions/attest-build-provenance` on the built
  IPA/AAB (`id-token: write` + `attestations: write`, no secret).
- **Promote Android** — a manual workflow calling Fastlane
  `supply(track_promote_to: "production")`.

## Secrets matrix (phase 2)

| Secret | Used by |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` / `_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Android release signing |
| `PLAY_SERVICE_ACCOUNT_JSON` | Fastlane `supply` → Play |
| `APP_STORE_CONNECT_API_KEY_ID` / `_ISSUER_ID` / `_API_KEY_CONTENT` | ASC / TestFlight |
| `APPLE_TEAM_ID` | iOS signing |
| `MATCH_GIT_URL` / `MATCH_PASSWORD` / `MATCH_DEPLOY_KEY` | Fastlane `match` |
| `GITGUARDIAN_API_KEY` | GitGuardian scan |
| `SONAR_TOKEN` | SonarCloud |
````

- [ ] **Step 2: Proofread**

Confirm no broken headings and that the artifact names in the runbook match the workflow files (`twake-drive-android-apk-<run>`, `twake-drive-ios-simulator-<run>`).

- [ ] **Step 3: Commit**

```bash
git add docs/ci-cd.md
git commit -m "docs(ci): add mobile CI/CD runbook and phase-2 activation guide"
```

---

### Task 6: End-to-end verification on GitHub

**Files:** none (observation + optional fixups).

**Interfaces:**
- Consumes: all four workflows from Tasks 1-4.
- Produces: confirmed-green runs and downloadable, runnable artifacts.

- [ ] **Step 1: Push the branch**

```bash
git push origin feat/android-support
```

- [ ] **Step 2: Confirm PR-triggered workflows started**

The existing PR triggers `ci.yml`, `build-android.yml`, `security.yml`.
```bash
gh run list --branch feat/android-support --limit 10
```
Expected: runs for **CI**, **Build Android (test APK)**, **Security** appear.

- [ ] **Step 3: Watch CI + security to green**

```bash
gh run watch $(gh run list --workflow=ci.yml --branch feat/android-support --limit 1 --json databaseId --jq '.[0].databaseId')
```
Expected: `lint`, `typecheck`, `test` all pass. Resolve any real failure before proceeding. If Trivy fails on a transitive CRITICAL/HIGH, decide: bump the dependency, or make Trivy non-blocking (`exit-code: '0'`) and note it in `docs/ci-cd.md` (open follow-up in the spec).

- [ ] **Step 4: Verify the Android artifact**

Watch the Android run to completion, then:
```bash
gh run download <android_run_id> --name twake-drive-android-apk-<run_number>
adb install app-release.apk   # or an emulator
```
Expected: APK downloads and installs; app launches. Confirm the PR got the "Android test APK" comment.

- [ ] **Step 5: Verify the iOS artifact (manual trigger — iOS skips PRs)**

```bash
gh workflow run build-ios.yml --ref feat/android-support
gh run watch $(gh run list --workflow=build-ios.yml --branch feat/android-support --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download <ios_run_id> --name twake-drive-ios-simulator-<run_number>
unzip TwakeDrive-Simulator.app.zip
xcrun simctl install booted TwakeDrive.app && xcrun simctl launch booted com.linagora.twakedrive
```
Expected: `.app` downloads, installs into a booted Simulator, and launches.

- [ ] **Step 6: If any run needed a fix, commit and re-verify**

Apply the minimal fix, `git commit`, `git push`, and repeat the affected step. Iterate until all four workflows are green and both artifacts are confirmed runnable.

---

## Self-Review

**Spec coverage:**
- `ci.yml` (lint/typecheck/test) → Task 1 ✓
- `build-android.yml` (installable APK + PR comment) → Task 2 ✓
- `build-ios.yml` (Simulator .app, main/dispatch/tags) → Task 3 ✓
- `security.yml` (Trivy fs) → Task 4 ✓
- `docs/ci-cd.md` (runbook + phase-2 guide + secrets matrix) → Task 5 ✓
- Triggers per spec (Android on PR+main+dispatch+tags; iOS on main+dispatch+tags) → Tasks 2, 3 ✓
- No-secret / no-prebuild / JDK 17 / Node 20 / pinned SHAs → Global Constraints, all tasks ✓
- End-to-end verification (artifacts install & run) → Task 6 ✓
- Out-of-scope items (Fastlane, keystore edit, GitGuardian, Sonar, WIF, SLSA) → documented in Task 5, not built ✓

**Placeholder scan:** No TBD/TODO; every file's full content is inline. `<run_number>`, `<android_run_id>`, `<ios_run_id>` are runtime values the operator substitutes in Task 6, not plan gaps.

**Type/name consistency:** Artifact names match between workflows and runbook (`twake-drive-android-apk-<run>`, `twake-drive-ios-simulator-<run>`). Scheme/workspace (`TwakeDrive`/`TwakeDrive.xcworkspace`), app id (`com.linagora.twakedrive`), and the `.app` product path (`Release-iphonesimulator/TwakeDrive.app`) are consistent across Tasks 3, 5, 6. Pinned SHAs identical across all tasks.
