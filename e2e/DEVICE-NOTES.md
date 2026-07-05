# Notes de bring-up E2E (devices réels)

Validé sur **Pixel 10 Pro Fold** (Android, adb) + **iPhone 17 Pro / iOS 26** (simulateur).

## ⚠️ Sélection du device (piège majeur)
Avec **deux devices connectés**, `maestro test` en auto-sélectionne un (souvent l'Android) !
Toujours cibler explicitement : `maestro --platform ios test …` / `--platform android` /
`--udid <UDID>`. Les run-scripts le font désormais.

## Recette de sélecteurs CROSS-PLATFORM (marche iOS ET Android)
Les labels/accessibilité diffèrent entre plateformes → règles :
- **Onglets** : `{ text: 'Récents.*' }` (iOS = « Récents, tab, 3 of 7 » ; Android = « Récents »).
- **Dossiers/fichiers** : `{ text: 'nom.*' }` (iOS = « nom, <libellé actions
  localisé> », ex. « nom, Actions du dossier » en FR — le regex n'ancre que sur
  le nom). Libellé désormais localisé : JAMAIS comme sélecteur — le bouton
  d'actions du dossier se cible par testID (`{ id: 'folder-actions' }`).
- **Boutons** : **testIDs** (`appbar-search-button`, `appbar-back-button`, `drive-fab`,
  `search-input`, `create-folder-name-input`…) → `accessibilityIdentifier` sur iOS,
  `resource-id` sur Android. Cohérents.
- **Retour** : `{ id: 'appbar-back-button' }` (iOS n'a PAS de retour matériel → pas de `pressKey: Back`).
- **Labels FR statiques** (Nouveau dossier, Annuler…) : identiques sur les 2 → texte direct OK.
- **Assertions « on est dans le drive »** : `{ text: 'Mon Drive.*' }` (le titre exact « Mon Drive »
  n'existe que sur l'onglet Mon Drive ; le regex tolère le suffixe onglet iOS).

## Statut par flow (cross-platform)
| Flow | iOS | Android | Note |
|------|-----|---------|------|
| 00-welcome (pré-auth) | ✅ | ✅ | boot → welcome → login form |
| 01 launch-browse | ✅ | ✅ | dossier regex + back testID |
| 02 tabs | ✅ | ✅ | onglets regex |
| 03 search | ✅ | ✅ | testIDs ; résultats serveur non assertés (paginé) |
| 04 folder-crud | ✅ | ✅ | **non-mutant** (FAB → dialog → champ) — idempotent |
| 10 fileprovider | — | ✅ | Android cross-app (Files by Google → « Twake Drive ») |
| 07 offline-pin | 🔵 | 🟡 | Android labels validés ; iOS = folder-actions combiné (testID à cibler) |
| 05 preview / 06 editor | 🔵 | 🔵 | testIDs présents ; besoin d'un fichier fixture (image/pdf, office/note) |
| 11 share-to-drive | — | 🟢 | receiver enregistré (intent filters SEND) ; auto à finaliser |
| 00-login | 🔵 | 🔵 | semi-manuel (code email), exclu des runs |

## Le VERROU iOS levé : SecureStore sur simulateur
`tokenStorage` réclame un **shared keychain access group** (pour les extensions). Sur un
build simu **ad-hoc/non-signé**, cet entitlement n'est pas accordé → SecureStore jette
« A required entitlement isn't present » → **login impossible**. Fix (`fix(auth)`, TDD) :
**fallback vers le keychain par défaut** quand le groupe partagé échoue → login + session
persistent sur le simulateur, **sans device réel**. Sur build device signé, le groupe
partagé marche et le fallback ne tourne jamais.

## Quirks / limitations connues
- **Suppression de dossier** : la CRÉATION marche ; la **SUPPRESSION ne se déclenche PAS via
  tap synthétique** (maestro XCUITest/UIAutomator, adb input, point) alors qu'elle marche
  **à la main** — le dialog est correct (« 1 éléments »), le bon bouton (`id=button`) est tapé
  (COMPLETED) mais l'`onPress` n'agit pas, **cross-platform**. → flow 04 rendu **non-mutant**
  (pas de faux positif). Le round-trip create+delete réel attend l'investigation de ce point.
- **Foldable (Pixel Fold)** : 2 displays → `maestro hierarchy` / `screencap -p` (stdout) peuvent
  cibler le mauvais écran ; `maestro test` réinit le driver, `uiautomator dump` direct + pull marchent.
- **Recherche** : résultats serveur non déterministes (paginé + `.includes()` sur gros drive) — pas un bug.
- **Maestro iOS** : `launchApp` peut échouer une assertion immédiate par timing (rendu) → `extendedWaitUntil`.

## Exécution
`export PATH="$PATH:$HOME/.maestro/bin"` puis :
- `npm run e2e:ios` / `npm run e2e:android` (ciblent la bonne plateforme).
- Un flow ciblé : `maestro --platform ios test e2e/maestro/flows/in-app/02-tabs.yaml`.

## Passe bug-fix + partage (2026-07-05)
Bugs trouvés via l'E2E + corrigés (device-validés sauf mention) :
- **Badge offline absent en grid** (`FileGridItem` ne rendait pas `PinnedBadge`) — validé.
- **Favoris listait TOUT** (le `where` nested `cozyMetadata.favorite` échoue "ouvert" en pouch local) → tri favoris-d'abord + filtre client `isFavorite` — validé.
- **Récents ~1 min** (`recentQuery` avec `partialIndex` → nom d'index ≠ warmup `by_updated_at` → reconstruction pleine collection) → drop du partialIndex + filtre client — validé (~2s à chaud).
- **Récents dates futures / doublons** → exclusion des `updated_at` futurs + dédup `_id`.
- **Suppression via automatisation** : le code était bon ; le bouton confirmer n'avait pas de testID + label « Supprimer » ambigu → **testID `confirm-delete-submit`**. ⚠️ **La suppression MARCHE** — mes "échecs" venaient d'un sélecteur `rightOf` qui ciblait le **mauvais dossier** (2 vrais dossiers supprimés puis restaurés en bring-up).
- **Refresh liste après delete/restore** : `confirmDelete`/`confirmBulkDelete` ne refetch pas (fix : refetch) ; restore/empty = server-only → retrait optimiste (`removedIds`).

**Sélecteurs sûrs pour actions destructives (LEÇON) :**
- **JAMAIS `rightOf`** pour ouvrir le menu d'une ligne → il matche la mauvaise ligne.
- Menu d'un dossier précis : **`{ id: 'folder-actions:<nom>' }`** (testID par-dossier).
- Suppression sûre : **long-press du nom exact** (sélectionne cette ligne uniquement) → `{ id: 'selection-delete' }` → `{ id: 'confirm-delete-submit' }`.

**Nouveaux flows :**
- **04 folder-crud** : vrai create+delete round-trip, scoping strict sur E2E-smoke (long-press + testIDs).
- **08 share-internal** : ouvre le partage interne d'un dossier (lien + destinataires) puis ferme — **non-mutant** (aucun partage créé), cleanup.
- **11 share-to-drive** (OS share sheet) : fixture `sample.jpg` réelle en place (poussée par run-android.sh) ; run cross-app device = manuel.

## Menus de ligne sur iOS (a11y) — fix FolderRow (device-validé iOS 26.4)
Sur iOS, la `List.Item` de Paper (touchable via `onPress`) **groupe ses enfants en
UN élément d'accessibilité** → le bouton 3-points du slot `right` était absorbé
(testID perdu, un tap ouvrait le dossier au lieu du menu). **Fix** : sortir le menu
(et le chevron) du slot `right` en **SIBLING** de la `List.Item`. Device-validé
iOS 26.4 : testIDs `folder-actions:<nom>` exposés → **04 delete, 07 pin, 08 share
VERTS**. Nuances : sélecteur iOS = `folder-actions:<nom>-container-outer-layer`
(le nu est ambigu) vs Android `folder-actions:<nom>` ; `inputText` mange le tiret
sur iOS (noms sans tiret) ; la session iOS persiste à travers `simctl install`.
Suivi : même restructure sur `FileRow`.

## Favoris + hors-ligne : retrait/purge (fixes + validation, 2026-07-05)
**Fixes (PR #34)** : favori — refetch après toggle (retrait optimiste `removedIds`
comme trash.tsx) + dossier passé avec `_type`/`_rev` (sinon `client.save` levait
« must have a `_type` property », avalé → le favori dossier n'était **jamais**
retiré) ; hors-ligne — `FileRow` pilote « Retirer » sur `isDirectPin` (sinon re-pin)
+ `unpinFolder` récursif via `ancestorPins` (purge les blobs des sous-dossiers).

**Validé device** : retrait favori **Android = persiste** (E2Efav parti après
relaunch — LE vrai bug) ; **iOS 26.4 = disparaît live** (menu Favoris → « Retirer
des favoris » → `notVisible` EXIT=0, le retrait optimiste marche). Purge nested =
test unitaire `OfflineFilesStore` vert.

**Flows E2E 09 (favori) / 12 (hors-ligne)** : le menu s'ouvre de façon fiable sur
iOS (`folder-actions:<nom>-container-outer-layer` + **`waitForAnimationToEnd`**),
MAIS le tap des **items de menu Paper par TEXTE est flaky sur iOS** (XCUITest
n'expose pas leur texte de façon fiable — « Supprimer »/« Ajouter aux favoris » OK,
« Garder hors-ligne » rate par moments). Fiables sur Android. Aussi : la
propagation **favori→écran Favoris** dépend de la réplication pouch (l'E2E « favori
puis vérifier Favoris » court l'indexation → timeouts généreux + pull-to-refresh).
**Suivi E2E iOS** : ajouter des **testIDs sur les `Menu.Item`** (comme
`folder-actions`) pour des taps déterministes cross-platform.
