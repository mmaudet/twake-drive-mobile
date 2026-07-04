# Suite de tests E2E — design (smoke pré-release, local)

- **Date** : 2026-07-04
- **Statut** : design validé, en attente de plan d'implémentation
- **Branche** : `feat/e2e-maestro`

## 1. Contexte & objectif

Twake Drive mobile (Expo ~54 / React Native / expo-router, cozy-client + PouchDB)
dispose déjà d'une couverture **unitaire** solide (76 fichiers Jest + Testing
Library + nock) et d'une CI (lint / typecheck / test + builds APK/IPA + pipeline
de release signé fastlane).

Il **manque le niveau end-to-end** : lancer l'app réelle sur un device/simulateur
et valider les parcours utilisateur, y compris les parcours **cross-app** propres
à Twake Drive (parcourir le drive depuis un gestionnaire de fichiers via le
File Provider / SAF, et recevoir un partage via le share sheet de l'OS).

Objectif : une **suite de smoke tests E2E lancée localement avant chaque build
signé**, pour gagner en confiance sur les parcours critiques. Pas de barrière CI
ni de device farm à ce stade.

## 2. Découverte structurante : état des extensions natives iOS

Le projet Xcode (`ios/TwakeDrive.xcodeproj`) ne contient qu'**une seule cible :
`TwakeDrive`** (l'app principale). **Aucune extension File Provider ni Share.**
C'est cohérent avec l'assessment de portage iOS : Share + File Provider =
extensions natives + App Group + signature de code, non encore réalisées (« le
verrou »).

Côté Android au contraire, `TwakeDocumentsProvider.kt` (SAF) et le share sont
mergés dans `main`.

**Conséquence sur le périmètre :**

| Volet | Android (device adb) | iOS (simulateur) |
|-------|----------------------|------------------|
| In-app (navigation, recherche, CRUD, preview, éditeur, offline) | ✅ | ✅ |
| File Provider / SAF (cross-app) | ✅ | ❌ extension inexistante |
| Share to Drive (cross-app) | ✅ | ❌ extension inexistante |

→ Le cross-app n'est testable que sur **Android** aujourd'hui. iOS = **in-app
uniquement**. Les flows cross-app seront réactivables sur iOS le jour où les
extensions existeront (simple ajout de tag, cf. §5).

## 3. Décisions

| Décision | Choix | Raison |
|----------|-------|--------|
| Portée / exécution | **Smoke test pré-release, local** | Colle à « maintenant qu'on aura des versions signées » ; zéro infra CI/device |
| Cibles | Device Android via **adb** + **simulateur iOS** | Ce que possède l'utilisateur |
| Authentification | **Pré-authentifié** (session réutilisée) | Le login OIDC + **code email** flagship est impossible à automate proprement dans un smoke test |
| Framework | **Maestro** | Seul option légère **cross-app** (UIAutomator/XCUITest OS-level) couvrant les 3 volets, sans instrumenter l'app, sur device adb + simulateur |
| Alternatives écartées | Detox (pas de cross-app → exclut file provider + share) ; Appium (lourd/verbeux, overkill) | |

## 4. Architecture

### 4.1 Arborescence

```
e2e/
  maestro/
    config.yaml                 # config workspace Maestro (globs, tags par défaut)
    subflows/                   # flows réutilisables via runFlow
      assertLoggedIn.yaml       # échoue tôt et clairement si session absente
      openDrive.yaml            # amène l'app sur la racine du drive
      cleanup.yaml              # supprime les artefacts de test résiduels
    flows/
      00-login.yaml             # tag: login — semi-manuel (pause code email)
      in-app/                   # tags: inapp (Android + iOS)
        01-launch-browse.yaml
        02-tabs.yaml
        03-search.yaml
        04-folder-crud.yaml
        05-preview.yaml
        06-editor.yaml
        07-offline-pin.yaml
      android/                  # tags: android (device uniquement)
        10-fileprovider-browse.yaml
        11-share-to-drive.yaml
  scripts/
    run-android.sh
    run-ios.sh
  README.md
```

### 4.2 Identifiants & config

- `appId` unique pour les deux plateformes : **`com.linagora.twakedrive`**
  (défini dans le header de chaque flow).
- **Tags** portés par chaque flow : `inapp`, `android`, `login`.
- Sélection à l'exécution via `--include-tags` / `--exclude-tags` (un flow
  s'exécute s'il possède **au moins un** des tags inclus).

### 4.3 Stratégie d'authentification (pré-authentifié)

- Les flows in-app et cross-app **assument une session active** ; ils démarrent
  par le subflow `assertLoggedIn` qui échoue immédiatement avec un message clair
  si l'app n'est pas connectée (plutôt qu'un échec obscur en milieu de parcours).
- Le login réel est isolé dans `00-login.yaml` (tag `login`, **exclu du run
  automatique**) : il remplit l'URL/email puis **marque une pause pour la saisie
  manuelle du code email** (Maestro ne peut pas lire l'email), et vérifie
  l'arrivée sur le drive. Sert à (re)créer la session pré-auth quand elle expire.

### 4.4 Données de test & idempotence

- Les flows sont **auto-nettoyants** : `04-folder-crud` crée puis supprime son
  dossier « E2E-smoke ». Aucun résidu ne doit polluer le compte pré-authentifié.
- `subflows/cleanup.yaml` supprime tout artefact résiduel d'un run interrompu.
- Un fichier image de test est poussé sur le device via `adb push` par
  `run-android.sh` pour alimenter le flow de share.

## 5. Catalogue des flows (smoke = happy paths)

### Volet 1 — In-app (tags `inapp`, Android + iOS)

| # | Flow | Étapes clés | Vérifie |
|---|------|-------------|---------|
| 01 | launch-browse | lancement → drive → entrer dans un dossier → retour breadcrumb | navigation de base |
| 02 | tabs | ouvrir Récents / Favoris / Corbeille | chargement des vues |
| 03 | search | ouvrir recherche → taper une requête → résultats → ouvrir un résultat | feature recherche |
| 04 | folder-crud | créer dossier « E2E-smoke » → vérifier présence → supprimer | CRUD round-trip auto-nettoyant |
| 05 | preview | ouvrir un fichier image/PDF → preview affiché | rendu preview |
| 06 | editor | ouvrir une note / doc OnlyOffice → écran éditeur chargé (header + webview) | chemin flagship session_code (shallow) |
| 07 | offline-pin | épingler un fichier hors-ligne → badge visible | feature offline |

### Volet 2 — File Provider / SAF (tag `android`, device uniquement)

| # | Flow | Étapes clés | Vérifie |
|---|------|-------------|---------|
| 10 | fileprovider-browse | déclencher un sélecteur de documents (ACTION_OPEN_DOCUMENT) → choisir la source « Twake Drive » → parcourir les dossiers → sélectionner un fichier → vérifier le retour | `TwakeDocumentsProvider` en cross-app |

### Volet 3 — Share to Drive (tag `android`, device uniquement)

| # | Flow | Étapes clés | Vérifie |
|---|------|-------------|---------|
| 11 | share-to-drive | ouvrir Galerie/Photos → sélectionner une image → Partager → choisir « Twake Drive » dans le share sheet → FolderPicker in-app → choisir un dossier → upload → confirmation | réception de partage cross-app |

### Login (tag `login`, hors run automatique)

| # | Flow | Étapes clés |
|---|------|-------------|
| 00 | login | remplir URL/email → **pause saisie manuelle du code email** → arrive sur le drive |

## 6. Exécution

- `./e2e/scripts/run-android.sh`
  - localise/build l'APK, `adb install -r` sur le device connecté,
  - `adb push` de l'image de test,
  - `maestro test e2e/maestro/flows --include-tags inapp,android --exclude-tags login`.
- `./e2e/scripts/run-ios.sh`
  - boot du simulateur + install du `.app`,
  - `maestro test e2e/maestro/flows --include-tags inapp --exclude-tags login`
    (in-app uniquement).

La sélection par tags permet **une seule base de flows** avec un gating
plateforme propre. Réactiver le cross-app iOS = ajouter le tag `ios` aux flows
10/11 le jour venu.

## 7. Changements dans le code applicatif (petits, ciblés)

Maestro sélectionne les éléments par texte / accessibilité / id. Aujourd'hui
seuls **8 composants sur 102** portent un `testID`. Pour des sélecteurs stables,
ajouter une poignée de `testID` sur les éléments-clés des parcours :

- liste de fichiers + item fichier/dossier (FileRow / FolderRow / FileGridItem)
- champ de recherche + item de résultat
- bouton « créer un dossier » + champ de nom
- FolderPicker (item dossier + bouton de confirmation)
- bouton/action d'upload + confirmation
- badge offline (PinnedBadge)

C'est le **seul** changement dans le code de l'app. Les `testID` React Native se
mappent en `accessibilityIdentifier` (iOS) et sont exposés à UIAutomator
(Android), donc utilisables identiquement par Maestro sur les deux plateformes.

## 8. Points à valider en implémentation

Ces détails n'affectent pas le design mais devront être tranchés en codant :

- **Déclenchement du sélecteur SAF (flow 10)** : `adb shell am start -a
  android.intent.action.OPEN_DOCUMENT -t '*/*'` comme mécanisme primaire, appli
  « Files » comme repli. Confirmer le libellé de la source « Twake Drive » dans
  le picker.
- **Déclenchement du share (flow 11)** : app galerie déterministe + libellé exact
  « Twake Drive » dans le share sheet (variable selon l'OEM). Prévoir un repli via
  `am start -a android.intent.action.SEND`.
- **Flow éditeur (06)** : rester *shallow* (l'écran se charge), car il dépend du
  backend + de la certification flagship session_code.
- **Version d'APK** : jouer sur un build proche de la release (les `testID` sont
  présents en release aussi, contrairement aux hooks de dev).

## 9. Hors-scope (explicite)

- **iOS cross-app** (File Provider + Share) — extensions natives inexistantes.
- **Barrière CI / device farm** — les flows sont déjà tagués pour un branchement
  ultérieur (macOS runner pour le simulateur iOS + runner self-hosted/farm pour
  le device Android).
- Édition profonde OnlyOffice, tests de performance, tests de synchro PouchDB.

## 10. Critères de succès

- `run-android.sh` et `run-ios.sh` exécutables d'une commande, sur device adb /
  simulateur respectivement.
- Volet in-app vert sur les deux plateformes ; volets file provider + share verts
  sur Android.
- Suite rejouable sans polluer le compte (idempotence).
- Un échec produit un message et une trace (screenshot Maestro) exploitables.
