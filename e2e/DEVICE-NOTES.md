# Notes de bring-up E2E (devices réels)

Validé sur **Pixel 10 Pro Fold** (Android, adb) + **iPhone 17 Pro / iOS 26** (simulateur).

## ⚠️ Sélection du device (piège majeur)
Avec **deux devices connectés**, `maestro test` en auto-sélectionne un (souvent l'Android) !
Toujours cibler explicitement : `maestro --platform ios test …` / `--platform android` /
`--udid <UDID>`. Les run-scripts le font désormais.

## Recette de sélecteurs CROSS-PLATFORM (marche iOS ET Android)
Les labels/accessibilité diffèrent entre plateformes → règles :
- **Onglets** : `{ text: 'Récents.*' }` (iOS = « Récents, tab, 3 of 7 » ; Android = « Récents »).
- **Dossiers/fichiers** : `{ text: 'nom.*' }` (iOS = « nom, folder actions »).
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
