# Alignement UI web — Lot B : Structure & navigation

**Date :** 2026-07-02
**Statut :** Design à valider
**Branche / worktree :** `feat/web-structure` (base `feat/web-charte-icons` = Lot A)
**PR :** dédiée, empilée sur la PR Lot A (base = Lot A tant qu'elle n'est pas fusionnée)

## 1. Contexte

Lot B du chantier d'alignement mobile → web Twake Drive. Le Lot A a posé la charte + le module d'icônes `<CozyIcon>`. Le Lot B refond la **structure de navigation** pour matcher le web. Les **fonctionnalités** (Favoris, Signer, Télécharger, Personnaliser, Excalidraw, Raccourci, Importer) restent au **Lot C**.

Référence web (analyse Lot A) : bottom-nav `Mon Drive · Favoris · Récents · Partages · Corbeille` ; header = logo + recherche + aide + (grille d'apps, exclue) + avatar ; toolbar = tri « A‑Z » + bascule liste/grille.

## 2. Périmètre

**Inclus :**
1. **Refonte des onglets** → 5 onglets web : `Mon Drive · Favoris · Récents · Partages · Corbeille` (icônes cozy-ui `Cloud2 · Star · ClockOutline · ShareExternal · Trash`).
2. **Header** : ajout **recherche** (`Magnifier`), **aide** (`?`), **avatar** (menu : Paramètres, Se déconnecter). Logo déjà là (Lot A). Grille d'apps **exclue**.
3. **Toolbar** de liste : **tri « A‑Z / Z‑A »** (bottom-sheet radio, façon `MobileSortMenu`) + **bascule liste/grille** (`ListMin`/`MosaicMin`).
4. **Re-skin des icônes Paper** : migrer les props `icon="material-name"` des `FileRow`/`FolderRow`/`AppBar`/menus vers `<CozyIcon>` (dots→`dots`, chevron→pas d'équiv. direct : garder ou `previous` inversé, etc.).

**Exclus (Lot C) :** fonctionnalité Favoris (query `cozyMetadata.favorite`, toggle étoile — l'onglet Favoris affiche un **état vide** en Lot B), Télécharger, Signer, Personnaliser, Excalidraw, Raccourci, Importer. Grille d'apps : exclue définitivement.

## 3. Décisions de périmètre — VALIDÉES 2026-07-02 : « alignement web strict »

**Choix retenu :** 5 onglets web exactement (Mon Drive · Favoris · Récents · Partages · Corbeille) ; **Drives + Paramètres déplacés dans le menu avatar** ; onglet **Favoris présent mais VIDE** jusqu'au Lot C (query + toggle) ; **recherche** fonctionnelle basique (par nom) ; **bascule liste/grille incluse**. Détail des options ci-dessous (pour trace).


- **Onglet Favoris** : ajouté en Lot B (structure) mais **vide** (« Aucun favori ») jusqu'au Lot C qui branche la query + le toggle. *(Alternative : tout Favoris en Lot C.)*
- **Onglet « Drives » (drives partagés)** : le web ne l'a **pas** en bottom-nav. Proposé : **sorti de la barre**, accessible via le **menu avatar** (ou un accès dans « Partages »). La feature drives partagés reste fonctionnelle, juste déplacée. *(Alternative : le garder comme 6ᵉ onglet.)*
- **Onglet « Paramètres »** : le web le met dans le **menu avatar** (haut-droite), pas en bottom-nav. Proposé : **déplacé dans le menu avatar** (avec « Se déconnecter »).
- **Recherche** : Lot B pose l'**UI** (champ/écran de recherche) ; l'implémentation de la query de recherche peut être minimale (barre + résultats via `Q('io.cozy.files').where(name ~)`), ou stubée. Proposé : recherche fonctionnelle basique (par nom).
- **Bascule liste/grille** : nécessite un rendu **grille** des fichiers (FlatList `numColumns`), en plus de la liste. Proposé : inclus (c'est le cœur du « ressemble au web »).

## 4. Design (esquisse)

- **`app/(drive)/_layout.tsx`** : passer de 6 à 5 `Tabs.Screen` (renommer `files`→titre « Mon Drive », `shared`→« Partages » ; ajouter `favorites` ; retirer `shareddrives` et `settings` de la barre) ; icônes via `<CozyIcon>`. i18n : nouvelles clés `drive.myDrive`, `drive.favorites`, `drive.shares`.
- **`app/(drive)/favorites/…`** : nouvel onglet + écran (état vide en Lot B).
- **`src/ui/AppBar.tsx`** : ajouter à droite `SearchButton` (`Magnifier`) + `HelpButton` (`?`) + `Avatar` (menu Paramètres/Logout). Conserver le logo à gauche.
- **`app/(drive)/settings/…`** + drives : accès déplacé dans le menu avatar / overflow (routes conservées).
- **Toolbar liste** (`app/(drive)/files/[...path].tsx` et écrans de liste) : composant `SortControl` (bottom-sheet A‑Z/Z‑A) + `ViewSwitcher` (liste/grille) ; état de tri/vue via un contexte léger (`useFolderSort`, `useViewSwitcher`).
- **Rendu grille** : `FileGridItem` (vignette + nom) + `FlatList numColumns` piloté par le ViewSwitcher.
- **Re-skin icônes** : `FileRow`/`FolderRow`/`AppBar`/dialogs → `<CozyIcon>` (ajouter au registre les quelques glyphes manquants : `chevronRight`, `dotsVertical` si besoin, via le procédé d'extraction Lot A). ⚠️ **Bloqueur Lot A à lever ici** : ajouter `stroke`/`strokeWidth` à `CozyIconDef` **avant** de rendre les icônes fileType (fills quasi-blancs invisibles sinon).

## 5. Fichiers (principaux)

`app/(drive)/_layout.tsx`, `app/(drive)/favorites/*` (nouveau), `src/ui/AppBar.tsx` (+ `Avatar`/`SearchButton`/`HelpButton`), `src/ui/SortControl.tsx` (nouveau), `src/ui/ViewSwitcher.tsx` (nouveau), `src/ui/FileGridItem.tsx` (nouveau), `src/ui/FileRow.tsx`/`FolderRow.tsx` (icônes), `src/ui/icons/registry.ts` (+ stroke + glyphes manquants), `src/ui/icons/CozyIcon.tsx` (support stroke), écrans de liste (toolbar + grille), i18n `fr.json`/`en.json`.

## 6. Tests & risques

- Tests : `_layout` rend 5 onglets ; `SortControl`/`ViewSwitcher` togglent l'état ; `FileGridItem` rend ; AppBar rend search/avatar ; CozyIcon rend un stroke.
- Risques : rendu grille (perf FlatList numColumns + vignettes) ; recherche (portée) ; menu avatar (regrouper Paramètres/Drives/Logout proprement) ; extension `CozyIconDef` (stroke) sans casser Lot A ; validation device.

## 7. Définition de « done » (Lot B)

- [ ] 5 onglets web (icônes cozy-ui) ; Drives + Paramètres déplacés au menu avatar ; onglet Favoris (vide).
- [ ] Header : recherche + aide + avatar (menu Paramètres/Logout), logo conservé.
- [ ] Tri A‑Z/Z‑A + bascule liste/grille fonctionnels sur les listes.
- [ ] Icônes Paper des rows/appbar migrées vers `<CozyIcon>` ; `CozyIconDef` gère le `stroke`.
- [ ] Tests verts (nouveaux) + validation visuelle sur le Pixel.
