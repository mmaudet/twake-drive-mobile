# E2E bring-up notes (real devices)

Validated on **Pixel 10 Pro Fold** (Android, adb) + **iPhone 17 Pro / iOS 26** (simulator).

## ⚠️ Device selection (major gotcha)
With **two devices connected**, `maestro test` auto-selects one (often the Android one)!
Always target explicitly: `maestro --platform ios test …` / `--platform android` /
`--udid <UDID>`. The run-scripts now do this.

## CROSS-PLATFORM selector recipe (works on iOS AND Android)
Labels/accessibility differ between platforms → rules:
- **Tabs**: `{ text: 'Récents.*' }` (iOS = « Récents, tab, 3 of 7 »; Android = « Récents »).
- **Folders/files**: `{ text: 'name.*' }` (iOS = « name, <localized actions
  label> », e.g. « name, Actions du dossier » in FR — the regex only anchors on
  the name). The label is now localized: NEVER use it as a selector — the folder
  actions button is targeted by testID (`{ id: 'folder-actions' }`).
- **Buttons**: **testIDs** (`appbar-search-button`, `appbar-back-button`, `drive-fab`,
  `search-input`, `create-folder-name-input`…) → `accessibilityIdentifier` on iOS,
  `resource-id` on Android. Consistent.
- **Back**: `{ id: 'appbar-back-button' }` (iOS has NO hardware back → no `pressKey: Back`).
- **Static FR labels** (Nouveau dossier, Annuler…): identical on both → direct text OK.
- **"We are in the drive" assertions**: `{ text: 'Mon Drive.*' }` (the exact title « Mon Drive »
  only exists on the Mon Drive tab; the regex tolerates the iOS tab suffix).

## Status per flow (cross-platform)
| Flow | iOS | Android | Note |
|------|-----|---------|------|
| 00-welcome (pre-auth) | ✅ | ✅ | boot → welcome → login form |
| 01 launch-browse | ✅ | ✅ | folder regex + back testID |
| 02 tabs | ✅ | ✅ | tabs regex |
| 03 search | ✅ | ✅ | testIDs; server results not asserted (paginated) |
| 04 folder-crud | ✅ | ✅ | **non-mutating** (FAB → dialog → field) — idempotent |
| 10 fileprovider | — | ✅ | Android cross-app (Files by Google → « Twake Drive ») |
| 07 offline-pin | 🔵 | 🟡 | Android labels validated; iOS = combined folder-actions (testID to target) |
| 05 preview / 06 editor | 🔵 | 🔵 | testIDs present; needs a fixture file (image/pdf, office/note) |
| 11 share-to-drive | — | 🟢 | receiver registered (SEND intent filters); auto to be finalized |
| 00-login | 🔵 | 🔵 | semi-manual (email code), excluded from runs |

## The iOS BLOCKER lifted: SecureStore on the simulator
`tokenStorage` demands a **shared keychain access group** (for the extensions). On an
**ad-hoc/unsigned** simulator build, this entitlement is not granted → SecureStore throws
« A required entitlement isn't present » → **login impossible**. Fix (`fix(auth)`, TDD):
**fallback to the default keychain** when the shared group fails → login + persistent
session on the simulator, **without a real device**. On a signed device build, the shared
group works and the fallback never runs.

## Known quirks / limitations
- **Folder deletion**: CREATE works; **DELETE does NOT trigger via a synthetic tap**
  (maestro XCUITest/UIAutomator, adb input, point) whereas it works **by hand** — the
  dialog is correct (« 1 éléments »), the right button (`id=button`) is tapped
  (COMPLETED) but the `onPress` does not act, **cross-platform**. → flow 04 made **non-mutating**
  (no false positive). The real create+delete round-trip awaits investigation of this point.
- **Foldable (Pixel Fold)**: 2 displays → `maestro hierarchy` / `screencap -p` (stdout) may
  target the wrong screen; `maestro test` resets the driver, `uiautomator dump` direct + pull work.
- **Search**: server results non-deterministic (paginated + `.includes()` on a large drive) — not a bug.
- **Maestro iOS**: `launchApp` may fail an immediate assertion due to timing (rendering) → `extendedWaitUntil`.

## Execution
`export PATH="$PATH:$HOME/.maestro/bin"` then:
- `npm run e2e:ios` / `npm run e2e:android` (target the right platform).
- A targeted flow: `maestro --platform ios test e2e/maestro/flows/in-app/02-tabs.yaml`.

## Bug-fix + share pass (2026-07-05)
Bugs found via the E2E + fixed (device-validated unless noted):
- **Offline badge missing in grid** (`FileGridItem` did not render `PinnedBadge`) — validated.
- **Favorites listed EVERYTHING** (the nested `where` `cozyMetadata.favorite` fails "open" in local pouch) → favorites-first sort + client-side `isFavorite` filter — validated.
- **Recents ~1 min** (`recentQuery` with a `partialIndex` → index name ≠ `by_updated_at` warmup → full collection rebuild) → drop the partialIndex + client-side filter — validated (~2s warm).
- **Recents future dates / duplicates** → exclude future `updated_at` + dedup `_id`.
- **Deletion via automation**: the code was fine; the confirm button had no testID + an ambiguous « Supprimer » label → **testID `confirm-delete-submit`**. ⚠️ **Deletion WORKS** — my "failures" came from a `rightOf` selector that targeted the **wrong folder** (2 real folders deleted then restored during bring-up).
- **List refresh after delete/restore**: `confirmDelete`/`confirmBulkDelete` do not refetch (fix: refetch); restore/empty = server-only → optimistic removal (`removedIds`).

**Safe selectors for destructive actions (LESSON):**
- **NEVER `rightOf`** to open a row's menu → it matches the wrong row.
- Menu of a specific folder: **`{ id: 'folder-actions:<name>' }`** (per-folder testID).
- Safe deletion: **long-press the exact name** (selects that row only) → `{ id: 'selection-delete' }` → `{ id: 'confirm-delete-submit' }`.

**New flows:**
- **04 folder-crud**: real create+delete round-trip, strict scoping on E2E-smoke (long-press + testIDs).
- **08 share-internal**: opens the internal share of a folder (link + recipients) then closes — **non-mutating** (no share created), cleanup.
- **11 share-to-drive** (OS share sheet): real `sample.jpg` fixture in place (pushed by run-android.sh); cross-app device run = manual.

## Row menus on iOS (a11y) — FolderRow fix (device-validated iOS 26.4)
On iOS, Paper's `List.Item` (touchable via `onPress`) **groups its children into
ONE accessibility element** → the 3-dot button in the `right` slot was absorbed
(testID lost, a tap opened the folder instead of the menu). **Fix**: pull the menu
(and the chevron) out of the `right` slot as a **SIBLING** of the `List.Item`. Device-validated
iOS 26.4: `folder-actions:<name>` testIDs exposed → **04 delete, 07 pin, 08 share
GREEN**. Nuances: iOS selector = `folder-actions:<name>-container-outer-layer`
(the bare one is ambiguous) vs Android `folder-actions:<name>`; `inputText` eats the hyphen
on iOS (names without hyphens); the iOS session persists across `simctl install`.
Follow-up: same restructuring on `FileRow`.

## Favorites + offline: removal/purge (fixes + validation, 2026-07-05)
**Fixes (PR #34)**: favorite — refetch after toggle (optimistic removal `removedIds`
like trash.tsx) + folder passed with `_type`/`_rev` (otherwise `client.save` threw
« must have a `_type` property », swallowed → the favorite folder was **never**
removed); offline — `FileRow` drives « Retirer » on `isDirectPin` (otherwise re-pins)
+ recursive `unpinFolder` via `ancestorPins` (purges the blobs of subfolders).

**Device-validated**: favorite removal **Android = persists** (E2Efav gone after
relaunch — THE real bug); **iOS 26.4 = disappears live** (Favoris menu → « Retirer
des favoris » → `notVisible` EXIT=0, the optimistic removal works). Nested purge =
`OfflineFilesStore` unit test green.

**E2E flows 09 (favorite) / 12 (offline)**: the menu opens reliably on
iOS (`folder-actions:<name>-container-outer-layer` + **`waitForAnimationToEnd`**),
BUT tapping Paper **menu items by TEXT is flaky on iOS** (XCUITest
does not expose their text reliably — « Supprimer »/« Ajouter aux favoris » OK,
« Garder hors-ligne » fails at times). Reliable on Android. Also: the
**favorite→Favoris screen** propagation depends on pouch replication (the E2E « favorite
then verify Favoris » outruns the indexing → generous timeouts + pull-to-refresh).
**iOS E2E follow-up**: add **testIDs on the `Menu.Item`s** (like
`folder-actions`) for deterministic cross-platform taps.
