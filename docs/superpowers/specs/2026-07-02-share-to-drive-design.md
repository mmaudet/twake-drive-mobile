# Share to Twake Drive — Design

**Date:** 2026-07-02
**Statut:** Design (implémentation **bloquée** — voir §2 Dépendance)
**Backlog:** `docs/TODO.md` → « Receive shared content from the OS (Share Extension) »

---

## 1. Contexte & objectif

Permettre de partager **n'importe quel contenu / média du téléphone** vers Twake Drive
depuis la feuille de partage native (iOS *Share Sheet*, Android *ACTION_SEND*), en
**laissant l'utilisateur parcourir ses dossiers** pour choisir la destination avant l'upload.

Parcours cible :

> Photos / Fichiers / n'importe quelle app → **Partager** → **Twake Drive** →
> l'app s'ouvre sur un sélecteur de dossiers → l'utilisateur navigue / crée un dossier →
> **Importer ici** → upload avec progression → le fichier apparaît dans le Drive.

Bonne nouvelle : le **cœur produit existe déjà** et a été conçu pour ce cas.
Le `FolderPicker` (`src/ui/FolderPicker/`) a été explicitement extrait de toute logique
métier « pour être réutilisé par la Share Extension » (cf. spec `move-files`), et un chemin
d'upload binaire vers cozy-stack existe (`createFile` dans `createOfficeFile.ts`).
Ce qui manque est **la couche de capture native** + **un pipeline d'upload robuste** +
**le câblage in-app**.

---

## 2. Dépendance & séquencement (⚠️ bloquant)

Cette feature est **couplée sur les deux plateformes** au chantier **FileProvider** mené en
parallèle (une autre session). Le couplage n'est **pas** fonctionnel — il est sur la
**fondation native partagée** que FileProvider installe en premier :

| Fondation posée par FileProvider | Réutilisée par Share |
|---|---|
| Scaffold de **config-plugin** (obligatoire : `ios/` & `android/` sont prebuild-managed) | Le plugin Share s'y branche |
| **App Group** iOS (`group.com.linagora.twakedrive`) + entitlements | Conteneur de staging des fichiers partagés |
| Ajout de **cible(s) dans `project.pbxproj`** | La Share Extension ajoute sa propre cible via le même pattern |
| Région `<provider>` / manifest Android | La Share ajoute son `<intent-filter>` sur `MainActivity` |

**Règle appliquée :** *design maintenant, implémentation après l'atterrissage de FileProvider.*

1. **Maintenant** — cette spec + le plan d'implémentation (docs, zéro conflit).
2. **Quand FileProvider a mergé** — créer le **worktree dédié** à partir de l'état
   contenant la fondation, puis implémenter iOS + Android en **une PR dédiée** par-dessus.

Point d'accord à figer avec la session FileProvider : **le même App Group id**
(`group.com.linagora.twakedrive`).

> Note : avec l'architecture « mince » retenue (§4), la Share Extension **n'a pas besoin du
> token** (l'upload se fait dans l'app). Le seul artefact partagé strictement nécessaire côté
> iOS est le **conteneur App Group** pour passer les octets. Le keychain partagé
> (`keychain-access-groups`), lui, reste un besoin propre à FileProvider.

---

## 3. Périmètre

### v1 (cette spec)
- Réception d'un **ou plusieurs** items (`ACTION_SEND` **et** `ACTION_SEND_MULTIPLE`,
  multi-attachements iOS) → **une seule destination** pour le lot.
- Tout **fichier / média** : image, vidéo, PDF, doc, binaire quelconque (par UTI/MIME).
- **Texte simple / URL** partagé → enregistré comme fichier `.txt` (pour honorer
  « n'importe quel contenu »).
- Sélection de destination via le **`FolderPicker` existant** (navigation + création de dossier).
- Upload **streaming** (sans charger le fichier en mémoire JS) avec **progression**.
- Reprise après login si l'utilisateur n'est pas authentifié au moment du partage.
- Cible : **drive personnel** (`io.cozy.files`).

### Non-objectifs (YAGNI — repoussés)
- **Extension « épaisse »** (upload complet *dans* la feuille de partage sans ouvrir l'app).
- **Upload en arrière-plan** (`BGTaskScheduler` / `WorkManager`) — cohérent avec le
  « v1 foreground-only » déjà acté pour les downloads (`docs/TODO.md`).
- **Reprise / Range** sur interruption réseau.
- **File d'attente offline** (outbox) — v1 exige le réseau, erreur claire sinon.
- **Import dans un shared drive** (les shared drives sont notés « poorly implemented »).
- **Conversion riche** texte/URL → note Cozy (v1 = `.txt`).

---

## 4. Architecture — extension « mince », les deux plateformes

L'extension **capture puis délègue** ; toute l'UX (navigation dossiers + upload) tourne
dans l'app principale, qui a déjà cozy-client, le token, le `FolderPicker` et le réseau.

```
┌─ App source (Photos, Fichiers, navigateur…) ─┐
│   Partager → Twake Drive                       │
└───────────────┬────────────────────────────────┘
                │
        ┌───────▼─────────────────────────────────────────────┐
        │ CAPTURE (natif, mince — via expo-share-intent)       │
        │  iOS  : Share Extension → copie les items dans le     │
        │         conteneur App Group → ouvre l'app (deep-link) │
        │  Android: intent-filter ACTION_SEND(_MULTIPLE) sur     │
        │           MainActivity (singleTask) → content:// URIs  │
        └───────┬───────────────────────────────────────────────┘
                │  useIncomingShare()  →  PendingShare[]
        ┌───────▼───────────────────────────────────────────────┐
        │ APP (JS/TS)                                             │
        │  1. authentifié ?  ──non──► login ──► reprise           │
        │  2. router.push('/import')                              │
        │  3. /import : FolderPicker (navigue / crée un dossier)  │
        │  4. onConfirm(dest) → upload streaming du lot + progrès  │
        │  5. succès → triggerPouchReplication → dismiss + cleanup │
        └────────────────────────────────────────────────────────┘
```

Compromis assumé : le partage **ouvre l'app** (plein écran) au lieu de rester dans la
feuille système — c'est le pattern standard des apps Drive, et il évite de faire tourner
cozy-client/PouchDB dans un process d'extension contraint (~120 Mo).

---

## 5. Composants & modules

### À construire

| Module | Rôle |
|---|---|
| **Config plugin Share** (`plugins/`) | Déclare la Share Extension iOS (cible + Info.plist `NSExtension` + App Group) et l'`<intent-filter>` Android. Se branche sur le scaffold FileProvider. *(impl. post-FileProvider)* |
| `src/share/useIncomingShare.ts` | **Interface d'isolation** de la capture. Émet `PendingShare[]` (cold + warm start). Encapsule `expo-share-intent` → swappable vers du natif fait-main sans toucher le reste. |
| `src/share/PendingShareProvider.tsx` | Contexte : stocke le lot partagé en attente, gère la **reprise après login**, déclenche la navigation `/import`. |
| `app/import/_layout.tsx` | Miroir de `app/move/[ids]/_layout.tsx` : provider + `Stack` imbriqué + `Snackbar`. `onConfirm(dest)` = **upload du lot** (au lieu de move). |
| `app/import/index.tsx` | Racine du sélecteur : `FolderPicker` à `ROOT_DIR_ID`. |
| `app/import/[...path].tsx` | Sous-dossiers (parse les segments → `currentFolderId`). |
| `src/files/uploadSharedFile.ts` | Upload **streaming** d'un fichier local vers un `dirId` (voir §7). |
| `src/share/uploadBatch.ts` | Orchestration multi-fichiers : progression agrégée, échecs partiels. |

### Réutilisé tel quel (aucune modif)

- **`FolderPicker`** (`src/ui/FolderPicker/FolderPicker.tsx`) — interface :
  `currentFolderId, excludeIds, confirmLabel, isBusy, isAtRoot, onDrillIn, onBack, onConfirm, onCancel`.
  Navigation + **création de dossier** (`folder-plus`) + `Portal.Host` (compatible pageSheet)
  déjà intégrés. Pour l'import : `excludeIds = ∅`, `confirmLabel = t('drive.import.confirm')`.
- **Queries dossiers** `folderSubfoldersQuery` / `folderFilesQuery` (offline-aware via PouchLink).
- **Pattern modal racine** (`app/_layout.tsx`) : enregistrer `import` en `presentation: 'pageSheet'`.
- **Accès stack** `client.getStackClient().uri` / `.getAccessToken()`.
- **`triggerPouchReplication(client, 'io.cozy.files')`** après upload (le fichier apparaît dans la liste).

---

## 6. Data flow détaillé

1. Partage déclenché dans une app tierce → cible **Twake Drive**.
2. **Capture** copie/résout chaque item en **fichier local lisible** (`file://` en cache app
   ou conteneur App Group) avec `{ uri, name, mimeType, size }`.
3. iOS : ouverture de l'app via deep-link `twakedrive://…` ; Android : `MainActivity`
   (`singleTask`) reçoit l'intent. Dans les deux cas `useIncomingShare()` émet `PendingShare[]`.
4. `PendingShareProvider` : si **non authentifié** → stash + `/login` → reprise après succès ;
   sinon → `router.push('/import')`.
5. `/import` : l'utilisateur navigue (drill-in route-driven, comme `move`), crée un dossier
   si besoin, puis **Importer ici** → `onConfirm({ _id: destDirId })`.
6. `uploadBatch` : pour chaque item, `uploadSharedFile` (streaming) → progression par fichier.
7. Succès → `triggerPouchReplication` → `Snackbar` → `router.dismiss()` → **cleanup** des
   copies stagées (conteneur App Group / cache).

---

## 7. Détails techniques clés

### Route d'upload cozy-stack
`POST {stackUri}/files/{dirId}?Type=file&Name={encodeURIComponent(name)}`
Headers : `Authorization: Bearer {token}`, `Content-Type: {mime}` (`Content-Length` déduit du fichier).
Réponses : `201` (doc `io.cozy.files`), `409` (conflit de nom), `413`/`507` (quota/stockage).

### Streaming (fichiers volumineux — vidéos)
`createFile(ArrayBuffer)` charge tout en mémoire JS → **inadapté** aux gros médias.
→ Upload via **`react-native-blob-util`** (déjà dépendance) :
`ReactNativeBlobUtil.fetch('POST', url, headers, ReactNativeBlobUtil.wrap(localPath))`
streame depuis le disque + expose `uploadProgress`. `createFile` reste utilisé là où un
`ArrayBuffer` est déjà en main (Office).

### Conflits de nom (`409`)
Auto-dédup : `photo.jpg` → `photo (1).jpg`, `photo (2).jpg`… (re-tenter avec suffixe incrémental).

### Progression
`uploadProgress` par fichier → progression agrégée du lot (ex. « 2/5 · 34 % »).

---

## 8. Cas limites & erreurs

| Cas | Comportement v1 |
|---|---|
| Non authentifié au moment du partage | Stash du lot → `/login` → **reprise** automatique après succès |
| Multi-fichiers | Une destination, upload séquentiel, **échecs partiels** listés (retry possible) |
| Fichier volumineux | Streaming (§7), pas d'OOM |
| Conflit de nom (`409`) | Auto-dédup suffixe numérique |
| Hors-ligne | Erreur claire « connexion requise » (pas d'outbox en v1) |
| Quota dépassé (`413`/`507`) | Message explicite, upload du lot interrompu proprement |
| Texte / URL partagé | Sauvé en `.txt` |
| Contenu vide / non lisible | Ignoré avec message |
| Cold start **et** warm start (app déjà ouverte) | Les deux routent vers `/import` |
| Annulation du picker | Discard + **cleanup** des copies stagées |

---

## 9. Sécurité

- L'extension écrit **uniquement** dans le conteneur App Group ; l'app lit **depuis ce
  conteneur** (pas de chemin arbitraire). Le deep-link référence des **ids de staging**,
  pas des chemins bruts.
- **Cleanup systématique** des copies stagées après upload / annulation (évite la fuite de
  données dans le conteneur partagé).
- Scope OAuth `io.cozy.files` (POST) **déjà accordé** (`src/auth/scopes.ts`) — pas d'élévation.
- Aucun secret dans le deep-link.

---

## 10. i18n

Nouvelles clés `drive.import.*` (fichiers `src/i18n/`) :
`title`, `confirm` (« Importer ici »), `uploading` (« Import en cours… {progress} »),
`successFile` / `successBulk`, `errorGeneric`, `errorOffline`, `errorQuota`,
`loginRequired`. Miroir des clés `drive.move.*`.

---

## 11. Tests

- **Unit `uploadSharedFile`** : succès, `409`→dédup, progression, erreurs réseau/quota
  (mock `react-native-blob-util` + stack client).
- **Unit `PendingShareProvider`** : reprise après login, cold vs warm, multi-items.
- **Unit `uploadBatch`** : agrégation progression, échec partiel.
- **Composant `/import`** : rend `FolderPicker`, `Importer ici` déclenche l'upload du lot.
- **Manuel (matrice)** : iOS (Photos, Fichiers, Safari) + Android (Galerie, Fichiers,
  navigateur) ; 1 fichier / N fichiers / gros média / texte / non authentifié / hors-ligne.

---

## 12. Décisions (tranchées le 2026-07-02 — « GO »)

Défauts recommandés retenus (vetoables à la relecture) :

1. **Capture** : `expo-share-intent`, **isolé derrière `useIncomingShare()`** → la décision
   native (lib vs fait-main) reste finalisable à l'implémentation, face au scaffold FileProvider.
2. **Texte / URL** partagé → sauvé en fichier **`.txt`** (honore « n'importe quel contenu »).
3. **Dossier de départ du picker** : **racine** en v1 (YAGNI). « Mémoriser la dernière
   destination » = amélioration triviale post-v1 (MMKV déjà dispo).

---

## 13. Découpage d'implémentation (post-FileProvider)

1. **Pipeline d'upload** (`uploadSharedFile` + `uploadBatch`) + tests — *indépendant du natif,
   testable seul via un deep-link de dev.*
2. **Modal `/import`** (miroir `move`) branchée sur le pipeline + `PendingShareProvider`.
3. **Capture Android** (`ACTION_SEND(_MULTIPLE)` + `useIncomingShare`).
4. **Capture iOS** (Share Extension + App Group, via le config-plugin sur la fondation FileProvider).
5. **Polish** : progression, dédup, reprise-login, cleanup, i18n.
6. **PR dédiée** + matrice de tests manuels sur device.
