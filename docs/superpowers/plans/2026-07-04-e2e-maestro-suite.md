# Suite E2E Maestro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une suite de smoke tests E2E Maestro, lancée localement avant chaque build signé, couvrant les parcours in-app (Android device + simulateur iOS) et les parcours cross-app File Provider/SAF + Share (Android uniquement).

**Architecture:** Maestro (YAML, boîte-noire OS-level) pilote l'app installée via son `appId`. Les flows assument une session **pré-authentifiée** et référencent des éléments par `testID` (ajoutés au code) + libellés FR à l'écran. Sélection des flows par **tags** (`inapp` / `android` / `login`) pour le gating plateforme. Deux scripts de run (`run-android.sh`, `run-ios.sh`) installent l'artefact et lancent le sous-ensemble adéquat.

**Tech Stack:** Maestro CLI · React Native / Expo (testIDs en pur JS, aucun `prebuild`) · Jest + @testing-library/react-native (tests des testIDs) · adb (Android) / `xcrun simctl` (iOS Simulator).

## Global Constraints

- **appId (2 plateformes) :** `com.linagora.twakedrive` — copié verbatim dans chaque flow.
- **Pré-authentifié :** les flows assument une session active. Le login email-code n'est **jamais** automatisé ; `00-login.yaml` (tag `login`) est un helper semi-manuel **exclu** de tout run automatique (`--exclude-tags login`).
- **Langue device = FRANÇAIS.** En Jest, `t()` renvoie la **clé brute** → les tests assertent les clés. Sur device, `t()` renvoie la **chaîne FR** → les flows Maestro assertent les chaînes FR. Ne jamais mélanger.
- **Convention testID :** kebab-case, préfixé par zone (`area-element`), ex. `file-row`, `folder-picker-confirm`. Les primitives React Native Paper (`List.Item`, `Searchbar`, `Button`, `TextInput`, `Appbar.Action`, `WebView`, `VideoView`) forwardent `testID` à leur racine.
- **Périmètre plateforme :** Android = tags `inapp` + `android` (3 volets). iOS = tag `inapp` seulement (extensions File Provider / Share inexistantes).
- **Jamais `expo prebuild`.** Les testIDs sont du pur JS (aucun changement natif) ; Maestro n'exige aucune modif native. Le manifest Android chirurgical est préservé.
- **Local uniquement.** Pas de CI dans ce plan (flows déjà tagués pour un branchement ultérieur).
- **Pré-auth persistante :** ne jamais désinstaller entre deux runs. Android = `adb install -r` (conserve les données). iOS = ne pas effacer le simulateur.
- **Fixtures attendues dans le compte pré-authentifié** (créées une fois, cf. README) : au moins 1 dossier à la racine, `sample.jpg` (image), `sample.pdf`, `sample.docx` (fichier Office). Les flows les référencent par env avec ces valeurs par défaut.

---

### Task 1: Scaffolding & tooling

Crée toute l'arborescence E2E, la config Maestro, les scripts de run (squelettes fonctionnels), les fixtures et les scripts npm. Aucun flow encore.

**Files:**
- Create: `e2e/maestro/config.yaml`
- Create: `e2e/maestro/fixtures.env`
- Create: `e2e/scripts/run-android.sh`
- Create: `e2e/scripts/run-ios.sh`
- Create: `e2e/fixtures/.gitkeep`
- Create: `e2e/README.md` (stub, complété en Task 16)
- Modify: `package.json` (bloc `scripts`)

**Interfaces:**
- Produces: la structure `e2e/` et les scripts `npm run e2e:android|e2e:ios|e2e:login`, consommés par toutes les tâches suivantes.

- [ ] **Step 1: Installer Maestro (une fois, sur la machine)**

Run: `curl -Ls "https://get.maestro.mobile.dev" | bash` puis rouvrir le terminal.
Verify: `maestro --version`
Expected: un numéro de version s'affiche (ex. `1.39.x`).

- [ ] **Step 2: Créer la config workspace Maestro**

`e2e/maestro/config.yaml` :
```yaml
# Config workspace Maestro. Le login manuel est exclu par défaut de tout run.
flows:
  - "flows/**"
excludeTags:
  - login
```

- [ ] **Step 3: Créer le fichier de noms de fixtures**

`e2e/maestro/fixtures.env` :
```bash
# Noms des fixtures attendues à la racine du drive pré-authentifié.
SEARCH_QUERY=sample
PREVIEW_IMAGE=sample.jpg
PREVIEW_PDF=sample.pdf
EDITOR_FILE=sample.docx
FOLDER_NAME=E2E-smoke
```

- [ ] **Step 4: Créer `run-android.sh`**

`e2e/scripts/run-android.sh` :
```bash
#!/usr/bin/env bash
set -euo pipefail
# Smoke E2E local sur device Android (adb). Pré-requis : app installée ET
# déjà connectée (cf. e2e/README.md). Ne désinstalle jamais (garde la session).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

DEVICE="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
[ -z "${DEVICE:-}" ] && { echo "Aucun device adb connecté."; exit 1; }
echo "Device: $DEVICE"

# (Ré)installation optionnelle sans effacer les données (-r conserve la session)
if [ -n "${APK_PATH:-}" ]; then
  echo "Installation de $APK_PATH (données conservées)…"
  adb -s "$DEVICE" install -r "$APK_PATH"
fi

# Seed l'image de fixture pour le flow de share
adb -s "$DEVICE" shell mkdir -p /sdcard/Pictures/E2E >/dev/null 2>&1 || true
adb -s "$DEVICE" push "$ROOT/e2e/fixtures/sample.jpg" /sdcard/Pictures/E2E/sample.jpg
adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Pictures/E2E/sample.jpg >/dev/null

# Volets in-app + android cross-app ; le login manuel est exclu.
maestro test "$ROOT/e2e/maestro/flows" \
  --include-tags inapp,android \
  --exclude-tags login
```

- [ ] **Step 5: Créer `run-ios.sh`**

`e2e/scripts/run-ios.sh` :
```bash
#!/usr/bin/env bash
set -euo pipefail
# Smoke E2E local sur simulateur iOS (in-app uniquement : pas d'extension
# File Provider / Share native). Pré-requis : app installée ET connectée.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM="${SIMULATOR:-booted}"

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true

if [ -n "${APP_PATH:-}" ]; then
  echo "Installation de $APP_PATH sur le simulateur…"
  xcrun simctl install "$SIM" "$APP_PATH"
fi

maestro test "$ROOT/e2e/maestro/flows" \
  --include-tags inapp \
  --exclude-tags login
```

- [ ] **Step 6: Rendre les scripts exécutables + stub README + .gitkeep**

Run:
```bash
chmod +x e2e/scripts/run-android.sh e2e/scripts/run-ios.sh
touch e2e/fixtures/.gitkeep
printf '# Suite E2E Maestro\n\nÀ compléter (Task 16).\n' > e2e/README.md
```

- [ ] **Step 7: Ajouter les scripts npm**

Dans `package.json`, ajouter au bloc `"scripts"` :
```json
"e2e:android": "./e2e/scripts/run-android.sh",
"e2e:ios": "./e2e/scripts/run-ios.sh",
"e2e:login": "maestro test e2e/maestro/flows/00-login.yaml"
```

- [ ] **Step 8: Vérifier la structure**

Run: `ls -R e2e && npm run 2>/dev/null | grep e2e`
Expected: l'arborescence `e2e/maestro`, `e2e/scripts`, `e2e/fixtures` existe ; les 3 scripts `e2e:*` sont listés.

- [ ] **Step 9: Commit**

```bash
git add e2e package.json
git commit -m "chore(e2e): scaffold Maestro workspace, run scripts and npm tasks"
```

---

### Task 2: testIDs sur FileRow / FolderRow

Expose des sélecteurs stables sur les lignes de fichiers/dossiers, leurs menus d'actions, et le badge offline.

**Files:**
- Modify: `src/ui/FileRow.tsx` (Props 33–52 ; `List.Item` L96 ; `IconButton` L126 ; `<PinnedBadge>` L111)
- Modify: `src/ui/FolderRow.tsx` (Props 40–58 ; `List.Item` L92 ; `IconButton` L128 ; `<PinnedBadge>` L107)
- Test: `src/ui/FileRow.test.tsx`, `src/ui/FolderRow.test.tsx`

**Interfaces:**
- Produces: testIDs `file-row`, `folder-row`, `file-actions`, `folder-actions`, `pinned-badge` — consommés par les flows 01, 04, 05, 07.

- [ ] **Step 1: Écrire le test qui échoue (FileRow)**

Dans `src/ui/FileRow.test.tsx`, ajouter un cas qui réutilise le fixture `file` et le render déjà présents dans le fichier :
```tsx
it('expose des testIDs pour Maestro', () => {
  render(wrap(<FileRow {...baseProps} testID="file-row" />));
  expect(screen.getByTestId('file-row')).toBeOnTheScreen();
  expect(screen.getByTestId('file-actions')).toBeOnTheScreen();
});
```
> `baseProps` = l'objet de props déjà utilisé par les autres `it()` de ce fichier (au minimum `file` + les handlers `onPress`, `onShare`, …). Réutilise-le tel quel.

- [ ] **Step 2: Lancer le test — échec attendu**

Run: `npx jest src/ui/FileRow.test.tsx -t "testIDs pour Maestro"`
Expected: FAIL (`Unable to find an element with testID: file-row`).

- [ ] **Step 3: Implémenter (FileRow)**

Dans `src/ui/FileRow.tsx` :
1. Props (bloc 33–52) : ajouter `testID?: string;`
2. Déstructuration des props (~L65) : ajouter `testID,`
3. `List.Item` (L96) : ajouter l'attribut `testID={testID}`
4. `IconButton` du menu 3-points (L126) : ajouter `testID="file-actions"`
5. `<PinnedBadge>` (L111) : passer `testID="pinned-badge"`

- [ ] **Step 4: Lancer le test — succès attendu**

Run: `npx jest src/ui/FileRow.test.tsx -t "testIDs pour Maestro"`
Expected: PASS.

- [ ] **Step 5: Répliquer sur FolderRow**

Dans `src/ui/FolderRow.tsx` : `testID?: string` aux Props (40–58), déstructurer, `testID={testID}` sur `List.Item` (L92), `testID="folder-actions"` sur l'`IconButton` (L128), `testID="pinned-badge"` sur `<PinnedBadge>` (L107).
Dans `src/ui/FolderRow.test.tsx`, ajouter :
```tsx
it('expose des testIDs pour Maestro', () => {
  render(wrap(<FolderRow {...baseProps} testID="folder-row" />));
  expect(screen.getByTestId('folder-row')).toBeOnTheScreen();
  expect(screen.getByTestId('folder-actions')).toBeOnTheScreen();
});
```

- [ ] **Step 6: Vérifier tout (tests + types + lint)**

Run: `npx jest src/ui/FileRow.test.tsx src/ui/FolderRow.test.tsx && npm run typecheck && npm run lint`
Expected: tests PASS, typecheck OK, lint OK.

- [ ] **Step 7: Commit**

```bash
git add src/ui/FileRow.tsx src/ui/FolderRow.tsx src/ui/FileRow.test.tsx src/ui/FolderRow.test.tsx
git commit -m "feat(e2e): add testIDs to FileRow/FolderRow rows, actions, pinned badge"
```

---

### Task 3: testIDs AppBar (recherche + retour) & champ de recherche

**Files:**
- Modify: `src/ui/AppBar.tsx` (magnifier `Pressable` L84–92 ; back action)
- Modify: `app/search.tsx` (`Searchbar` L64–71)
- Test: `src/ui/AppBar.test.tsx`, `app/search.test.tsx`

**Interfaces:**
- Produces: testIDs `appbar-search-button`, `appbar-back-button`, `search-input` — consommés par les flows 01, 03, et le subflow `assertLoggedIn`.

- [ ] **Step 1: Test qui échoue (AppBar)**

Dans `src/ui/AppBar.test.tsx`, réutiliser le render existant et ajouter :
```tsx
it('expose les testIDs de navigation', () => {
  render(wrap(<AppBar {...baseProps} />));
  expect(screen.getByTestId('appbar-search-button')).toBeOnTheScreen();
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/ui/AppBar.test.tsx -t "testIDs de navigation"`
Expected: FAIL.

- [ ] **Step 3: Implémenter (AppBar)**

Dans `src/ui/AppBar.tsx` :
1. `Pressable` de la loupe (L84–92) : ajouter `testID="appbar-search-button"`.
2. Bouton retour (le `Appbar.BackAction` / `Appbar.Action` de retour rendu par ce composant) : ajouter `testID="appbar-back-button"`.

- [ ] **Step 4: Champ de recherche**

Dans `app/search.tsx`, `Searchbar` (L64–71) : ajouter `testID="search-input"`.
Dans `app/search.test.tsx`, réutiliser le render existant et ajouter :
```tsx
it('expose le testID du champ de recherche', () => {
  render(wrap(<Search />));
  expect(screen.getByTestId('search-input')).toBeOnTheScreen();
});
```
> Réutilise le composant et les mocks déjà importés en tête de `app/search.test.tsx`.

- [ ] **Step 5: Vérifier (tests + types + lint)**

Run: `npx jest src/ui/AppBar.test.tsx app/search.test.tsx && npm run typecheck && npm run lint`
Expected: PASS / OK / OK.

- [ ] **Step 6: Commit**

```bash
git add src/ui/AppBar.tsx app/search.tsx src/ui/AppBar.test.tsx app/search.test.tsx
git commit -m "feat(e2e): add testIDs to AppBar search/back buttons and search input"
```

---

### Task 4: testIDs création de dossier (FAB + dialog)

**Files:**
- Modify: `app/(drive)/files/[...path].tsx` (`FAB.Group` L510–516)
- Modify: `src/ui/CreateFolderDialog.tsx` (`TextInput` L49–59 ; `Button` submit L68–75)
- Test: `src/ui/CreateFolderDialog.test.tsx` (create)

**Interfaces:**
- Produces: testIDs `drive-fab`, `create-folder-name-input`, `create-folder-submit` — consommés par le flow 04.

- [ ] **Step 1: Test qui échoue (nouveau fichier)**

Créer `src/ui/CreateFolderDialog.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import CreateFolderDialog from './CreateFolderDialog';

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>;

describe('CreateFolderDialog', () => {
  it('expose les testIDs du champ et du bouton', () => {
    render(
      wrap(
        <CreateFolderDialog visible onDismiss={jest.fn()} onSubmit={jest.fn()} />,
      ),
    );
    expect(screen.getByTestId('create-folder-name-input')).toBeOnTheScreen();
    expect(screen.getByTestId('create-folder-submit')).toBeOnTheScreen();
  });
});
```
> Adapter l'import (`default` vs nommé) à la signature réelle du composant.

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/ui/CreateFolderDialog.test.tsx`
Expected: FAIL (testIDs absents).

- [ ] **Step 3: Implémenter**

Dans `src/ui/CreateFolderDialog.tsx` : `TextInput` (L49–59) → `testID="create-folder-name-input"` ; `Button` submit (L68–75) → `testID="create-folder-submit"`.
Dans `app/(drive)/files/[...path].tsx` : `FAB.Group` (L510–516) → `testID="drive-fab"`.

- [ ] **Step 4: Lancer — succès attendu**

Run: `npx jest src/ui/CreateFolderDialog.test.tsx && npm run typecheck && npm run lint`
Expected: PASS / OK / OK.

- [ ] **Step 5: Commit**

```bash
git add "app/(drive)/files/[...path].tsx" src/ui/CreateFolderDialog.tsx src/ui/CreateFolderDialog.test.tsx
git commit -m "feat(e2e): add testIDs to create-folder FAB and dialog"
```

---

### Task 5: testIDs FolderPicker (confirmation + lignes)

**Files:**
- Modify: `src/ui/FolderPicker/FolderPicker.tsx` (`Button` confirm L159–167)
- Modify: `src/ui/FolderPicker/FolderPickerRow.tsx` (`List.Item` L24–42, Props L14–18)
- Test: `src/ui/FolderPicker/FolderPicker.test.tsx`

**Interfaces:**
- Produces: testIDs `folder-picker-confirm`, `folder-picker-row` — consommés par le flow 11 (import/share).

- [ ] **Step 1: Test qui échoue**

Dans `src/ui/FolderPicker/FolderPicker.test.tsx`, réutiliser le render existant et ajouter :
```tsx
it('expose le testID du bouton de confirmation', () => {
  render(wrap(<FolderPicker {...baseProps} />));
  expect(screen.getByTestId('folder-picker-confirm')).toBeOnTheScreen();
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/ui/FolderPicker/FolderPicker.test.tsx -t "bouton de confirmation"`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`src/ui/FolderPicker/FolderPicker.tsx` `Button` confirm (L159–167) → `testID="folder-picker-confirm"`.
`src/ui/FolderPicker/FolderPickerRow.tsx` : ajouter `testID?: string` aux Props (L14–18), déstructurer, et `testID={testID ?? 'folder-picker-row'}` sur `List.Item` (L24). Passer `testID="folder-picker-row"` depuis `FolderPicker.tsx` (L141–147, `<FolderPickerRow ... />`).

- [ ] **Step 4: Vérifier**

Run: `npx jest src/ui/FolderPicker/FolderPicker.test.tsx && npm run typecheck && npm run lint`
Expected: PASS / OK / OK.

- [ ] **Step 5: Commit**

```bash
git add src/ui/FolderPicker/FolderPicker.tsx src/ui/FolderPicker/FolderPickerRow.tsx src/ui/FolderPicker/FolderPicker.test.tsx
git commit -m "feat(e2e): add testIDs to FolderPicker confirm button and rows"
```

---

### Task 6: Subflows + Flow 01 (launch-browse) — walking skeleton

Premier flow bout-en-bout : prouve que la chaîne complète (install → session pré-auth → Maestro → assertion) fonctionne.

**Files:**
- Create: `e2e/maestro/subflows/assertLoggedIn.yaml`
- Create: `e2e/maestro/subflows/openDrive.yaml`
- Create: `e2e/maestro/subflows/cleanup.yaml`
- Create: `e2e/maestro/flows/in-app/01-launch-browse.yaml`

**Interfaces:**
- Consumes: `appbar-search-button` (Task 3), `folder-row` + `appbar-back-button` (Tasks 2–3).
- Produces: subflows `assertLoggedIn`, `openDrive`, `cleanup` réutilisés par tous les flows suivants.

- [ ] **Step 1: `assertLoggedIn.yaml`**

```yaml
appId: com.linagora.twakedrive
---
# Échoue vite et clairement si la session pré-auth est absente.
- assertVisible:
    id: "appbar-search-button"
```

- [ ] **Step 2: `openDrive.yaml`**

```yaml
appId: com.linagora.twakedrive
---
- launchApp
- runFlow: assertLoggedIn.yaml
- tapOn: "Mon Drive"   # onglet racine (FR)
```

- [ ] **Step 3: `cleanup.yaml` (suppression conditionnelle du dossier de test)**

```yaml
appId: com.linagora.twakedrive
env:
  FOLDER_NAME: "E2E-smoke"
---
# Supprime un éventuel dossier de test résiduel. No-op s'il est absent.
- runFlow:
    when:
      visible: ${FOLDER_NAME}
    commands:
      - tapOn:
          id: "folder-actions"
          rightOf:
            text: ${FOLDER_NAME}
      # DISCOVERY : confirmer le libellé de suppression via `maestro studio`
      # (défaut probable FR : "Supprimer" ou "Mettre à la corbeille").
      - tapOn: "Supprimer"
      - assertNotVisible: ${FOLDER_NAME}
```

- [ ] **Step 4: `01-launch-browse.yaml`**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
---
# Pré-requis : ≥1 dossier à la racine du drive.
- runFlow: ../../subflows/openDrive.yaml
- tapOn:
    id: "folder-row"
    index: 0
- assertVisible:
    id: "appbar-back-button"
- tapOn:
    id: "appbar-back-button"
- runFlow: ../../subflows/assertLoggedIn.yaml
```

- [ ] **Step 5: (USER, device/sim) Lancer le flow**

Pré-requis : app installée **et connectée** ; ≥1 dossier à la racine.
Run: `maestro test e2e/maestro/flows/in-app/01-launch-browse.yaml`
Expected: PASS (Flow 01). Si un sélecteur ne matche pas, inspecter avec `maestro studio` et ajuster.

- [ ] **Step 6: Commit**

```bash
git add e2e/maestro/subflows e2e/maestro/flows/in-app/01-launch-browse.yaml
git commit -m "test(e2e): subflows + flow 01 launch-browse (walking skeleton)"
```

---

### Task 7: Flow 02 (tabs)

**Files:**
- Create: `e2e/maestro/flows/in-app/02-tabs.yaml`

- [ ] **Step 1: Écrire le flow**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
---
- runFlow: ../../subflows/openDrive.yaml
- tapOn: "Récents"
- tapOn: "Favoris"
- tapOn: "Corbeille"
- tapOn: "Mon Drive"
- runFlow: ../../subflows/assertLoggedIn.yaml
```

- [ ] **Step 2: (USER) Lancer**

Run: `maestro test e2e/maestro/flows/in-app/02-tabs.yaml`
Expected: PASS. Chaque `tapOn` d'un onglet inexistant échouerait — les 4 libellés FR doivent matcher.

- [ ] **Step 3: Commit**

```bash
git add e2e/maestro/flows/in-app/02-tabs.yaml
git commit -m "test(e2e): flow 02 drive tabs"
```

---

### Task 8: Flow 03 (search)

**Files:**
- Create: `e2e/maestro/flows/in-app/03-search.yaml`

**Interfaces:**
- Consumes: `appbar-search-button`, `search-input` (Task 3).

- [ ] **Step 1: Écrire le flow**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
env:
  SEARCH_QUERY: "sample"
---
# Pré-requis : ≥1 fichier/dossier dont le nom contient SEARCH_QUERY.
- runFlow: ../../subflows/openDrive.yaml
- tapOn:
    id: "appbar-search-button"
- assertVisible:
    id: "search-input"
- inputText: ${SEARCH_QUERY}
- assertNotVisible: "Aucun fichier trouvé"
```

- [ ] **Step 2: (USER) Lancer**

Run: `maestro test e2e/maestro/flows/in-app/03-search.yaml -e SEARCH_QUERY=sample`
Expected: PASS (au moins un résultat → le message vide FR n'apparaît pas).

- [ ] **Step 3: Commit**

```bash
git add e2e/maestro/flows/in-app/03-search.yaml
git commit -m "test(e2e): flow 03 global search"
```

---

### Task 9: Flow 04 (folder-crud, auto-nettoyant)

**Files:**
- Create: `e2e/maestro/flows/in-app/04-folder-crud.yaml`

**Interfaces:**
- Consumes: `drive-fab`, `create-folder-name-input`, `create-folder-submit` (Task 4) ; `cleanup.yaml` + `folder-actions` (Tasks 6, 2).

- [ ] **Step 1: Écrire le flow (idempotent : cleanup → create → assert → cleanup)**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
env:
  FOLDER_NAME: "E2E-smoke"
---
- runFlow: ../../subflows/openDrive.yaml
- runFlow: ../../subflows/cleanup.yaml          # supprime un résidu éventuel
- tapOn:
    id: "drive-fab"
- tapOn: "Nouveau dossier"
- tapOn:
    id: "create-folder-name-input"
- inputText: ${FOLDER_NAME}
- tapOn:
    id: "create-folder-submit"
- assertVisible: ${FOLDER_NAME}
- runFlow: ../../subflows/cleanup.yaml          # laisse l'état propre
- assertNotVisible: ${FOLDER_NAME}
```

- [ ] **Step 2: (USER) Lancer + confirmer le libellé de suppression**

Run: `maestro test e2e/maestro/flows/in-app/04-folder-crud.yaml`
Expected: PASS. Au premier run, ouvrir `maestro studio` pour confirmer le libellé exact du menu de suppression et corriger `cleanup.yaml` si besoin (Task 6, Step 3).

- [ ] **Step 3: Commit**

```bash
git add e2e/maestro/flows/in-app/04-folder-crud.yaml e2e/maestro/subflows/cleanup.yaml
git commit -m "test(e2e): flow 04 folder create/delete round-trip"
```

---

### Task 10: Flow 05 (preview) + testIDs preview

**Files:**
- Modify: `app/preview/[fileId].tsx` (conteneur image L106–116 ; conteneur PDF `<Pdf>` L63)
- Modify: `src/preview/VideoPreview.tsx` (`VideoView` L43–72)
- Create: `e2e/maestro/flows/in-app/05-preview.yaml`
- Test: `src/preview/VideoPreview.test.tsx` (add assertion)

**Interfaces:**
- Produces: testIDs `preview-image`, `preview-pdf`, `preview-video`.
- Note : le testID `preview-video` est unit-testé (VideoPreview a déjà un harnais) ; `preview-image`/`preview-pdf` sont vérifiés sur device par le flow (mock lourd non justifié).

- [ ] **Step 1: Test qui échoue (VideoPreview)**

Dans `src/preview/VideoPreview.test.tsx`, réutiliser le render existant et ajouter :
```tsx
it('expose le testID preview-video', () => {
  render(wrap(<VideoPreview {...baseProps} />));
  expect(screen.getByTestId('preview-video')).toBeOnTheScreen();
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx jest src/preview/VideoPreview.test.tsx -t "preview-video"`
Expected: FAIL.

- [ ] **Step 3: Implémenter les testIDs**

- `src/preview/VideoPreview.tsx` `VideoView` (L43–72) → `testID="preview-video"`.
- `app/preview/[fileId].tsx` : `ZoomableImage` (L106–116) → `testID="preview-image"` ; `<Pdf>` (L63) → `testID="preview-pdf"`.

- [ ] **Step 4: Vérifier l'unitaire**

Run: `npx jest src/preview/VideoPreview.test.tsx && npm run typecheck && npm run lint`
Expected: PASS / OK / OK.

- [ ] **Step 5: Écrire le flow**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
env:
  PREVIEW_IMAGE: "sample.jpg"
---
# Pré-requis : PREVIEW_IMAGE (une image) présent à la racine.
- runFlow: ../../subflows/openDrive.yaml
- tapOn: ${PREVIEW_IMAGE}
- assertVisible:
    id: "preview-image"
    timeout: 10000
```

- [ ] **Step 6: (USER) Lancer le flow**

Run: `maestro test e2e/maestro/flows/in-app/05-preview.yaml`
Expected: PASS (le preview image s'affiche).

- [ ] **Step 7: Commit**

```bash
git add app/preview src/preview/VideoPreview.tsx src/preview/VideoPreview.test.tsx e2e/maestro/flows/in-app/05-preview.yaml
git commit -m "test(e2e): preview testIDs + flow 05 image preview"
```

---

### Task 11: Flow 06 (editor) + testIDs éditeurs

**Files:**
- Modify: `app/note/[fileId].tsx` (`WebView` L64–78)
- Modify: `app/onlyoffice/[fileId].tsx` (`WebView` L80–94)
- Create: `e2e/maestro/flows/in-app/06-editor.yaml`

**Interfaces:**
- Produces: testIDs `note-webview`, `onlyoffice-webview` (signal « écran éditeur chargé »). Vérifiés sur device (contenu WebView distant hors de portée Maestro ; mock unitaire non justifié).

- [ ] **Step 1: Implémenter les testIDs**

- `app/note/[fileId].tsx` `WebView` (L64–78) → `testID="note-webview"`.
- `app/onlyoffice/[fileId].tsx` `WebView` (L80–94) → `testID="onlyoffice-webview"`.

- [ ] **Step 2: Vérifier types + lint**

Run: `npm run typecheck && npm run lint`
Expected: OK / OK.

- [ ] **Step 3: Écrire le flow**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
env:
  EDITOR_FILE: "sample.docx"
---
# Pré-requis : EDITOR_FILE (un fichier Office) présent à la racine.
# Smoke shallow : on vérifie que la WebView éditeur se monte (URL session_code
# résolue). Dépend du backend + certification flagship.
- runFlow: ../../subflows/openDrive.yaml
- tapOn: ${EDITOR_FILE}
- assertVisible:
    id: "onlyoffice-webview"
    timeout: 20000
```

- [ ] **Step 4: (USER) Lancer le flow**

Run: `maestro test e2e/maestro/flows/in-app/06-editor.yaml`
Expected: PASS (la WebView OnlyOffice se monte). Un échec de session_code afficherait l'ErrorState → échec = signal smoke valide.

- [ ] **Step 5: Commit**

```bash
git add app/note app/onlyoffice e2e/maestro/flows/in-app/06-editor.yaml
git commit -m "test(e2e): editor webview testIDs + flow 06 OnlyOffice open"
```

---

### Task 12: Flow 07 (offline-pin)

**Files:**
- Create: `e2e/maestro/flows/in-app/07-offline-pin.yaml`

**Interfaces:**
- Consumes: `file-actions`, `pinned-badge` (Task 2) ; libellés FR pin/unpin.

- [ ] **Step 1: Écrire le flow**

```yaml
appId: com.linagora.twakedrive
tags:
  - inapp
---
# Pré-requis : ≥1 fichier à la racine (première ligne fichier).
- runFlow: ../../subflows/openDrive.yaml
- tapOn:
    id: "file-actions"
    index: 0
- tapOn: "Garder hors-ligne"
- assertVisible:
    id: "pinned-badge"
    timeout: 15000
# Nettoyage : dé-épingler
- tapOn:
    id: "file-actions"
    index: 0
- tapOn: "Retirer du hors-ligne"
```

- [ ] **Step 2: (USER) Lancer**

Run: `maestro test e2e/maestro/flows/in-app/07-offline-pin.yaml`
Expected: PASS (badge offline visible après épinglage).

- [ ] **Step 3: Commit**

```bash
git add e2e/maestro/flows/in-app/07-offline-pin.yaml
git commit -m "test(e2e): flow 07 offline pin round-trip"
```

---

### Task 13: Flow 10 (File Provider / SAF, Android) — discovery

**Files:**
- Create: `e2e/maestro/flows/android/10-fileprovider-browse.yaml`

**Interfaces:**
- Cross-app : pilote DocumentsUI. La racine du provider s'affiche **"Twake Drive"** (sous-titre = domaine) et n'apparaît **que si connecté**.

- [ ] **Step 1: (USER) Discovery des sélecteurs SAF**

Sur le device, ouvrir un sélecteur de documents et inspecter avec `maestro studio` :
```bash
adb shell am start -a android.intent.action.OPEN_DOCUMENT -t '*/*'
maestro studio
```
Noter : le package DocumentsUI (`com.android.documentsui` vs `com.google.android.documentsui`), comment atteindre la liste des sources (menu tiroir), et le libellé exact « Twake Drive ».

- [ ] **Step 2: Écrire le flow (squelette robuste, ajusté par la discovery)**

```yaml
appId: com.android.documentsui   # DISCOVERY : ajuster au package réel
tags:
  - android
env:
  PROVIDER_LABEL: "Twake Drive"
---
- launchApp
# Ouvrir le tiroir des sources puis choisir Twake Drive
# (les 2 étapes ci-dessous sont à confirmer via maestro studio)
- tapOn:
    id: "com.android.documentsui:id/toolbar"
    optional: true
- tapOn: ${PROVIDER_LABEL}
# Parcourir : entrer dans le premier dossier listé puis sélectionner un fichier
- tapOn:
    text: ".*"
    index: 0
- takeScreenshot: fileprovider-browse
- assertVisible: ${PROVIDER_LABEL}
```

- [ ] **Step 3: (USER) Lancer + itérer**

Pré-requis : app connectée (sinon la source « Twake Drive » est masquée).
Run: `maestro test e2e/maestro/flows/android/10-fileprovider-browse.yaml`
Expected: PASS — la source « Twake Drive » est visible et navigable. Ajuster les sélecteurs via `maestro studio` jusqu'au vert.

- [ ] **Step 4: Commit**

```bash
git add e2e/maestro/flows/android/10-fileprovider-browse.yaml
git commit -m "test(e2e): flow 10 File Provider SAF browse (Android)"
```

---

### Task 14: Flow 11 (Share to Drive, Android) — discovery

**Files:**
- Create: `e2e/maestro/flows/android/11-share-to-drive.yaml`

**Interfaces:**
- Cross-app : partage depuis une app tierce → réception via le flow **import** (FolderPicker `folder-picker-confirm` + « Importer ici » → snackbar « Fichier importé »).

- [ ] **Step 1: (USER) Discovery du déclencheur de partage**

`run-android.sh` a déjà poussé `/sdcard/Pictures/E2E/sample.jpg`. Choisir une app galerie déterministe (recommandé : « Files » `com.google.android.apps.nbu.files`), inspecter le long-press → Partager → « Twake Drive » via `maestro studio`.

- [ ] **Step 2: Écrire le flow**

```yaml
appId: com.google.android.apps.nbu.files   # DISCOVERY : app galerie réelle
tags:
  - android
---
- launchApp
# Ouvrir l'image de fixture, la partager (étapes à confirmer via maestro studio)
- tapOn:
    text: "sample.jpg"
    optional: true
- tapOn: "Partager"
- tapOn: "Twake Drive"
# --- On est maintenant dans l'app Twake Drive (flow import) ---
- tapOn:
    id: "folder-picker-confirm"          # bouton « Importer ici »
- assertNotVisible: "Importer ici"        # l'écran d'import s'est fermé (succès)
```

- [ ] **Step 3: (USER) Lancer + itérer**

Run: `maestro test e2e/maestro/flows/android/11-share-to-drive.yaml`
Expected: PASS — l'image est partagée vers Twake Drive, l'import se confirme. Ajuster via `maestro studio`. NB : le snackbar « Fichier importé » disparaît en ~600 ms → on asserte la fermeture de l'écran d'import (`assertNotVisible: "Importer ici"`) plutôt que le snackbar.

- [ ] **Step 4: Commit**

```bash
git add e2e/maestro/flows/android/11-share-to-drive.yaml
git commit -m "test(e2e): flow 11 share-to-drive via OS share sheet (Android)"
```

---

### Task 15: Flow 00 (login helper, semi-manuel) — discovery

**Files:**
- Create: `e2e/maestro/flows/00-login.yaml`

**Interfaces:**
- Tag `login` → exclu de tout run automatique. Sert à (re)créer la session pré-auth.

- [ ] **Step 1: (USER) Discovery des libellés d'onboarding/login**

Sur une app fraîchement installée (déconnectée), inspecter welcome → login avec `maestro studio` : CTA de l'écran welcome, champ URL/email, et le point d'entrée du code email (WebView FlagshipAuthModal).

- [ ] **Step 2: Écrire le flow (drive jusqu'au code, puis pause manuelle)**

```yaml
appId: com.linagora.twakedrive
tags:
  - login
env:
  COZY_URL: "https://mon-instance.twake.app"
  COZY_EMAIL: "moi@example.com"
---
- launchApp
# --- Étapes welcome → saisie URL/email : à confirmer via maestro studio ---
- tapOn:
    text: "Se connecter"
    optional: true
- inputText: ${COZY_URL}
# --- Pause : saisie MANUELLE du code email + étapes WebView flagship ---
# Le flow attend l'arrivée sur le drive (jusqu'à 3 min) pendant la saisie manuelle.
- extendedWaitUntil:
    visible:
      id: "appbar-search-button"
    timeout: 180000
```

- [ ] **Step 3: (USER) Lancer le helper**

Run: `npm run e2e:login`
Expected: le flow s'arrête en attente ; l'utilisateur saisit le code email reçu, termine le login, puis le flow détecte l'arrivée sur le drive → PASS. La session est maintenant pré-authentifiée pour les autres flows.

- [ ] **Step 4: Commit**

```bash
git add e2e/maestro/flows/00-login.yaml
git commit -m "test(e2e): flow 00 semi-manual login helper"
```

---

### Task 16: README + run complet de la suite

**Files:**
- Modify: `e2e/README.md`

**Interfaces:**
- Consumes: tous les flows + scripts précédents.

- [ ] **Step 1: Rédiger le README**

`e2e/README.md` couvre :
1. **Installation** : `curl -Ls "https://get.maestro.mobile.dev" | bash`.
2. **Setup unique du compte pré-auth** : se connecter via `npm run e2e:login` ; créer les fixtures à la racine (1 dossier, `sample.jpg`, `sample.pdf`, `sample.docx`) ; déposer `sample.jpg` dans `e2e/fixtures/`.
3. **Lancer** : `npm run e2e:android` (device adb : in-app + cross-app) ; `npm run e2e:ios` (simulateur : in-app). Variables : `APK_PATH`, `APP_PATH`, `SIMULATOR`.
4. **Sous-ensembles** : `maestro test e2e/maestro/flows --include-tags inapp` ; un flow isolé `maestro test <chemin>`.
5. **Périmètre** : Android = 3 volets ; iOS = in-app (extensions natives absentes).
6. **Convention testID** + rappel i18n (FR sur device, clés en Jest).
7. **Dépannage** : `maestro studio` pour inspecter la hiérarchie ; ne jamais désinstaller (perte de session) ; libellés de discovery (suppression, SAF, share, login) à re-confirmer si l'OS/OEM change.

- [ ] **Step 2: (USER) Run complet Android**

Run: `npm run e2e:android`
Expected: flows 01–07 + 10–11 PASS sur le device.

- [ ] **Step 3: (USER) Run complet iOS**

Run: `npm run e2e:ios`
Expected: flows 01–07 PASS sur le simulateur.

- [ ] **Step 4: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): README — setup, fixtures, running, scope, troubleshooting"
```

---

## Self-Review

**Spec coverage (vs `2026-07-04-e2e-test-suite-design.md`) :**
- Smoke local Maestro pré-auth → Global Constraints + Tasks 1, 6. ✅
- Android 3 volets / iOS in-app → tags `inapp`/`android`, run scripts (Task 1), flows 10–11 tag `android`. ✅
- 11 flows + login → Tasks 6–15 (01–07, 10, 11, 00). ✅
- Pré-auth + login isolé semi-manuel → `assertLoggedIn` (Task 6), Task 15, `--exclude-tags login`. ✅
- Idempotence / auto-nettoyage → `cleanup.yaml` + flow 04 (Task 9), unpin flow 07. ✅
- testIDs → Tasks 2–5 (unit-testés) + 10–11 (preview/editor, device-vérifiés). ✅
- Scripts de run + tags → Task 1. ✅
- Points « à valider en implémentation » (SAF, share, delete, login) → steps Discovery Tasks 9, 13, 14, 15. ✅
- Critères de succès (run 1 commande, idempotence, trace) → Tasks 1, 16 + `takeScreenshot`. ✅

**Placeholder scan :** les valeurs marquées `DISCOVERY` sont des libellés système/OEM intrinsèquement non-connaissables hors device (nature du test boîte-noire cross-app) ; chacune a une valeur par défaut + un step `maestro studio` d'ajustement. Pas de TODO/TBD non résolu.

**Type consistency :** testIDs cohérents entre définition (Tasks 2–5, 10–11) et usage (flows) : `file-row`, `folder-row`, `file-actions`, `folder-actions`, `pinned-badge`, `appbar-search-button`, `appbar-back-button`, `search-input`, `drive-fab`, `create-folder-name-input`, `create-folder-submit`, `folder-picker-confirm`, `folder-picker-row`, `preview-image/pdf/video`, `note-webview`, `onlyoffice-webview`. Libellés FR cohérents avec le rapport d'extraction.
