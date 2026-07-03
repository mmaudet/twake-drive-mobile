# Mobile CI & Build Automation — Design

- **Date:** 2026-07-02
- **Branch:** `feat/android-support`
- **Status:** Approved (design), pending implementation plan
- **Reference:** CI/build work in `github.com/mmaudet/visio-mobile` (ported/adapted)

## Goal

Structure GitHub Actions so iOS and Android **dev/test artifacts** are built
automatically. Testers download an installable build from each CI run — no
manual local builds.

## Constraints (hard)

- **No code signing.** No release keystore, no Apple certificates/provisioning.
- **No secrets.** Workflows must run green using only the built-in
  `GITHUB_TOKEN` (which is not a user-managed secret).
- **No `expo prebuild`.** The `android/` and `ios/` native projects are
  committed and hand-maintained; CI builds them in place. (Project memory:
  *never full-prebuild the committed android/*.)
- **JDK 17** for Android (Gradle 8.14.3; default JDK 24 breaks Gradle).

## Project facts (verified)

- Expo SDK 54, React Native 0.81.5, React 19.1.0. Bare workflow (native dirs
  committed). No EAS.
- App id `com.linagora.twakedrive` (both platforms).
- iOS: `ios/TwakeDrive.xcworkspace` + `Podfile`/`Podfile.lock` (CocoaPods),
  shared scheme `TwakeDrive` (`ios/TwakeDrive.xcodeproj/xcshareddata/xcschemes/TwakeDrive.xcscheme`).
- Android: `android/app/debug.keystore` is **committed and tracked**, and the
  `release` build type already points at `signingConfigs.debug`. Therefore
  `./gradlew assembleRelease` yields a **standalone, debug-signed, installable
  APK with the JS bundle embedded** — no secret, no `build.gradle` edit.
- `npm ci` runs `patch-package` via `postinstall` (patches in `patches/`).
- `package.json` scripts: `lint` (eslint), `typecheck` (tsc --noEmit),
  `test` (jest).
- No `.nvmrc`, no `engines`, no `CHANGELOG.md`.

## Scope

### Phase 1 — build now (this PR)

Automated, secret-free, unsigned dev/test artifacts + fast PR checks.

Five files:

```
.github/workflows/ci.yml            # lint · typecheck · jest
.github/workflows/build-android.yml # → app-release.apk (installable anywhere)
.github/workflows/build-ios.yml     # → TwakeDrive.app (iOS Simulator)
.github/workflows/security.yml      # Trivy filesystem scan (no secret)
docs/ci-cd.md                       # runbook + phase-2 activation guide
```

Nothing touches the committed native projects. No Fastlane, no Gemfile, no
keystore, no `build.gradle` edit.

### Phase 2 — documented, NOT built now

Everything requiring a secret or real signing is written up in `docs/ci-cd.md`
as a ready-to-activate runbook (ported from visio-mobile), so the reference
work is preserved:

- Android release signing (upload keystore) + Fastlane `supply` → Play internal.
- iOS Fastlane `match` + `gym` (workspace) + `pilot` → TestFlight; `deliver`.
- `promote-android` (internal → production).
- GitGuardian secret scanning (needs `GITGUARDIAN_API_KEY`).
- SonarCloud (needs `SONAR_TOKEN` + project).
- Workload Identity Federation, SLSA build provenance.

> Note: GitGuardian and SonarCloud were requested earlier but each needs a
> token; under the "no secrets" constraint they move to phase 2. **Trivy stays
> in phase 1** because it needs no secret.

## Architecture — Phase 1

### Common conventions

- Node 20 (LTS; Expo 54 supports Node 20+), `npm ci` with npm cache keyed on
  `package-lock.json`.
- Third-party actions pinned to immutable SHAs (reuse visio-mobile's vetted
  pins): `actions/checkout@…#v6`, `actions/setup-node@…#v6`,
  `actions/setup-java@…#v5`, `actions/upload-artifact@…#v7`,
  `aquasecurity/trivy-action`, `gradle/actions/setup-gradle`,
  `actions/github-script`.
- `concurrency: { group: <workflow>-<ref>, cancel-in-progress: true }` on each
  workflow so re-pushes cancel superseded runs.
- Minimal `permissions:` per workflow (least privilege).

### `ci.yml`

- **Triggers:** `pull_request` (all), `push` → `main`, `workflow_dispatch`.
- **Permissions:** `contents: read`.
- **Jobs (parallel):** `lint` (`npm run lint`), `typecheck`
  (`npm run typecheck`), `test` (`npm test`). Each: checkout → setup-node 20 +
  cache → `npm ci` → run script. ubuntu-latest.

### `build-android.yml`

- **Triggers:** `pull_request` (all), `push` → `main`, `workflow_dispatch`,
  `push` tags `v[0-9]+.[0-9]+.[0-9]+*`.
- **Permissions:** `contents: read`, `pull-requests: write` (for the PR comment
  step below).
- **Runner:** ubuntu-24.04, `timeout-minutes: 30`.
- **Steps:** checkout → setup-java 17 (temurin) → setup-node 20 + cache →
  `gradle/actions/setup-gradle` (Gradle cache) → `npm ci` →
  `./gradlew assembleRelease --no-daemon` (working-directory `android`) →
  locate `android/app/build/outputs/apk/release/app-release.apk` →
  `upload-artifact` (name `twake-drive-android-<run_number>-<sha8>`,
  retention 14 days) → **(PR only)** comment the run URL on the PR via
  `actions/github-script`.
- Relies on the runner's preinstalled Android SDK/NDK/CMake for any native
  module compilation (reanimated, op-sqlite, quick-crypto, nitro-modules).
  First CI run validates this; pin an NDK version only if the build asks for one.

### `build-ios.yml`

- **Triggers:** `push` → `main`, `workflow_dispatch`, `push` tags `v…`.
  **Not** on every PR (macOS minutes cost ~10×).
- **Permissions:** `contents: read`.
- **Runner:** macos-15, `timeout-minutes: 45`. Runner default Xcode (16.x — RN
  0.81 requires Xcode 16+); no explicit `xcode-select` unless a run needs it.
- **Steps:** checkout → setup-node 20 + cache → `npm ci` → cache `ios/Pods`
  keyed on `Podfile.lock` → `pod install` (working-directory `ios`) →
  `xcodebuild -workspace ios/TwakeDrive.xcworkspace -scheme TwakeDrive
  -configuration Release -sdk iphonesimulator -derivedDataPath ios/build
  CODE_SIGNING_ALLOWED=NO build` → `ditto -c -k --keepParent
  ios/build/Build/Products/Release-iphonesimulator/TwakeDrive.app
  TwakeDrive-Simulator.app.zip` → `upload-artifact` (name
  `twake-drive-ios-sim-<run_number>-<sha8>`, retention 14 days).
- Release configuration ⇒ JS bundle embedded ⇒ standalone `.app` (no Metro).

### `security.yml`

- **Triggers:** `pull_request` (all), `push` → `main`.
- **Permissions:** `contents: read`.
- **Job `trivy-fs`:** `aquasecurity/trivy-action` `scan-type: fs`,
  `scanners: vuln`, `severity: CRITICAL,HIGH`, `ignore-unfixed: true`,
  `exit-code: 1` (blocking, matching visio-mobile). Tunable to non-blocking if
  transitive findings prove noisy — noted in the runbook.
- Drops visio-mobile's Docker-image Trivy job (no Dockerfiles here).

### `docs/ci-cd.md`

Runbook covering:

1. What each workflow does and when it runs.
2. **Getting a test build:** open the Actions run → Artifacts → download.
   - Android: `adb install twake-drive-<run>.apk` (or "unknown sources" on
     device).
   - iOS: unzip → `xcrun simctl install booted TwakeDrive.app` (or drag onto a
     booted Simulator).
3. **Phase-2 activation** (the visio-mobile port), each with its exact secrets:
   Android keystore + `supply`/Play; iOS `match` + `gym` + `pilot`/TestFlight;
   `promote-android`; GitGuardian; SonarCloud; WIF; SLSA provenance.
4. Secrets matrix table (phase-2).

## Honest constraints (consequences of "no signing")

- **iOS artifact is Simulator-only.** No signing ⇒ cannot install on physical
  iPhones; device/TestFlight distribution is strictly phase 2. The iOS job's
  phase-1 value is automated macOS compile verification + a Simulator build QA
  can run.
- **Android APK installs on real devices** (debug-signed); testers enable
  "install from unknown sources."

## Out of scope (YAGNI)

- Rust / UniFFI / WebRTC machinery (visio-specific).
- Conventional-commit and CHANGELOG gates (not requested).
- Version-string unification (`package.json` 1.0.0 vs `app.json`/gradle 0.1.0)
  — flagged as a follow-up, not touched here.
- `versionCode`/build-number bumping (only relevant once builds hit stores).

## Verification approach

- YAML validity + job graph review before pushing.
- Push branch → confirm each workflow starts on the expected trigger.
- `ci.yml`: all three jobs green (they wrap existing passing npm scripts).
- `build-android.yml`: APK artifact present and installs on a device/emulator.
- `build-ios.yml`: `.app` artifact present and boots in the iOS Simulator.
- `security.yml`: Trivy runs (blocking posture confirmed / tuned).

## Open follow-ups

- Decide blocking vs non-blocking Trivy after first real run.
- Version unification across `package.json` / `app.json` / gradle / Info.plist.
- Phase-2 kickoff once signing infra (match repo, Play service account) exists.
