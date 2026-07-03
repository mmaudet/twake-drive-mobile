# Twake Drive Mobile

React Native (Expo) mobile app for Twake Drive — read-only v1.

## Getting started

```bash
npm install --legacy-peer-deps
npm run ios     # iOS simulator (requires Xcode)
npm run android # Android emulator or connected device
```

### Android on a physical device

Android builds require **JDK 17** — Gradle 8.14 / the Android Gradle Plugin fail on
newer JDKs (e.g. JDK 24). Point `JAVA_HOME` at a JDK 17 before building (macOS +
Homebrew `openjdk@17` shown):

```bash
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
npm run android   # builds, installs and launches on the connected device
```

Tip: to cut the first native build time, restrict the ABIs to your device's
architecture, e.g. `ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a npm run android`.

## Tests

```bash
npm test
npm run typecheck
npm run lint
```

## Spec & plan

- Spec: `docs/superpowers/specs/2026-05-01-twake-drive-mobile-design.md`
- Plan: `docs/superpowers/plans/2026-05-01-twake-drive-mobile.md`

## Notes

- Requires Node 20+. The Expo runtime fails on Node 16 (`FormData is not defined`).
- The project uses `npm` (not `yarn`) — `package-lock.json` is the canonical lockfile.
- The cozy-client `useAuth.test.tsx` test uses a manual mock for `cozy-client` because `cozy-stack-client` requires a runtime peer (`cozy-flags`) that isn't currently declared.
- `registerSession.ts` (token exchange) and the revocation event name `'revoked'` are written from spec but **not** validated against a real Twake instance — these need integration testing before shipping.
