# Notes de bring-up E2E (device réel)

Observations du premier passage sur **Pixel 10 Pro Fold** (Android, adb) — 2026-07-04.

## Build installé = ANCIEN (précède ce chantier)
Le build sur le device **ne contient pas** les `testID` ajoutés (Tasks 2-5) ni le
fix i18n `drive.search`. Il a en revanche des rid Paper par défaut exploitables.
→ Les flows ci-dessous sont écrits contre les **ancres validées sur ce build**
(texte FR + rid Paper) ; un **build frais** permettra de basculer sur les testIDs
(plus robustes, agnostiques au compte) et de valider preview/éditeur/recherche.

## Sélecteurs VALIDÉS sur device
- Onglets : texte FR — `Mon Drive`, `Favoris`, `Récents`, `Partages`, `Corbeille`.
- Dossiers : par nom (texte).
- Retour : `pressKey: Back`.
- Loupe recherche : `tapOn: 'Rechercher'` (accessibilité) ; champ = rid `search-input`.
- FAB : `id: 'fab'` (défaut Paper ; `drive-fab` sur build frais).
- Menu 3-points d'une ligne : `tapOn: { text: 'folder actions', rightOf: { text: <nom> } }`
  (⚠️ `id: 'icon-button'` seul est ambigu — partagé par la loupe/aide/lignes).
- Création dossier : `Nouveau dossier` → champ auto-focus → saisie → `pressKey: Enter`
  (le champ a `returnKeyType=done` + `onSubmitEditing`) → apparition **async** (extendedWaitUntil).
- Menu dossier (labels FR confirmés) : `Déplacer…`, `Garder hors-ligne`, `Partager`, `Supprimer`.
- Offline : `Garder hors-ligne` / `Retirer du hors-ligne`.

## Statut par flow
| Flow | Statut | Note |
|------|--------|------|
| 01 launch-browse | ✅ VERT | commité, device-validé |
| 02 tabs | ✅ VERT | commité, device-validé |
| 03 search | ✅ VERT (reachability) | commité ; résultats serveur non déterministes → build frais + fixtures |
| 04 folder-crud | 🟡 CREATE ok / DELETE à fiabiliser | create validé ; confirm suppression à cracker (cf. cleanup.yaml) |
| 07 offline-pin | 🟡 device-ready (non exécuté) | text-based, labels validés ; ⚠️ épingler télécharge → petit dossier |
| 05 preview | 🔴 build frais | testID `preview-image` (écran chromeless) + fixture image |
| 06 editor | 🔴 build frais | testID `onlyoffice-webview` (EditorHeader titre vide) + fixture Office |
| 10 fileprovider | 🔵 discovery | SAF/DocumentsUI ; racine « Twake Drive » (visible si connecté) |
| 11 share-to-drive | 🔵 discovery | galerie → partage → « Twake Drive » → import « Importer ici » |
| 00 login | 🔵 semi-manuel | code email manuel ; exclu des runs |

## Quirks connus
- **Suppression dossier** : le dialog « Supprimer le dossier ? » s'ouvre, mais le
  tap de confirmation ne committait pas la suppression lors du bring-up (ni retirée
  de Mon Drive, ni en Corbeille). À investiguer : tap conteneur Paper Dialog vs
  noeud texte ; voie long-press/multi-select ; lag réplication PouchDB.
- **Recherche** : renvoyait 0 résultat + label i18n cassé sur l'ancien build. Le
  **bug i18n `drive.search` (clé dupliquée string/objet) est corrigé en source**
  (commit `fix(i18n): drive.search…`). Résultats serveur à revalider sur build frais.

## Rappel exécution
`export PATH="$PATH:$HOME/.maestro/bin"` puis `maestro test <flow>`.
Runs groupés : `npm run e2e:android` (inapp+android) / `npm run e2e:ios` (inapp).
