# Twake Drive Mobile — Offline cache (design)

> **Statut :** validé. À implémenter via le skill `writing-plans`.
>
> **Scope v1 (cette spec) :** option A — *browse offline read-only* sur les métadonnées (`io.cozy.files` + `io.cozy.sharings`).
>
> **Scope v2 (référencé, à brainstormer plus tard) :** option D — *Make available offline explicite* (épingler un dossier pour que ses binaires soient téléchargés et restent dispos hors-ligne). Hors de cette spec.

## 1. Contexte & objectif

L'app `twake-drive-mobile` n'a aujourd'hui aucune persistance locale au-delà du cache JS de cozy-client (perdu au cold start). En offline, toutes les queries échouent et l'utilisateur a un ErrorState plein écran.

L'objectif : permettre à un utilisateur déjà connecté **au moins une fois** de naviguer dans son drive même hors connexion (browse, voir métadonnées, voir le statut de partage). Les mutations (delete, share, create folder, etc.) restent online-only dans cette v1.

**Approche retenue :** intégrer `cozy-pouch-link` v60.24, qui :
- s'insère en première position dans la link chain de cozy-client
- réplique les doctypes choisis dans une base locale (SQLite via `@op-engineering/op-sqlite` sur RN, IndexedDB sur web — on ne s'occupe que du natif)
- intercepte les **read queries** sur ces doctypes (servies depuis SQLite, sub-ms)
- forwarde les **mutations** au StackLink (cozy-stack refuse les écritures via le mécanisme de réplication pouch/couch — on configure `strategy: 'fromRemote'` qui fait exactement ça)

C'est aussi ce que `twake-drive-web` (cozy-drive) utilise. Cohérence avec la web confirmée.

## 2. Périmètre

### Inclus

- Réplication métadonnées de `io.cozy.files` (toutes les entrées non system) et `io.cozy.sharings`.
- Browse offline complet : Mes fichiers, Récents, Corbeille (les trois consomment `io.cozy.files`).
- Statut de partage offline (`SharedBadge` sur les rows).
- Métadonnées offline dans le `FileMetadataSheet` (size, date, owner, path).
- Sync indicator subtil dans l'AppBar (pastille).
- Lifecycle automatique : sync en foreground, pause en background, catchup au retour de connectivité.
- Snackbar informatif quand l'utilisateur tente une mutation hors-ligne.

### Exclus

- Mutations offline (create folder, delete, rename, move, share). Toutes nécessitent online → Snackbar « Disponible en ligne » sinon.
- **Binaires** des fichiers (PDF, image, vidéo). Le viewer in-app actuel stream depuis `/files/download` qui requiert online — c'est OK, scope D s'en occupera.
- Onglet **Drives partagés** : son contenu vient de `/sharings/drives/{driveId}/{folderId}`, route différente, pas répliquée nativement. La liste des drives (qui vit dans `shared-drives-dir` et donc dans `io.cozy.files`) reste visible offline ; le clic sur un drive en offline → ErrorState « Disponible en ligne ».
- `io.cozy.contacts` (autocomplete share) et `io.cozy.apps` (feature flags) : non répliqués. Le partage étant online-only de toute façon, les contacts ne sont consultés qu'en ligne. Les flags reverteront à leur valeur par défaut offline.
- Conflit resolution / mutation queue : scope C, hors v1.
- Migrations de schéma SQLite : c'est une nouvelle app, base de zéro à chaque user, pas de migration à gérer.
- Realtime (websocket changes feed) : polling 30s suffit. Pourra être ajouté plus tard via `cozy-client/RealTimeQueries` si besoin.

## 3. Décisions de design (récap)

| Question | Décision |
|---|---|
| Profondeur d'offline | A (browse read-only) en v1, D (épinglage explicite) en v2 |
| Doctypes répliqués | Standard : `io.cozy.files` + `io.cozy.sharings` |
| Cycle de réplication | Polling 30s **+** lifecycle-aware (start au foreground, stop au background) |
| UX du sync | Subtil : pastille dans l'AppBar (`idle` invisible, `syncing` 🔄, `offline` ⚠️) |
| Initial sync | Background avec indicateur. App utilisable immédiatement via StackLink fallback pendant que `replicateOnce` tourne |
| Storage local | SQLite via `@op-engineering/op-sqlite` (pas d'AsyncStorage). Pouch utilise op-sqlite via `SQLiteQuery` engine ; le platform.storage utilise une table `kv` dans un fichier `platform-storage.sqlite` séparé |
| Stratégie de réplication par doctype | `strategy: 'fromRemote'` pour `io.cozy.files` et `io.cozy.sharings` → mutations forwardées au StackLink, jamais appliquées localement |
| Mutations offline | Snackbar « Disponible quand vous serez en ligne », bouton ne déclenche rien |

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ app/(drive)/_layout.tsx                                      │
│   <SharingProvider>                                          │
│     <SyncProvider>     ← NEW : pilote lifecycle + statut     │
│       <Tabs />                                               │
│     </SyncProvider>                                          │
│   </SharingProvider>                                         │
└──────────────────────────────────────────────────────────────┘
              │
              ▼  consume
┌──────────────────────────────────────────────────────────────┐
│ src/sync/                                                    │
│   SyncProvider.tsx        ← context, lifecycle, status       │
│   useSyncStatus.ts        ← hook { status, lastSyncedAt }    │
│   requireOnline.ts        ← guard helper pour mutations      │
└──────────────────────────────────────────────────────────────┘
              │
              ▼  configure CozyClient
┌──────────────────────────────────────────────────────────────┐
│ src/client/                                                  │
│   createClient.ts (modif)  ← link chain : CozyPouchLink,     │
│                              StackLink                       │
│   pouchPlatform.ts (NEW)   ← platform RN                     │
│   sqliteStorage.ts (NEW)   ← SQLite KV pour platform.storage │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│ cozy-pouch-link@60.24                                        │
│   CozyPouchLink                                              │
│   PouchManager (Loop 30s, lifecycle start/stop)              │
│   SQLiteQuery (op-sqlite-backed)                             │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│ Filesystem (sandbox de l'app)                                │
│   io_cozy_files.sqlite      (Pouch metadata)                 │
│   io_cozy_sharings.sqlite   (Pouch metadata)                 │
│   platform-storage.sqlite   (KV : lastSeq, adapterName, ...) │
└──────────────────────────────────────────────────────────────┘
```

L'architecture **ne touche aucun composant métier existant** (FilesScreen, FileRow, ShareSheet, SharingProvider, FileMetadataSheet…). Seuls :
- `createClient.ts` est modifié pour insérer le link.
- `(drive)/_layout.tsx` est wrappé d'un `SyncProvider`.
- `AppBar.tsx` reçoit un nouveau composant à droite (`SyncBadge`).
- Les helpers de mutation existants (`softDeleteEntry`, `createFolder`, etc.) ajoutent un `requireOnline()` guard et un `pouchLink.scheduleImmediateTask()` post-succès.

## 5. Composants

### `src/client/sqliteStorage.ts` (nouveau)

```ts
interface SqliteStorage {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
  destroy: () => Promise<void>
}
```

- Ouvre `platform-storage.sqlite` en lazy au premier appel.
- `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)` au boot.
- En cas d'échec d'open : log + retourne null/no-op (graceful degradation, l'app fonctionne en ligne).
- ~50 lignes.

### `src/client/pouchPlatform.ts` (nouveau)

Expose le shape `LinkPlatform` requis par cozy-pouch-link :

```ts
import { open as openSqlite } from '@op-engineering/op-sqlite'
import NetInfo from '@react-native-community/netinfo'
import PouchDB from 'pouchdb-core'
import { SQLiteQuery } from 'cozy-pouch-link'
import { sqliteStorage } from './sqliteStorage'

export const pouchPlatform = {
  storage: sqliteStorage,
  events: {
    addEventListener: (eventName, handler) => { /* proxie vers AppState ou NetInfo selon le nom */ },
    removeEventListener: (eventName, handler) => { /* idem */ }
  },
  pouchAdapter: PouchDB,                              // requis par le shape, peu utilisé en pratique car SQLiteQuery prend le relais
  queryEngine: SQLiteQuery,                           // ← le moteur mobile
  isOnline: async () => (await NetInfo.fetch()).isConnected === true
}
```

### `src/client/createClient.ts` (modif)

```ts
import CozyPouchLink from 'cozy-pouch-link'
import { pouchPlatform } from './pouchPlatform'

const pouchLink = new CozyPouchLink({
  doctypes: ['io.cozy.files', 'io.cozy.sharings'],
  doctypesReplicationOptions: {
    'io.cozy.files':    { strategy: 'fromRemote' },
    'io.cozy.sharings': { strategy: 'fromRemote' }
  },
  platform: pouchPlatform
  // pas d'initialSync: true → on laisse le fallback StackLink servir pendant la première sync
})

const client = new CozyClient({
  links: [pouchLink],   // CozyClient injecte StackLink à la fin de la chain par défaut
  uri,
  token,
  // ...
})
```

Exporte aussi `pouchLink` (singleton) pour que `SyncProvider` puisse appeler `startManager()`/`stopManager()`/`scheduleImmediateTask()`.

### `src/sync/SyncProvider.tsx` (nouveau)

Wrap le groupe `(drive)`. Trois responsabilités :

1. **Lifecycle** :
   - À l'auth : `pouchLink.startManager()`.
   - `AppState.addEventListener('change')` : sur `'active'` → `scheduleImmediateTask()` (catchup), sur `'background'` → `stopManager()`.
   - `NetInfo.addEventListener` : `online → offline` → `stopManager()` ; `offline → online` → `startManager()` + `scheduleImmediateTask()`.

2. **Status state** : maintient `{ status, lastSyncedAt, error }` en s'abonnant aux events `PouchManager` (`sync_start`, `sync_end`, `sync_error`) ou en observant les retours de `scheduleImmediateTask`.
   - `'idle'` : sync à jour, online.
   - `'syncing'` : sync en cours.
   - `'offline'` : pas de réseau (état NetInfo).
   - `'error'` : sync a échoué de manière non-réseau (rare).

3. **Context provider** : expose tout via `<SyncContext.Provider value={...}>`.

### `src/sync/useSyncStatus.ts` (nouveau)

Hook : `() => { status, lastSyncedAt, error }`. Throw si hors provider, comme les autres contexts du repo.

### `src/sync/requireOnline.ts` (nouveau)

Helper de garde mutation :

```ts
export const requireOnline = (
  syncStatus: SyncStatus,
  showSnackbar: (msg: string) => void,
  t: TFunction
): boolean => {
  if (syncStatus === 'offline') {
    showSnackbar(t('drive.offline.requiresOnline'))
    return false
  }
  return true
}
```

À appeler en début de chaque action mutation : si `false`, on `return` immédiatement.

### `src/ui/SyncBadge.tsx` (nouveau)

Petit composant rendu par l'AppBar à droite :
- `idle` → rien (pas de pastille).
- `syncing` → spinner discret (`ActivityIndicator size="small"`).
- `offline` → icône `cloud-off-outline` (Material). Tap → popover Paper avec « Last synced: Xm ago » (relative date via `date-fns/formatDistanceToNow`).
- `error` → icône `alert-circle-outline`. Tap → popover « Synchronisation impossible — Réessayer » avec bouton qui appelle `pouchLink.scheduleImmediateTask()`.

### `src/ui/AppBar.tsx` (modif léger)

Insère `<SyncBadge />` à droite, avant le menu logout (s'il existe). Pas de prop nouvelle nécessaire — le badge consomme `useSyncStatus()` directement.

### Helpers de mutation existants (modif minimale)

Chaque helper de mutation (`softDeleteEntry`, `createFolder`, `createCozyNote`, `createOfficeFile`, sharing toggles) :
- En tête : ne **pas** ajouter le `requireOnline` ici — la garde se fait au call site (l'écran a accès au snackbar et au syncStatus). Le helper reste pur.
- Après `await client.destroy(...)` ou équivalent : ajouter `pouchLink.scheduleImmediateTask()` pour synchroniser le Pouch local immédiatement.

## 6. Data flow

### Cold start authentifié, online

```
App boot
  → AuthProvider rétablit la session
  → router push (drive)/files
  → SyncProvider monte
      → pouchLink.startManager()
      → PouchManager ouvre les SQLite per-doctype
      → Lit lastSeq depuis platform-storage.sqlite
      → Lance Loop 30s + replicateOnce immédiat
  → status: 'syncing' → 'idle'
```

### Read query (cache populé)

```
useQuery(Q('io.cozy.files').where(...))
  ↓
CozyClient → CozyPouchLink
  → doctype 'io.cozy.files' replicated AND syncStatus === 'synced' AND no mutationType
  → SQLiteQueryEngine.find(selector, sort, indexFields)
     compile mango → SQL via op-sqlite
     retourne docs en sub-ms
  → court-circuit, ne forward pas au StackLink
```

### Read query offline (cache populé)

Identique. Pouch ne sait pas qu'on est offline. La seule différence : la Loop est arrêtée par SyncProvider, donc pas de tentative de fetch qui échouerait dans le fond.

### Pull-to-refresh

```
query.fetch()
  → CozyPouchLink.scheduleImmediateTask() implicite (mode forceRefresh)
  → replicateOnce immédiat
  → re-évalue le selector → renvoie le nouveau résultat
```

### Initial sync (premier login, jamais réplicé)

```
SyncProvider monte → pouchLink.startManager() → replicateOnce démarre

Pendant ce temps :
  useQuery(...)
    → CozyPouchLink.request : syncStatus === 'not_synced'
    → forward au StackLink (fallback online)
    → résultat affiché immédiatement, comme avant l'intégration

À la fin de la première replicateOnce :
  → Pouch contient tous les docs des doctypes répliqués
  → cozy-client invalide les query results en cache
  → re-render avec la version locale (identique en contenu)
  → status 'syncing' → 'idle'
```

### Online → offline

```
NetInfo event 'online → false'
  → SyncProvider : setStatus('offline'), pouchLink.stopManager()
  → AppBar pastille ⚠️
Les queries en cours continuent (servies en local).
```

### Offline → online

```
NetInfo event 'online → true'
  → SyncProvider : setStatus('syncing'), pouchLink.startManager()
                  + scheduleImmediateTask() pour catchup
  → setStatus('idle') quand fini
```

### Background → foreground

```
AppState 'background → active'
  → SyncProvider : pouchLink.scheduleImmediateTask()
  → catchup depuis le lastSeq (rapide)
  → status 'syncing' → 'idle'
```

### Mutation online

```
softDeleteEntry → client.destroy(doc)
  ↓
CozyPouchLink.supportsOperation :
  strategy 'fromRemote' AND mutationType présent → return false
  ↓ forward au StackLink
StackLink envoie DELETE /files/{id} → cozy-stack
  ↓ réponse OK
cozy-client store en mémoire applique la mutation
  → tous les useQuery abonnés re-render avec la nouvelle version
  → l'item disparaît de la liste IMMÉDIATEMENT
  ↓
softDeleteEntry appelle pouchLink.scheduleImmediateTask()
  → Pouch local rattrape en < 1s (jamais de staled visible)
```

### Mutation tentée offline

```
status === 'offline'
  → requireOnline(syncStatus, showSnackbar, t) returns false
  → Snackbar "Disponible quand vous serez en ligne"
  → return immédiat, pas d'appel cozy-stack
```

## 7. Error handling

Principe : aucune erreur de sync ne bloque l'utilisateur. Tout passe par la pastille de statut + log console.

| Cas | Comportement |
|---|---|
| Ouverture SQLite échoue (disque plein, permissions) | Pastille `error`, popover « Stockage offline indisponible — l'app fonctionne en ligne ». Queries forward au StackLink. Retry au prochain foreground. |
| Initial sync fail (réseau down au premier login) | Pastille `offline`. Queries fallback StackLink (qui échouera aussi → ErrorState habituel). Loop retry au changement de connectivité. |
| Replication interrompue mid-batch | `lastSeq` partiel persisté. Pastille `offline`. Au retour online, `replicateOnce` reprend depuis `lastSeq`. |
| Token expiré pendant la sync | StackLink renvoie 401 → revocation listener existant gère le refresh ou logout. |
| NetInfo dit online mais requête échoue | Mutation user → Snackbar erreur générique. Loop retentera dans 30s. |
| Stockage saturé en cours d'écriture Pouch | Catch dans Loop → pastille `error`. App continue online. Retry au prochain foreground. |
| Loop foire silencieusement (5xx, parse error) | Log + pastille `error` brièvement. Loop retentera dans 30s. |

**Cas exclus** :
- Conflit de mutation simultanée (scope C, pas v1).
- Quota cozy-stack atteint sur create (erreur métier, géré par le wrapper Snackbar existant).
- Suppression côté serveur d'un doc qu'on a en cache (la réplication delta marque `_deleted: true` au prochain tick, le Pouch supprime, aucun handling spécial).

**Pas de migration de schéma SQLite à gérer** — c'est une nouvelle app, base partie de zéro à chaque user.

## 8. Tests

### Unit (Jest)

- `src/client/sqliteStorage.test.ts` — open lazy, getItem/setItem/removeItem corrects, gracefully retourne `null` si SQLite throw. Mock `@op-engineering/op-sqlite`.
- `src/client/pouchPlatform.test.ts` — shape correct (`storage`, `events`, `pouchAdapter`, `queryEngine`, `isOnline`). Mock NetInfo.
- `src/sync/SyncProvider.test.tsx` :
  - Mount authentifié → `pouchLink.startManager()` appelé.
  - Mount sans auth → pas de start.
  - AppState `active → background` → `stopManager()`.
  - AppState `background → active` → `scheduleImmediateTask()`.
  - NetInfo `online → offline` → status `'offline'`, `stopManager()`.
  - NetInfo `offline → online` → status `'syncing'`, `startManager()` + `scheduleImmediateTask()`.
  - Sync events → status mis à jour, `lastSyncedAt` set.
- `src/sync/useSyncStatus.test.tsx` — lit le context, throw si hors provider.
- `src/sync/requireOnline.test.ts` — retourne `false` + appelle showSnackbar si offline ; `true` sinon.
- `src/client/createClient.test.ts` — lien chain résultante a `[CozyPouchLink, StackLink]` (ordre confirmé), `doctypesReplicationOptions` configuré avec `strategy: 'fromRemote'` pour les deux doctypes.

### Smoke manuel sur simulateur iOS

1. **Premier login (cache vide)** : Mes fichiers s'affiche immédiatement (StackLink fallback), pastille `syncing` brièvement, puis `idle`. Redémarrer l'app → Mes fichiers s'affiche **instantanément** (servi par SQLite).
2. **Mode avion online → offline** : tout marche, pas d'erreur, pastille ⚠️ avec popover « Last synced: Xm ago ». Tap delete → Snackbar « Disponible en ligne ».
3. **Retour offline → online** : pastille `syncing` brièvement, puis `idle`.
4. **Mutation online et cohérence** : delete → disparaît immédiatement. Mode avion + restart app → toujours pas là (post-mutation `scheduleImmediateTask` a fait son job).
5. **Background long → foreground** : background 1 min, foreground → pastille `syncing` brièvement, puis `idle`.

### Pas testé

- Logique interne de `cozy-pouch-link` / `op-sqlite` / `pouchdb` (tests des libs).
- Performance des queries SQL générées par `SQLiteQueryEngine`.
- Fiabilité de la réplication cozy-stack ↔ Pouch (infra cozy).
- E2E (Detox / Maestro) — hors scope global de l'app.

## 9. Dépendances à ajouter

| Package | Version (cible) | Native ? |
|---|---|---|
| `cozy-pouch-link` | `^60.24.0` (aligné avec cozy-client) | Non (mais dépend des suivants) |
| `@op-engineering/op-sqlite` | latest stable | Oui (Pods + Gradle) |
| `@cozy/minilog` | `^1.0.0` (peer de cozy-pouch-link) | Non |
| `@react-native-community/netinfo` | latest pour Expo SDK 54 | Oui (config plugin Expo) |
| `pouchdb-core` (transitif) | géré par cozy-pouch-link | Non |

Process : `npx expo install` pour les configs Expo, `npm install --legacy-peer-deps` pour le reste, puis `cd ios && pod install`, puis `npx expo run:ios`.

## 10. Définition de "done" pour la v1 offline

- [ ] `cozy-pouch-link` + dépendances installées et le build iOS passe.
- [ ] `sqliteStorage`, `pouchPlatform`, `SyncProvider`, `useSyncStatus`, `requireOnline`, `SyncBadge` créés et testés en unit.
- [ ] `createClient` configure le link avec `strategy: 'fromRemote'` pour les deux doctypes.
- [ ] L'AppBar montre la pastille de statut (et seulement quand `syncing` ou `offline`).
- [ ] `softDeleteEntry`, `createFolder`, `createCozyNote`, `createOfficeFile`, et les mutations de `src/files/sharing.ts` (link toggle, recipient add/remove) appellent `pouchLink.scheduleImmediateTask()` après succès.
- [ ] Toutes les mutations utilisateur (boutons delete, FAB create, ShareSheet) check `requireOnline` avant d'appeler le helper.
- [ ] i18n FR + EN : `drive.offline.requiresOnline`, `drive.offline.lastSynced`, `drive.offline.syncing`, `drive.offline.storageUnavailable`.
- [ ] Les 5 scenarios du smoke manuel passent.
- [ ] Tous les tests Jest verts.

## 11. Hors-périmètre — à reprendre

- **Scope D : « Make available offline »** — épinglage explicite de dossiers, download des binaires en background, gestion du quota local. Spec dédiée à venir.
- **Scope C : mutations offline avec queue + conflict resolution.**
- **Realtime websocket** : on reste sur polling 30s.
- **Ajout des doctypes `io.cozy.contacts` / `io.cozy.apps`** si on veut un comportement vraiment iso online/offline.
