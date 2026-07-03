# Signed release pipeline (iOS TestFlight + Android Firebase/Play)

Modeled on visio-mobile's fastlane setup, adapted to twake-drive-mobile. Two
GitHub Actions workflows produce **signed** artifacts and distribute them:

| Workflow | Trigger | Does |
|---|---|---|
| `.github/workflows/release-ios.yml` | tag `vX.Y.Z` + manual dispatch | `pod install` → fastlane `ios distribute`: match (App Store certs/profiles) → `gym` (signed IPA) → `pilot` (TestFlight). Optional `ios release` (App Store metadata). |
| `.github/workflows/release-android.yml` | tag `vX.Y.Z` + manual dispatch | decode keystore → fastlane `android distribute`: `assembleRelease` (signed APK) → Firebase App Distribution. Optional `android release` (AAB → Play internal). Attaches the APK to a GitHub Release. |

The **unsigned** CI builds (`build-ios.yml`, `build-android.yml`) still run on
PRs / `main` for fast feedback; they no longer run on tags (the signed workflows
own tags). Android's env-driven signing config falls back to the committed debug
keystore, so the secret-free PR test-APK build is unchanged.

**Version scheme:** marketing version = the git tag (`v0.2.0` → `0.2.0`, injected
into iOS `MARKETING_VERSION` and Android `versionName`); build number = the CI
`run_number` (monotonic; iOS `CFBundleVersion`, Android `versionCode`).

---

## One-time setup

### 1. Apple Developer portal (team `KUT463DS29`)
1. **App ID** `com.linagora.twakedrive` (explicit) — enable the **App Groups**
   capability.
2. **App Group** `group.com.linagora.twakedrive`.
3. *(Forward-looking, for the Phase 2 extensions — safe to create now)* extension
   App IDs, each with App Groups enabled and joined to the group above:
   `com.linagora.twakedrive.ShareExtension`, `com.linagora.twakedrive.FileProvider`.
4. **App Store Connect**: create the app record for `com.linagora.twakedrive`, and
   a TestFlight **external** group named **`Beta Testers`** (matches the Fastfile).

### 2. Seed fastlane match (reuses visio's cert — same team)
From a machine with the match repo access, seed twake's profiles into the
**existing** match repo (only new profiles are added; the team's single Apple
Distribution cert is reused):
```bash
cd ios
MATCH_PASSWORD=… fastlane match appstore \
  --git_url <MATCH_GIT_URL> \
  --app_identifier "com.linagora.twakedrive"
# In Phase 2, re-run with the extension app ids appended (comma-separated).
```

### 3. Generate the twake Android keystore (do NOT reuse visio's)
```bash
keytool -genkeypair -v -keystore twake-drive-release.keystore \
  -alias twakedrive -keyalg RSA -keysize 2048 -validity 10000
```
Store it + its passwords in your password manager. **Losing this key means you
can never update the app on Google Play.**

### 4. Firebase / Google Play
- Register the Android app `com.linagora.twakedrive` in the Firebase project →
  copy its **App ID** (`FIREBASE_APP_ID`).
- Ensure the GCP **service account** has *Firebase App Distribution Admin* (and,
  for Play uploads, Play Console access). Same SA as visio if the project is shared.
- Play only: create the app in Play Console and upload the **first** AAB manually
  (Play requires the initial upload via the console; `supply` handles the rest).

---

## Set the GitHub secrets

Values can't be read back from GitHub, so you set them from your machine:
```bash
cp .release-secrets.env.example .release-secrets.env   # gitignored
$EDITOR .release-secrets.env                           # fill in (see notes in the file)
scripts/setup-release-secrets.sh                       # gh secret set … for each
gh secret list --repo mmaudet/twake-drive-mobile       # verify names
```

**Secret inventory**

| Secret | Scope | Source |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | twake | base64 of the keystore from step 3 (script does it) |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | twake | from step 3 |
| `FIREBASE_APP_ID` | twake | Firebase console (step 4) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | shared w/ visio | base64 of the GCP SA json (script does it) |
| `APPLE_TEAM_ID` | shared | `KUT463DS29` |
| `APP_STORE_CONNECT_API_KEY_ID` / `_ISSUER_ID` / `_API_KEY_CONTENT` | shared | App Store Connect API key (same as visio) |
| `MATCH_GIT_URL` / `MATCH_PASSWORD` / `MATCH_DEPLOY_KEY` | shared | the match repo (same as visio) |

---

## Cut a release
```bash
git checkout main && git pull fork main
scripts/release.sh 0.2.0        # bumps package.json + app.json, tags v0.2.0, offers to push
```
Pushing `v0.2.0` triggers both signed workflows. Watch them:
```bash
gh run list --repo mmaudet/twake-drive-mobile
```
To build without a tag (e.g. a one-off beta), use **Run workflow** on
`release-ios.yml` / `release-android.yml` (manual dispatch), with optional
`release_notes` and the `publish_to_*` toggles.

---

## Notes & gotchas
- **App Group entitlement is NOT added yet.** The main-app IPA doesn't need it;
  it's added in **Phase 2** with the Share Extension + File Provider (adding it now
  without the matching provisioning would break signing). The portal steps above
  register the group so Phase 2 is unblocked.
- **iOS versioning:** `increment_build_number` / `increment_version_number` use
  `agvtool`, which needs the project on *Apple Generic* versioning (Expo default).
  If a build errors "No values were found for versioning", set **Versioning System
  = Apple Generic** in the target's Build Settings.
- **TestFlight external testing** requires the build to clear Beta App Review the
  first time, and the `Beta Testers` group to exist. For a purely internal first
  pass, set `distribute_external: false` in `ios/fastlane/Fastfile`.
- `ruby/setup-ruby@v1` is unpinned (as in visio). If the Trivy misconfig scan flags
  it, pin it to a commit SHA.
