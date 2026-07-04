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

## Statut par flow (Pixel, build frais avec testIDs — 2e passage)
| Flow | Statut | Note |
|------|--------|------|
| 01 launch-browse | ✅ VERT | device-validé |
| 02 tabs | ✅ VERT | device-validé |
| 03 search | ✅ VERT (reachability) | résultats serveur non déterministes (paginé + `.includes()` sur gros drive) — **pas un bug**, c'est le design |
| 04 folder-crud | 🟡 CREATE ✅ / DELETE = souci d'auto | **create validé** ; la SUPPRESSION marche À LA MAIN (pas un bug app) — c'est le tap du bouton dialog Paper via Maestro/adb qui ne déclenche pas le `onPress` de façon fiable |
| 07 offline-pin | ✅ VERT | device-validé (pin → « Retirer du hors-ligne » → unpin), ciblé sur dossier vide |
| 10 fileprovider | ✅ **VERT** | **cross-app device-validé** : Files by Google → « Autre espace de stockage » → « Twake Drive » → contenu réel du drive |
| 11 share-to-drive | 🟢 receiver validé | Twake a bien les intent filters `SEND`/`SEND_MULTIPLE` (apparaît dans le share sheet) + device-validé antérieurement ; auto complète (galerie→share→import→upload) = fiddly + **upload réel** → à finaliser à part |
| 05 preview | 🔵 à jouer | testIDs `preview-*` présents dans le build ; besoin d'un fichier image/pdf connu |
| 06 editor | 🔵 à jouer | testIDs `*-webview` présents ; besoin d'un fichier Office/note |
| 00 login | 🔵 semi-manuel | code email manuel ; exclu des runs |

**testIDs confirmés présents dans le build frais** (uiautomator) : `appbar-search-button`, `drive-fab`, `folder-actions`, etc. → sélecteurs robustes OK.
**Gotcha foldable** : le Pixel 10 Pro Fold a 2 displays → `maestro hierarchy` peut revenir vide (driver stale) ; `maestro test` réinitialise le driver et marche ; `screencap -p` en stdout est corrompu (warning multi-display) → passer par un fichier device + pull.

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
