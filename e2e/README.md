# Suite E2E Maestro — Twake Drive

Smoke tests E2E **cross-platform** (Android device + simulateur iOS), lancés localement
avant un build signé. Pilotés par [Maestro](https://maestro.mobile.dev/).

## Installation
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash   # installe ~/.maestro/bin/maestro
export PATH="$PATH:$HOME/.maestro/bin"
```
Android : `adb` + un device connecté. iOS : Xcode + un simulateur booté.

## Setup (une fois)
Les flows assument une **session pré-authentifiée** (le login OIDC + code email n'est pas
automatisé — cf. `flows/00-login.yaml`, exclu des runs).
1. Lancer l'app et se connecter à la main (device / simulateur).
2. iOS simulateur : installer un build **avec le fix keychain fallback** (sinon SecureStore
   échoue sur build non-signé — voir DEVICE-NOTES). Build : `gh workflow run build-ios.yml`.
3. Le compte doit avoir ≥1 dossier à la racine (les flows 01/03 en dépendent).

## Lancer
```bash
npm run e2e:ios       # simulateur iOS (flows in-app)
npm run e2e:android   # device Android (in-app + cross-app File Provider/Share)
# un flow ciblé (toujours cibler la plateforme si 2 devices connectés) :
maestro --platform ios test e2e/maestro/flows/in-app/02-tabs.yaml
```

## Sélection du device (piège)
Avec **deux devices connectés**, `maestro test` en auto-sélectionne un (souvent l'Android).
**Toujours** `--platform ios|android` ou `--udid <UDID>`. Les run-scripts le font.

## Sélecteurs cross-platform
Les labels/accessibilité diffèrent iOS↔Android. Règles (détail dans `DEVICE-NOTES.md`) :
- Onglets / dossiers : regex texte `{ text: 'Récents.*' }`, `{ text: 'nom.*' }`.
- Boutons / champs : **testIDs** (`appbar-search-button`, `drive-fab`, `search-input`…).
- Retour : `{ id: 'appbar-back-button' }` (pas de `pressKey: Back` — iOS n'a pas de retour matériel).

## Structure
```
e2e/
  maestro/
    config.yaml           # exclut le login des runs
    subflows/             # assertLoggedIn, openDrive, cleanup
    flows/
      00-login.yaml       # tag login (semi-manuel, exclu)
      00-welcome.yaml     # tag preauth (app boot + login form)
      in-app/             # tags inapp (iOS + Android) : 01-07
      android/            # tags android : 10 File Provider, 11 Share
  scripts/                # run-android.sh, run-ios.sh
  fixtures/               # sample.jpg (share)
  DEVICE-NOTES.md         # resultats device + recette + quirks
```

## Statut & périmètre
Voir `DEVICE-NOTES.md`. En bref : 01-04 + 00-welcome **verts cross-platform** ; 10 File
Provider **vert Android** ; 05/06 (preview/éditeur) et 07 (offline-pin iOS) + 11 (Share auto)
= à finaliser (fixtures / sélecteurs). Le fix keychain fallback débloque l'**auth iOS sur
simulateur sans device réel**.
