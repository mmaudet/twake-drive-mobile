# Structure & navigation (Lot B) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aligner la navigation mobile sur le web Twake Drive : onglets Mon Drive/Favoris/Récents/Partages/Corbeille, header recherche/aide/avatar, tri A‑Z + bascule liste/grille, re-skin des icônes Paper vers CozyIcon.

**Architecture:** Réutilise les fondations du Lot A (thème, `<CozyIcon>` + registre, `<TwakeLogo>`). On refond `app/(drive)/_layout.tsx` (Tabs), on enrichit `src/ui/AppBar.tsx` (avatar/search/help), on ajoute des primitives (`ViewSwitcher`, `SortControl`, `FileGridItem`), et on migre les icônes Paper restantes.

**Tech Stack:** React Native 0.81 / Expo 54, expo-router (Tabs), React Native Paper (MD3), react-native-svg, cozy-client, Jest.

## Global Constraints

- Worktree `/Users/mmaudet/work/twake-drive-mobile-structure`, branche `feat/web-structure` (base `feat/web-charte-icons` = Lot A).
- **Onglets web (exactement 5) :** Mon Drive (`Cloud2`) · Favoris (`Star`) · Récents (`ClockOutline`) · Partages (`ShareExternal`) · Corbeille (`Trash`). Drives + Paramètres **hors barre** (menu avatar). Favoris = **écran vide** (« Aucun favori ») en Lot B.
- Icônes via `<CozyIcon name=.. size=.. color=.. />` (Lot A). Couleurs du thème uniquement, pas d'inline style, TS strict, composants fonctionnels.
- Règle « mirror web » : noms/icônes/comportements = ceux de twake-drive-web.
- Pré-existant à IGNORER (documenté Lot A) : 4 erreurs typecheck (`scope` ×2, typed-routes `login.tsx`/`index.tsx` ×2) + 4 suites de tests en échec (auth/client/pouchdb). N'ajouter AUCUNE nouvelle erreur.
- Assets cozy-ui déjà extraits localement : `/private/tmp/claude-501/-Users-mmaudet-work-twake-drive-mobile/6e2d0a80-4859-49e3-88bb-99d08ab595a5/scratchpad/cozy-ui-pack/package/transpiled/react/Icons/<Name>.js`.
- Tests : `npm --prefix <worktree> test -- <path>` ; typecheck : `npm --prefix <worktree> run typecheck`. Commits terminés par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1 : Étendre CozyIconDef au `stroke` + glyphes manquants

**Files:** Modify `src/ui/icons/registry.ts`, `src/ui/icons/CozyIcon.tsx` ; Test `src/ui/icons/CozyIcon.stroke.test.tsx`

**Interfaces:** Produces: `CozyIconDef` étendu = `{ viewBox: string; paths: Array<{ d: string; fill?: string; stroke?: string; strokeWidth?: number }> }`. Nouvelles clés registre : `chevronRight`, `dotsVertical`, `cog`, `logout`, `accountCircle`, `folderMultiple` (extraites du pack cozy-ui ; si un nom cozy diffère, prendre l'équivalent le plus proche et le noter).

- [ ] **Step 1** : Test qui échoue — `CozyIcon` rend un `<Path stroke=.. strokeWidth=..>` quand la def le fournit, et le registre expose les nouvelles clés.
```tsx
// src/ui/icons/CozyIcon.stroke.test.tsx
import React from 'react'; import { render } from '@testing-library/react-native'
import { CozyIcon } from './CozyIcon'; import { ICONS } from './registry'
test('nouvelles clés présentes', () => { for (const k of ['chevronRight','dotsVertical','cog','logout','accountCircle']) expect(ICONS[k]).toBeDefined() })
test('CozyIcon applique le stroke', () => { const { UNSAFE_root } = render(<CozyIcon name="chevronRight" />); expect(UNSAFE_root).toBeTruthy() })
```
- [ ] **Step 2** : Lancer → échec.
- [ ] **Step 3** : Étendre le type `CozyIconDef` (ajouter `stroke?`, `strokeWidth?` au path) ; dans `CozyIcon.tsx` passer `stroke={p.stroke}` `strokeWidth={p.strokeWidth}` au `<Path>`. Ajouter les nouvelles icônes au registre en extrayant `viewBox`+`d`(+`stroke` si présent) depuis le pack cozy-ui (`ChevronRight.js`/`Right.js`, `DotsVertical.js`/`Dots.js`, `Gear.js`/`Cog.js`, `Logout.js`, `AccountOutline.js`, `FolderMultiple.js` — prendre le fichier existant le plus proche, cf. `ls` du dossier Icons).
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(icons): add stroke support + nav glyphs to CozyIcon registry`.

---

### Task 2 : i18n + refonte des onglets (5 onglets web)

**Files:** Modify `app/(drive)/_layout.tsx`, `src/i18n/locales/fr.json`, `src/i18n/locales/en.json` ; Test `app/(drive)/_layout.test.tsx`

**Interfaces:** Consumes: `<CozyIcon>` (Lot A). Le layout ne déclare plus que 5 `Tabs.Screen` : `files` (titre `drive.myDrive`), `favorites` (nouveau, `drive.favorites`), `recent`, `shared` (titre `drive.shares`), `trash`. `shareddrives` et `settings` gardent leurs routes/écrans mais sont retirés de la barre (`href: null` sur leur `Tabs.Screen`, ou non déclarés dans les tabs).

- [ ] **Step 1** : i18n — ajouter `drive.myDrive` = "Mon Drive", `drive.favorites` = "Favoris", `drive.shares` = "Partages", `drive.emptyFavorites` = "Aucun favori" (fr + en équivalents).
- [ ] **Step 2** : Test qui échoue — le layout rend exactement 5 onglets avec les bons libellés.
- [ ] **Step 3** : Réécrire `_layout.tsx` : 5 `Tabs.Screen` (icônes `<CozyIcon name="cloud2|star|clockOutline|shareExternal|trash" .../>`). Garder `shareddrives` et `settings` accessibles hors barre via `<Tabs.Screen name="shareddrives" options={{ href: null }} />` (idem settings) pour ne pas casser leurs routes.
- [ ] **Step 4** : Tests + typecheck → OK (aucune route cassée).
- [ ] **Step 5** : Commit `feat(nav): restructure bottom tabs to the 5 web sections`.

---

### Task 3 : Onglet Favoris (écran vide)

**Files:** Create `app/(drive)/favorites/index.tsx` (+ `_layout.tsx` stack si le pattern des autres onglets l'exige) ; Test `app/(drive)/favorites/index.test.tsx`

**Interfaces:** Consumes: `EmptyState` (Lot A, migré CozyIcon), `AppBar`. Rend un `AppBar` (titre « Favoris ») + `EmptyState` (`drive.emptyFavorites`). Placeholder jusqu'au Lot C.

- [ ] **Step 1** : Test — l'écran rend le titre « Favoris » + le message vide.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Implémenter l'écran (calquer un onglet plat existant type `recent.tsx` : `ScreenContainer` + `AppBar` + `EmptyState`). Icône d'état `star`.
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(favorites): add empty Favoris tab (feature in Lot C)`.

---

### Task 4 : Menu avatar dans l'AppBar (Paramètres, Drives, Logout)

**Files:** Modify `src/ui/AppBar.tsx` ; Test `src/ui/AppBar.avatar.test.tsx`

**Interfaces:** Consumes: `useAuth` (logout), `router`, `<CozyIcon>`. L'AppBar affiche à droite un `Avatar.Text` (initiales) ouvrant un `Menu` Paper avec : « Paramètres » (→ `/(drive)/settings`), « Drives partagés » (→ `/(drive)/shareddrives`), « Se déconnecter » (→ `logout()`). Remplace le menu 3-points actuel sur les écrans racines.

- [ ] **Step 1** : Test — tap avatar ouvre le menu ; les 3 items sont présents.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Lire l'AppBar actuel (menu `dots-vertical`/logout existant). Remplacer par `Avatar.Text` + `Menu` (items ci-dessus, icônes `cog`/`folderMultiple`/`logout`). Récupérer les initiales via la session/`useAuth` (ou un fallback « MM »).
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(header): avatar menu with Settings, Shared drives, Logout`.

---

### Task 5 : Bouton recherche + écran de recherche (par nom)

**Files:** Modify `src/ui/AppBar.tsx` (bouton `Magnifier`) ; Create `app/(drive)/search.tsx` ; Test `app/(drive)/search.test.tsx`

**Interfaces:** Consumes: `cozy-client` `useQuery`, `FileRow`/`FolderRow`. Bouton recherche dans l'AppBar → `router.push('/(drive)/search')`. Écran : `TextInput` (debounce) → `Q('io.cozy.files').where({ name: { $regex } , trashed:false })` (ou `partialIndex` sur name) → liste de résultats (FileRow/FolderRow) ; états loading/empty.

- [ ] **Step 1** : Test — l'écran rend le champ ; une saisie déclenche la query (mock cozy-client) ; état vide affiché sans saisie.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Implémenter le bouton (AppBar) + l'écran search (query par nom, debounce ~300ms, réutiliser le rendu de row existant). Query alignée sur ce que fait twake-drive-web pour la recherche fichiers si trivial, sinon `where name`.
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(search): header search button + file name search screen`.

---

### Task 6 : Bouton aide (?)

**Files:** Modify `src/ui/AppBar.tsx` ; Test étendu `src/ui/AppBar.avatar.test.tsx`

**Interfaces:** Bouton `?` (pas d'icône cozy « help » standard → utiliser `Info` du registre, ou ajouter `HelpCircle` en Task 1 si dispo). Action : ouvrir l'URL d'aide Twake (`Linking.openURL('https://twake.app')` ou un lien doc), ou un petit dialog. Minimal.

- [ ] **Step 1** : Test — le bouton aide est présent dans l'AppBar racine.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Ajouter le bouton (`CozyIcon name="info"` faute de glyphe help, ou `helpCircle` si extrait) → `Linking.openURL` vers l'aide.
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(header): add help button`.

---

### Task 7 : ViewSwitcher (bascule liste/grille) + contexte

**Files:** Create `src/ui/ViewSwitcher.tsx`, `src/ui/useViewMode.ts` ; Test `src/ui/ViewSwitcher.test.tsx`

**Interfaces:** Produces: `useViewMode(): { mode: 'list'|'grid'; setMode }` (état persistant MMKV optionnel, sinon état simple/contexte) ; `<ViewSwitcher />` = 2 `IconButton` (`listMin`/`mosaicMin`) togglant le mode.

- [ ] **Step 1** : Test — `ViewSwitcher` bascule le mode ; l'icône active reflète le mode.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Implémenter le hook (contexte React ou store léger) + le composant (2 icônes cozy, l'active en `primary`).
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(toolbar): list/grid ViewSwitcher + view-mode state`.

---

### Task 8 : Rendu grille (FileGridItem) + câblage dans la liste

**Files:** Create `src/ui/FileGridItem.tsx` ; Modify les écrans de liste (au moins `app/(drive)/files/[...path].tsx`) ; Test `src/ui/FileGridItem.test.tsx`

**Interfaces:** Consumes: `useViewMode` (Task 7), `FileThumbnail`/`getFileIcon`, `<CozyIcon>`. `<FileGridItem file onPress onLongPress selected />` = vignette + nom (2 lignes) en tuile. L'écran de liste : quand `mode==='grid'`, rendre la `FlatList` avec `numColumns={3}` (clé stable) + `FileGridItem` ; sinon la liste actuelle. Le ViewSwitcher est posé dans la toolbar de l'écran.

- [ ] **Step 1** : Test — `FileGridItem` rend le nom + une vignette/icône pour un doc fictif.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Implémenter `FileGridItem` ; câbler `numColumns` + `key` (remonter la key sur changement de numColumns) dans l'écran files ; toolbar avec `<ViewSwitcher/>`.
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(grid): FileGridItem + grid rendering wired to ViewSwitcher`.

---

### Task 9 : SortControl (A‑Z / Z‑A)

**Files:** Create `src/ui/SortControl.tsx`, `src/ui/useFolderSort.ts` ; Modify écrans de liste ; Test `src/ui/SortControl.test.tsx`

**Interfaces:** Produces: `useFolderSort(): { sort: { attr:'name'; dir:'asc'|'desc' }; setSort }` ; `<SortControl />` = libellé « A‑Z »/« Z‑A » ouvrant un bottom-sheet (Paper `Menu`/dialog) à 2 options radio. La liste applique le tri sur `name`.

- [ ] **Step 1** : Test — `SortControl` bascule asc/desc ; libellé reflète l'état.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Implémenter le hook + le composant (radio A‑Z/Z‑A) ; appliquer le tri dans l'écran de liste (sur les données déjà chargées, ou via le selector de query si trivial).
- [ ] **Step 4** : Tests + typecheck → OK.
- [ ] **Step 5** : Commit `feat(toolbar): A-Z/Z-A sort control`.

---

### Task 10 : Re-skin des icônes Paper (rows/appbar) → CozyIcon

**Files:** Modify `src/ui/FileRow.tsx`, `src/ui/FolderRow.tsx`, `src/ui/AppBar.tsx`, `src/ui/FolderPicker/FolderPickerRow.tsx` (et menus `…` de rows) ; Test représentatif `src/ui/FolderRow.icons.test.tsx`

**Interfaces:** Consumes: `<CozyIcon>` + les glyphes du registre (Task 1). Remplacer les `List.Icon icon="chevron-right"`, `IconButton icon="dots-vertical"`, etc. par des `<CozyIcon>` (via la prop `icon` de Paper acceptant une fonction `() => <CozyIcon .../>`, ou en remplaçant le composant). Conserver `size`/`color` du thème.

- [ ] **Step 1** : Test — `FolderRow` rend un `Svg` (CozyIcon) pour son chevron/menu au lieu d'un glyph Material.
- [ ] **Step 2** : Échec.
- [ ] **Step 3** : Migrer les usages Paper `icon="..."` des rows/appbar vers `<CozyIcon>` (Paper `List.Icon`/`IconButton`/`Menu.Item` acceptent `icon={() => <CozyIcon .../>}`). Laisser les surfaces non couvertes par ce lot inchangées.
- [ ] **Step 4** : `grep -rn "icon=\"" src/ui/FileRow.tsx src/ui/FolderRow.tsx src/ui/AppBar.tsx` → plus de glyphes Material sur ces fichiers ; tests + typecheck OK.
- [ ] **Step 5** : Commit `refactor(icons): re-skin rows/appbar Paper icons to CozyIcon`.

---

### Task 11 : Validation device

**Files:** aucun (validation)

- [ ] **Step 1** : Build : `cd <worktree> && JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" npx expo run:android` (device WiFi = même réseau que Metro).
- [ ] **Step 2** : Vérifier sur le Pixel : 5 onglets (icônes cozy), header avec avatar/recherche/aide, menu avatar (Paramètres/Drives/Logout), tri A‑Z, bascule liste/grille, icônes des rows en cozy. Comparer aux captures web.
- [ ] **Step 3** : Consigner (ledger) tout écart visuel + Minor.

## Auto-revue (couverture spec)

- §2.1 onglets → Task 2 ; §2.2 header (search/help/avatar) → Tasks 4-6 ; §2.3 tri+vue → Tasks 7-9 ; §2.4 re-skin icônes → Tasks 1,10 ; Favoris vide → Task 3 ; validation → Task 11. ✓
- Bloqueur Lot A (stroke fileType) levé en Task 1. ✓
- Types cohérents : `CozyIconDef` étendu (Task 1) consommé partout ; `useViewMode`/`useFolderSort` définis avant usage.
