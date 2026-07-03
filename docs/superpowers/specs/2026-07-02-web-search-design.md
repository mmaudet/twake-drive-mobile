# Recherche de fichiers — Design

**Date:** 2026-07-02
**Statut:** Design **validé** (« GO » le 2026-07-02) — implémentation à faire
**Branche / worktree:** `feat/web-search` → `twake-drive-mobile-search`
**Backlog:** alignement `twake-drive-web` (la recherche existe sur le web, absente sur mobile)

---

## 1. Contexte & objectif

L'app mobile **n'a aucune recherche de fichiers** aujourd'hui (vérifié : zéro `Searchbar`,
zéro route, zéro endpoint — la seule occurrence « recherche » est l'autocomplétion de
contacts du partage). Le web (`twake-drive-web`) en a une ; c'est un manque d'alignement.

Parcours cible :

> Navigateur de fichiers → **loupe** dans l'en-tête → écran de recherche dédié →
> l'utilisateur tape → résultats de **tout le Drive** au fil de la frappe → tap sur un
> résultat → aperçu du fichier / navigation dans le dossier.

**Fait porteur du design :** tout le métadonnées-fichiers est **déjà répliqué en local**.
`getLinks.ts` déclare `offlineDoctypes = ['io.cozy.files', 'io.cozy.contacts']` en
`strategy: 'fromRemote'`, et le `PouchLink` est **premier dans la chaîne** → il intercepte
toute requête `io.cozy.files` et la sert depuis PouchDB local. La recherche est donc
**locale, hors-ligne, sur tout le Drive, par nom de fichier** — sans aller-retour serveur.

**Contrainte backend :** il n'existe **aucune API full-text / de recherche** côté cozy
(ni dans `cozy-client`, `cozy-stack-client`, `cozy-pouch-link`). Le seul mécanisme de
requête sur `io.cozy.files` est **Mango `_find`** (sélecteurs CouchDB). La recherche par
**nom** se fait donc via un sélecteur `name: { $regex }`. La recherche **dans le contenu**
des fichiers est hors de portée (aucun backend ne l'offre ici).

---

## 2. Séquencement (baseline vert d'abord)

La branche est basée sur `main` (convention des branches `web-*`). `main` porte 9 tests
rouges pré-existants, corrigés dans la **PR de nettoyage #5** (`fix/jest-test-baseline`,
44/44 vert). Pour développer sur un socle vert :

1. **Faire atterrir la PR #5** dans `main`, **puis** rebaser `feat/web-search` sur `main` ; **ou**
2. **Empiler** temporairement `feat/web-search` sur `fix/jest-test-baseline` jusqu'au merge de #5.

> Rappel dette pré-existante `main` (hors de cette feature) : `npm run lint` (292, déjà réglé
> sur `feat/android-support` via `7e9a51a`) et `npm run typecheck` (2 erreurs cozy-client `scope`).

---

## 3. Périmètre

### v1 (cette spec)
- **Recherche globale** sur tout le Drive personnel (`io.cozy.files`), quel que soit le dossier ouvert.
- Correspondance par **nom de fichier/dossier**, **sous-chaîne « contient »**, **insensible à la casse**.
- **Écran dédié** ouvert depuis une **loupe** dans l'en-tête du navigateur de fichiers.
- Résultats **au fil de la frappe** : anti-rebond ~300 ms, déclenchement dès **2 caractères**, **limite 50**.
- Fichiers **et** dossiers mélangés, triés par nom.
- Tap fichier → **aperçu** (`openFileFromList`) ; tap dossier → **navigation** dans le dossier.
- **Hors-ligne** : fonctionne à l'identique (servi par PouchDB local).

### Non-objectifs (YAGNI — repoussés)
- **Recherche dans le contenu** des fichiers (full-text) — aucun backend ne l'offre ici.
- **Filtres** (type, date, taille) et **tri avancé** (pertinence, récence).
- **Insensibilité aux accents** (é≡e) — nécessiterait un champ normalisé ou un filtre JS
  (Approche B) ; v1 = casse seule, cohérent avec l'autocomplétion contacts existante.
- **Historique / suggestions** de recherche récentes.
- **Shared drives** (non entièrement répliqués localement — « poorly implemented » ailleurs).
- **Surlignage** de la portion correspondante dans le nom.
- **Emplacement (chemin) sous chaque résultat** : nice-to-have, voir §12.3.

---

## 4. Architecture — Approche A (Mango `$regex` local)

Une nouvelle requête `io.cozy.files` par `$regex` sur `name`, **consommée exactement comme
le navigateur de fichiers** (`useQuery` + états `loading`/`failed`/`empty` + `fetchMore`).
`PouchLink` la sert depuis PouchDB local → global + hors-ligne, sans code réseau.

```
┌─ Écran de recherche (app/search.tsx, route 1er niveau) ───┐
│  TextInput (autofocus)                                     │
│     │  onChangeText                                        │
│     ▼                                                      │
│  term (state) ──useDebouncedValue(300ms)──► debouncedTerm  │
│     │  (enabled: length >= 2)                              │
│     ▼                                                      │
│  useQuery(searchFilesQuery(debouncedTerm), { as, enabled })│
│     │                                                      │
│     ▼                                                      │
│  PouchLink  ──sert depuis──►  PouchDB local (SQLite)       │
│     │        scan `$regex` en mémoire, borné à 50           │
│     ▼                                                      │
│  FlatList → FileRow / FolderRow (branché sur item.type)    │
│     tap fichier → openFileFromList ; tap dossier → push    │
└────────────────────────────────────────────────────────────┘
```

**Compromis assumé :** `$regex` sur PouchDB est un **scan en mémoire** (non index-accéléré,
`pouchdb-find`), donc O(n) sur les docs `io.cozy.files` locaux. Atténué par : anti-rebond,
minimum 2 caractères, `limitBy(50)`, et un **index `name` préchauffé** (§7) pour éviter un
premier scan lent. Pour un Drive personnel typique (quelques milliers de docs), un scan JS
débouncé se mesure en dizaines de ms — acceptable.

---

## 5. Composants & modules

### À construire

| Module | Rôle |
|---|---|
| `src/client/queries.ts` → `searchFilesQuery(term)` / `searchFilesQueryAs(term)` | **Miroir de `buildDriveQuery`** : `Q('io.cozy.files').where({ name: { $regex }, trashed: { $ne: true } }).partialIndex({ _id: { $nin: HIDDEN_ROOT_DIR_IDS } }).indexFields(['name']).sortBy([{ name: 'asc' }]).limitBy(50)`. Clé cache `as` = `` `io.cozy.files/search/${term}` `` (convention `…QueryAs`). |
| `src/search/buildSearchRegex.ts` | **Interface d'isolation** du matching. Échappe les métacaractères regex de la saisie utilisateur + insensible à la casse (flag `i` ou `(?i)`). Testable seule (comme `contactSuggestions.ts`). |
| `src/search/useDebouncedValue.ts` | Petit hook générique de debounce (~300 ms). Testable seul. |
| `app/search.tsx` | Écran **de 1er niveau** (⚠️ **pas** `app/(drive)/search.tsx` : `(drive)` est un `Tabs`, ça créerait un onglet) : `Searchbar` (paper, autofocus) + `useQuery` (`enabled: term.length >= 2`) + `FlatList` réutilisant `LoadingState`/`EmptyState`/`ErrorState` + `FileRow`/`FolderRow`. Enregistré dans `app/_layout.tsx` (comme `move`/`share`/`preview`). |
| `src/ui/AppBar.tsx` → prop optionnelle `onSearch` | Ajoute une **loupe** (icône `magnify`) dans l'en-tête hors mode sélection → `router.push('/(drive)/search')`. Changement minimal, rétro-compatible. |
| `src/pouchdb/getLinks.ts` → warmup index `name` | Ajoute une entrée à `filesIndexWarmupQueries` (`indexFields(['name'])`, `sortBy name`) pour pré-bâtir l'index que la recherche utilise — **même motif que les warmups existants**. |
| i18n `search.*` (`src/i18n/locales/fr.json` + `en.json`) | `placeholder`, `title`, `empty`, `hint` (« Tapez au moins 2 caractères »), `error`. |

### Réutilisé tel quel (aucune modif)

- **`FileRow`** (`src/ui/FileRow.tsx`) / **`FolderRow`** (`src/ui/FolderRow.tsx`) — en v1,
  seul `onPress` est câblé (pas de multi-sélection ni d'actions swipe dans la recherche).
- **`openFileFromList(client, router, file)`** (`src/files/openFromList.ts`) — tap fichier.
- **Navigation dossier** : `router.push('/(drive)/files/' + folder._id)` — le catch-all
  `[...path]` ouvre le dossier par son id (`currentDirId = path[last]`).
- **`LoadingState` / `EmptyState` / `ErrorState`** + `getErrorMessageKey` — mêmes états que le navigateur.
- **`useQuery` de cozy-client** + `fetchStatus` / `lastError` / `fetchMore` (pagination).
- **`ScreenContainer`**, `FileQueryResult` (le type retourné, avec `_id, name, type, dir_id, path, …`).
- **`HIDDEN_ROOT_DIR_IDS`** (`src/client/queries.ts`) — exclut `shared-drives-dir` + `trash-dir`.

---

## 6. Data flow détaillé

1. Sur le navigateur de fichiers, tap **loupe** (en-tête) → `router.push('/search')`.
2. `search.tsx` monte, `TextInput` autofocus. L'utilisateur tape → `term` (state).
3. `useDebouncedValue(term, 300)` → `debouncedTerm`.
4. `useQuery(searchFilesQuery(debouncedTerm), { as: searchFilesQueryAs(debouncedTerm), enabled: debouncedTerm.length >= 2 })`.
   - `< 2` caractères → requête désactivée, écran en état **invite** (`search.hint`).
5. `PouchLink` intercepte → `db.find({ selector: { name: { $regex }, trashed: { $ne: true } }, … })`
   sur PouchDB local → matches (≤ 50), triés par nom.
6. Rendu : `FlatList` sur `data`, `renderItem` branche `item.type` → `FolderRow` / `FileRow`.
7. Tap **fichier** → `openFileFromList(client, router, file)` (aperçu/éditeur selon type).
   Tap **dossier** → `router.push('/(drive)/files/' + folder._id)`.
8. `fetchStatus === 'loading'` → `LoadingState` ; `'failed'` → `ErrorState` + retry ;
   0 résultat (terme ≥ 2) → `EmptyState` (`search.empty`).

---

## 7. Détails techniques clés

### Sélecteur Mango
```
Q('io.cozy.files')
  .where({ name: { $regex: buildSearchRegex(term) }, trashed: { $ne: true } })
  .partialIndex({ _id: { $nin: HIDDEN_ROOT_DIR_IDS } })   // exclut shared-drives-dir + trash-dir
  .indexFields(['name'])
  .sortBy([{ name: 'asc' }])
  .limitBy(50)
```
`sortBy` doit rester aligné sur `indexFields` (contrôlé par `checkSortOrder` du DSL).

### `buildSearchRegex` (sécurité + correction)
La saisie est **échappée** (`. * + ? ( ) [ ] { } ^ $ | \`) avant d'être injectée dans le
`$regex` — sinon un caractère spécial casse la requête ou permet une **injection de regex**
(ex. `(a+)+` catastrophique). Résultat insensible à la casse. Ex. `a.b` → `/a\.b/i`.

### Index & warmup
`$regex` n'est **jamais** index-accéléré (scan mémoire). L'index `name` sert seulement à
`pouchdb-find` de point d'entrée + au tri. Sans warmup, le **premier** search lazy-bâtit
l'index en scannant tous les docs (freeze de quelques secondes). → ajouter un warmup
`name` dans `getLinks.ts` (`filesIndexWarmupQueries`), exactement comme les index
`['dir_id','type','name']` et `['updated_at']` existants.

### Réglages (défauts, §12)
Anti-rebond **300 ms**, minimum **2 caractères**, `limitBy(50)`. Pagination possible via
`fetchMore` si besoin (comme le navigateur), mais 50 suffit en v1.

### Hors-ligne
Aucun chemin spécifique : la même requête `where` est routée vers PouchDB par `PouchLink`,
en ligne comme hors-ligne. Fraîcheur = réplication périodique existante (30 s).

---

## 8. Cas limites & erreurs

| Cas | Comportement v1 |
|---|---|
| `< 2` caractères | Requête désactivée → écran **invite** (`search.hint`) |
| 0 résultat (terme ≥ 2) | `EmptyState` (`search.empty`) |
| Erreur de requête (rare, local) | `ErrorState` + retry |
| Caractères regex spéciaux dans la saisie | **Échappés** par `buildSearchRegex` (pas de crash / injection) |
| Éléments à la corbeille | Exclus (`trashed: { $ne: true }`) |
| Conteneurs cachés (`shared-drives-dir`, `trash-dir`) | Exclus (`partialIndex _id $nin HIDDEN_ROOT_DIR_IDS`) |
| Très gros Drive | Scan mémoire borné 50 + debounce + index préchauffé |
| Hors-ligne | Fonctionne (PouchDB local) — pas d'état d'erreur réseau |
| Tap dossier trouvé | Ouvre `/(drive)/files/<id>` ; back revient à la recherche |
| Fichier non répliqué (ex. shared drive) | Hors périmètre v1 (non trouvé) |

---

## 9. Sécurité

- **Échappement regex obligatoire** de la saisie (`buildSearchRegex`) — empêche l'injection
  de regex et les motifs catastrophiques (ReDoS) sur le scan local.
- **Aucun nouveau scope OAuth** : lecture `io.cozy.files` déjà accordée (`src/auth/scopes.ts`).
- La recherche ne voit **que** les fichiers de l'utilisateur déjà répliqués localement —
  pas d'élévation d'accès, pas de fuite entre comptes.
- Aucune donnée envoyée au réseau par la recherche (tout est local).

---

## 10. i18n

Nouvelles clés `search.*` (`src/i18n/locales/fr.json` + `en.json`) :
`placeholder` (« Rechercher dans le Drive »), `title`, `hint` (« Tapez au moins 2 caractères »),
`empty` (« Aucun fichier trouvé »), `error`. Réutilise les clés d'erreur génériques existantes
via `getErrorMessageKey` là où c'est possible.

---

## 11. Tests

- **Unit `buildSearchRegex`** : échappement des métacaractères, insensibilité à la casse,
  chaîne vide, caractères Unicode (style `contactSuggestions.test.ts`).
- **Unit `useDebouncedValue`** : émet après le délai, annule sur frappe rapide (fake timers).
- **Unit `searchFilesQuery`** : forme du sélecteur (`$regex`, `trashed`, `partialIndex`,
  `limitBy`, `sortBy`) — style `getLinks.test.ts` / requêtes existantes.
- **Composant `app/(drive)/search.tsx`** (mock `useQuery` + `useRouter`) : invite `< 2` car.,
  états loading/empty/error, rendu des résultats, debounce, navigation au tap
  (fichier → `openFileFromList`, dossier → `router.push`). Style `share/[fileId].test.tsx`.
- **Manuel** : Android + iOS — terme court, terme sans résultat, casse, hors-ligne, gros Drive,
  tap fichier (types variés) et tap dossier.

---

## 12. Décisions (tranchées le 2026-07-02 — « GO »)

Défauts recommandés retenus (vetoables à la relecture) :

1. **Approche A** (Mango `$regex` local, miroir `buildDriveQuery`) — pas d'Approche B
   (fetch+filtre JS) ni C (serveur), inutiles vu la réplication locale complète.
2. **Écran dédié** ouvert par une **loupe** dans l'en-tête (vs barre inline) — recherche
   globale, ne surcharge pas chaque vue de dossier, correspond au web.
3. **Emplacement du picker de résultats** : rangs `FileRow`/`FolderRow` **tels quels** en v1
   (nom + icône). Afficher le **chemin/emplacement** sous chaque résultat (les résultats
   viennent de partout) = amélioration rapide post-v1 (le champ `path` est déjà dans
   `FileQueryResult` ; nécessiterait un sous-titre optionnel sur `FileRow` ou un
   `SearchResultRow` dédié).
4. **Requête unique** mixte (fichiers + dossiers) triée par nom, plutôt que deux requêtes
   folders/files séparées comme le navigateur (le tri « dossiers d'abord » n'a pas de sens
   en recherche).
5. Correspondance **sous-chaîne « contient »**, **insensible à la casse** ; accents = post-v1.

---

## 13. Découpage d'implémentation

1. **Helpers** `buildSearchRegex` + `useDebouncedValue` (+ tests) — indépendants de l'UI.
2. **Requête** `searchFilesQuery` / `searchFilesQueryAs` dans `queries.ts` (+ test) + warmup
   index `name` dans `getLinks.ts`.
3. **Écran** `app/(drive)/search.tsx` branché sur la requête (états loading/empty/error,
   `FileRow`/`FolderRow`, navigation) + enregistrement route.
4. **Point d'entrée** : prop `onSearch` (loupe) sur `AppBar`, câblée sur le navigateur de fichiers.
5. **i18n** `search.*` (fr + en) + polish (autofocus, clear, clavier).
6. **PR dédiée** + tests unitaires + matrice manuelle (Android/iOS).
