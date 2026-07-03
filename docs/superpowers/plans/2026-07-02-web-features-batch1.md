# Lot C (features) — Batch 1 : plan d'implémentation

> **For agentic workers:** subagent-driven, TDD, checkbox steps. Batch 1 of Lot C: the tractable high-value features. Signer / Importer / Personnaliser = batch 2 (later).

**Goal:** Ajouter au mobile 4 fonctionnalités web : **Favoris** (query + toggle étoile + onglet), **Excalidraw** + **Raccourci** (menu Créer), **Télécharger** (menu row).

**Base:** worktree `/Users/mmaudet/work/twake-drive-mobile-features`, branche `feat/web-features` (base `feat/web-structure` = Lot B). Réutilise Lot A (CozyIcon) + Lot B (onglet Favoris vide, menu Créer, menus row).

**Tech:** cozy-client (query + client.save), expo-router, Paper, react-native-svg, Jest.

## Global constraints
- Règle « mirror twake-drive-web » : mêmes API/mécanismes que le web (ex. Favoris = flag `cozyMetadata.favorite === true`).
- Icônes via `<CozyIcon>` (Lot A/B) : `star`/`starOutline` (favoris), `download`, `deviceBrowser` (raccourci). Excalidraw : SVG de marque déjà dans le registre (`excalidraw`).
- Couleurs du thème, pas d'inline style, TS strict. Commits terminés par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Tests : `npm --prefix <worktree> test -- <path>` ; typecheck : `npm --prefix <worktree> run typecheck` (attendu : erreurs pré-existantes `scope` + typed-routes uniquement ; ZÉRO nouvelle).

## Parallélisme
- **Task F** (Favoris : queries + helper + onglet) et **Task M** (menu Créer : Excalidraw + Raccourci) touchent des **fichiers disjoints** → exécutées **en parallèle**.
- **Task R** (actions row : toggle Favoris + Télécharger) touche FileRow/FolderRow, dépend du helper de Task F → **après F**.

---

### Task F : Favoris — query + toggle + onglet

**Files:** `src/client/queries.ts` (query), `src/files/favorites.ts` (create : toggle helper), `app/(drive)/favorites.tsx` (wire), tests co-localisés.

**Interfaces produites :** `favoritesQuery()` + `favoritesQueryAs` (miroir web `buildFavoritesQuery`) ; `toggleFavorite(client, file, next: boolean): Promise<void>` (client.save avec `cozyMetadata.favorite`) ; `isFavorite(file): boolean`.

- [ ] **Step 1** Test : `favoritesQuery()` cible `io.cozy.files` avec un partialIndex `cozyMetadata.favorite === true`, exclut trashed ; `toggleFavorite` appelle `client.save` avec `cozyMetadata.favorite` = next ; `isFavorite` lit le flag.
- [ ] **Step 2** Échec.
- [ ] **Step 3** Implémenter : dans `queries.ts`, `favoritesQuery = () => Q('io.cozy.files').where({ name: { $gt: null } }).partialIndex({ 'cozyMetadata.favorite': true, trashed: false }).indexFields(['name']).sortBy([{ name: 'asc' }])` (aligner sur le pattern des autres queries du fichier ; ajuster si l'API partialIndex diffère). `src/files/favorites.ts` : `isFavorite`, `toggleFavorite(client, file, next)` = `client.save({ ...file, cozyMetadata: { ...file.cozyMetadata, favorite: next } })`. Câbler `app/(drive)/favorites.tsx` : `useQuery(favoritesQuery(), { as: favoritesQueryAs })` → liste `FileRow`/`FolderRow` (réutiliser le rendu de `recent.tsx`), états loading/empty (`drive.emptyFavorites`).
- [ ] **Step 4** Tests + typecheck OK.
- [ ] **Step 5** Commit `feat(favorites): favorites query, toggle helper, wire the Favoris tab`. (Retry le commit si `index.lock` — une autre task peut committer en parallèle.)

---

### Task M : menu Créer — Excalidraw + Raccourci

**Files:** `app/(drive)/files/[...path].tsx` (FAB.Group), `src/files/createShortcut.ts` (+ éventuellement `createExcalidraw.ts`), i18n, tests.

**Interfaces produites :** items ajoutés au `FAB.Group` du screen files ; `createShortcut(client, dirId, name, url): Promise<doc>` (crée un `.url` `io.cozy.files` `class: 'shortcut'`, miroir web `ShortcutCreationModal`).

- [ ] **Step 1** Test : `createShortcut` crée un fichier `.url` avec l'URL fournie (mock client.create/collection) ; le screen files rend les items « Excalidraw » et « Raccourci » dans le FAB.
- [ ] **Step 2** Échec.
- [ ] **Step 3** Lire le `FAB.Group` actuel (`app/(drive)/files/[...path].tsx`) et les helpers de création existants (`createFolder`, `createCozyNote`, `createOfficeFile` dans `src/files/`). Ajouter 2 actions :
  - **Excalidraw** (icône registre `excalidraw`, gaté par un flag si le pattern existe) : créer un fichier excalidraw et l'ouvrir via le pattern WebView existant (miroir `note`/`docs`) OU naviguer vers la route d'édition ; si l'implémentation complète est lourde, créer le fichier vide (bon mime) + ouvrir via `buildCozyAppUrl` façon docs, et le noter.
  - **Raccourci** (icône `deviceBrowser`) : ouvrir un `CreateShortcutDialog` (Paper Dialog : champ nom + URL) → `createShortcut(...)` dans le dossier courant.
  - i18n : `drive.createMenu.excalidraw` / `drive.createMenu.shortcut` (fr/en).
- [ ] **Step 4** Tests + typecheck OK.
- [ ] **Step 5** Commit `feat(create): Excalidraw + Raccourci items in the create menu`. (Retry sur `index.lock`.)

---

### Task R : actions row — toggle Favoris + Télécharger (APRÈS Task F)

**Files:** `src/ui/FileRow.tsx`, `src/ui/FolderRow.tsx`, `src/files/download.ts` (helper), tests.

**Interfaces consommées :** `toggleFavorite`/`isFavorite` (Task F). **Produites :** `download(client, file): Promise<void>` (télécharge le blob localement / partage OS ; réutiliser `openFileNatively`/`buildFileStreamSource` existants).

- [ ] **Step 1** Test : `FileRow`/`FolderRow` menu `…` contient « Ajouter aux favoris » / « Retirer des favoris » (selon `isFavorite`) et « Télécharger » ; tap favoris appelle `toggleFavorite`, tap télécharger appelle `download`.
- [ ] **Step 2** Échec.
- [ ] **Step 3** Ajouter au menu `…` de `FileRow` et `FolderRow` : item **Favoris** (icône `starOutline`/`star` selon `isFavorite`, → `toggleFavorite(client, item, !isFavorite(item))` + refresh) ; item **Télécharger** (icône `download`, → `download(client, item)`). `src/files/download.ts` : réutiliser le pipeline de download existant (`openFileNatively` télécharge déjà en cache ; l'exposer comme « Télécharger »). i18n `drive.fileMeta.favorite`/`unfavorite`/`download`.
- [ ] **Step 4** Tests + typecheck OK.
- [ ] **Step 5** Commit `feat(actions): favorite toggle + download in row menus`.

---

### Task V : validation device
- [ ] Build (`npx expo run:android`, device sur WiFi = réseau Metro). Vérifier : onglet Favoris peuplé, toggle étoile, menu Créer avec Excalidraw/Raccourci, Télécharger. **Changement de routes/écrans → rebuild complet, pas simple reload.** Consigner les écarts.

## Auto-revue
Favoris query miroir web (§14.x Favoris) → F ; menu Créer Excalidraw/Raccourci → M ; Télécharger + toggle row → R ; validation → V. Types : `toggleFavorite`/`isFavorite` (F) consommés par R.
