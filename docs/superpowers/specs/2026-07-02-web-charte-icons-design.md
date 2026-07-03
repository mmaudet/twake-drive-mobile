# Alignement UI web — Lot 1 : Charte graphique & icônes (Fondations)

**Date :** 2026-07-02
**Statut :** Design validé (à implémenter)
**Branche / worktree :** `feat/web-charte-icons` (base `main`)
**PR :** dédiée, indépendante de `feat/android-support`

## 1. Contexte & objectif

Aligner progressivement l'UI de l'app mobile React Native (`twake-drive-mobile`) sur la version **web de Twake Drive** (`linagora/twake-drive`), de sorte que le mobile « ressemble au web » : même charte graphique, mêmes icônes, mêmes fonctionnalités (**hors grille d'apps**).

C'est un chantier **multi-PR** décomposé en 3 lots :

- **Lot A — Charte & icônes (ce document).**
- Lot B — Structure/navigation (onglets *Mon Drive · Favoris · Récents · Partages · Corbeille*, header recherche/aide/avatar, tri « A-Z », bascule liste/grille).
- Lot C — Fonctionnalités (Favoris, Télécharger, Signer, Personnaliser le dossier, Excalidraw, Raccourci, Importer).

Ce document ne couvre **que le Lot A**, choisi en approche **« fondations d'abord »** : poser les tokens de thème + le module d'icônes + le branding, qui seront réutilisés par les lots B et C.

## 2. Analyse de référence (web)

Résultats de l'analyse du source `linagora/twake-drive` (cozy-drive v1.105, React 18 + cozy-ui) :

- **L'apparence du web vient presque entièrement de `cozy-ui`** (design-system externe, `cozy-ui@^139.2.0` + `cozy-ui-plus@^7.1.0`), pas du repo applicatif. Les **couleurs sont injectées au runtime par le serveur** via `{{.ThemeCSS}}` sous forme de variables CSS (`--primaryColor`, `--secondaryColor`, `--errorColor`, `--white`, `--shadow*`…). L'accent fonctionnel par défaut de cozy-ui est un **bleu**.
- **Marque Twake** (propre au repo) : logo cloud dégradé **`#FF4759` → `#FFD600`** (`src/components/Icons/Drive.jsx`, rect arrondi `rx=10.57` + moulinet blanc), wordmark « Drive » dégradé rouge `#FF6372 → #FF3347` (`DriveText.jsx`), nom **« Twake Workplace »** (`manifest.webapp` : `name_prefix: "Twake"`, `developer.name: "Twake Workplace"`). Statique : `public/app-icon.svg`.
- **Typographie** : la charte Twake utilise **Inter** — l'instance injecte `--primaryFont: "Inter", -apple-system, …` (vérifié sur `mmaudet.twake.linagora.com/assets/styles/theme.css`). (cozy-ui historique = Lato, mais Twake surcharge en Inter.)
- **Palette réelle** (instance + défauts cozy-ui) : `--primaryColor: #3b82f7` (bleu Twake) ; cozy-ui `frenchPass #C2DCFF`, `pomegranate #F52D2D`, `puertoRico #0DCBCF`, `zircon #F5FAFF`, `dodgerBlue #297EF2` (défaut primary).
- **Icônes** : composant cozy-ui `<Icon icon={…}/>` + jeu `cozy-ui/transpiled/react/Icons/*`. 4 icônes de types de doc sont des **SVG locaux** au repo web (`src/assets/icons/` : `icon-docs.svg` `#000091/#C9191E`, `icon-excalidraw.svg` `#6965db`, `icon-grist.svg` `#16B378`, `icon-nextcloud.svg` `#0082C9`).

**Conséquence pour le port :** cozy-ui ne tourne pas en React Native → on **réplique ses tokens et ses icônes** dans l'app mobile (re-skin fidèle sur React Native Paper), on ne l'embarque pas. Le bleu applicatif mobile actuel (`#0072B2`) est déjà proche ; on l'aligne sur la valeur cozy-ui exacte.

## 3. État actuel (mobile)

- **Thème** `src/ui/theme.ts` : `lightTheme`/`darkTheme` MD3 (Paper), palette bleue générique (`primary #0072B2`, `background #F5F7FA`, `error #D32F2F`).
- **Icônes** : `src/ui/icons/` contient déjà `CozyFileTypes.tsx` + `FileTypeIcon.tsx` (SVG via `react-native-svg`) → **pattern à étendre**. Ailleurs, `react-native-vector-icons` (MaterialCommunityIcons) est utilisé dans **6 fichiers** : `src/ui/ErrorState.tsx`, `src/ui/EmptyState.tsx`, `src/ui/SharedBadge.tsx`, `src/offline/PinnedBadge.tsx`, `app/preview/[fileId].tsx`, `app/(drive)/_layout.tsx`.
- **Branding** : `app.json` splash = `assets/splash.png` (fond blanc) ; icône app `assets/icon.png` ; header = `src/ui/AppBar.tsx` (titre + menu `⋮`, pas de logo).
- **Police** : police système (aucun `expo-font`).

## 4. Design détaillé

### 4.1 Tokens de thème (`src/ui/theme.ts`)

Reconstruire le thème autour de la palette cozy-ui, en conservant la forme MD3 exigée par Paper mais en surchargeant les slots de marque.

- **Sources des couleurs** (palette injectée au runtime, PAS dans le stylesheet) : `primary` vient du thème de l'instance — `--primaryColor: #3b82f7` (vérifié sur `mmaudet.twake.linagora.com/assets/styles/theme.css`) ; les autres slots des couleurs nommées de `cozy-ui@139.2.0/react/palette.js` : `frenchPass #C2DCFF` (primaryContainer), `puertoRico #0DCBCF` (secondary), `pomegranate #F52D2D` (error), `zircon #F5FAFF` (background), blanc (surface). Défaut cozy-ui `dodgerBlue #297EF2` documenté en repli. Consigner ces valeurs avec commentaire de provenance.
- Mapper vers les slots Paper MD3 : `primary` (= `--primaryColor`, remplace `#0072B2`), `primaryContainer`, `secondary`, `error`, `background`/`surface` (= backgrounds cozy-ui), `onSurface`/`onSurfaceVariant` (= gris de texte).
- Exposer un objet complémentaire **`cozyTokens`** (ombres, gris, rayons) pour les besoins non couverts par la palette Paper.
- Conserver `lightTheme` **et** `darkTheme`. Aucune couleur en dur hors de `theme.ts` (règle projet).

### 4.2 Typographie — Inter (`@expo-google-fonts/inter`)

- Embarquer **Inter** (Regular 400 + Medium 500 + SemiBold 600 + Bold 700) via **`@expo-google-fonts/inter`** + `expo-font` (`useFonts`) au `app/_layout.tsx`, avec maintien du splash tant que les polices ne sont pas prêtes. Charte Twake = Inter (cf. §2).
- Brancher la **config `fonts` de Paper** (MD3 `configureFonts`) sur la famille Inter → tous les composants Paper (`Text`, `List.Item`, `Appbar`, `Button`…) héritent d'Inter.
- Fallback : si le chargement échoue, l'app reste utilisable en police système (ne pas bloquer le rendu indéfiniment).

### 4.3 Module d'icônes cozy-ui (`src/ui/icons/`)

- Étendre le module existant en un **jeu d'icônes SVG cozy-ui** exposé par un composant unique **`<CozyIcon name size color />`** (miroir du `<Icon icon={…}/>` web), adossé à un **registre** `name → composant SVG` (`react-native-svg`).
- **Icônes à vendoriser** (extraites de `cozy-ui@139` `transpiled/react/Icons/*`) — jeu nécessaire au Lot A et anticipant B/C, sans les onglets :
  `Cloud2, Star, StarOutline, ClockOutline, ShareExternal, Trash, Magnifier, Dots, Plus, Previous, Download, Pen, Rename, Moveto, Palette, Info, History, Restore, ListMin, MosaicMin, Upload, DeviceBrowser, FileTypeFolder, FileTypeNote, FileTypeText, FileTypeSheet, FileTypeSlide`.
- **4 SVG de marque** (types de doc), extraits du repo web `src/assets/icons/` : `icon-docs.svg`, `icon-excalidraw.svg`, `icon-grist.svg`, `icon-nextcloud.svg`.
- **Logo** : `<TwakeLogo />` (voir 4.4) vit dans ce module.
- **Procédé d'extraction** : convertir les SVG cozy-ui / de marque en composants `react-native-svg` (chemins conservés à l'identique, couleurs paramétrables via prop `color`/gradients pour la marque). Documenter le procédé pour régénérer si la version cozy-ui bouge.
- **Migration** des usages `react-native-vector-icons` **hors onglets** vers `<CozyIcon>` : `ErrorState.tsx`, `EmptyState.tsx`, `SharedBadge.tsx`, `PinnedBadge.tsx`, `app/preview/[fileId].tsx`.
- **Icônes d'onglets** (`app/(drive)/_layout.tsx`) : **différées au Lot B**, qui refond entièrement la barre d'onglets (éviter du travail jetable). Le fichier `_layout.tsx` n'est donc **pas** modifié dans ce lot.

### 4.4 Branding (splash + logo)

- **`<TwakeLogo />`** : composant `react-native-svg` répliquant `Drive.jsx` (rect arrondi `rx≈10.57` rempli du dégradé linéaire `#FF4759 → #FFD600` + moulinet/disque blanc). Optionnellement `<TwakeWordmark />` pour le lettrage.
- **Splash** : régénérer `assets/splash.png` → fond blanc, cloud dégradé centré, « **Twake Workplace** » en bas (réf. capture 1). Générer l'asset à partir du SVG logo + wordmark. `app.json` splash : `backgroundColor` blanc conservé.
- **Header** : `src/ui/AppBar.tsx` affiche le `<TwakeLogo />` (petit format) à gauche du titre d'écran. **Logo seul** — recherche/aide/avatar **hors périmètre** (Lot B).
- **Icône launcher** : régénérer `assets/icon.png` + `assets/adaptive-icon.png` (Android) au cloud dégradé.

## 5. Fichiers créés / modifiés

| Fichier | Action |
|---|---|
| `src/ui/theme.ts` | Réécriture palette (tokens cozy-ui light/dark + `cozyTokens`) |
| `assets/fonts/Lato-*.ttf` | Ajout (Regular/Bold[/Black]) |
| `app/_layout.tsx` | Chargement des polices (`useFonts`) + `configureFonts` Paper |
| `src/ui/icons/CozyIcon.tsx` (+ registre) | Ajout composant + registre |
| `src/ui/icons/svg/*` | Ajout des SVG cozy-ui + 4 SVG de marque (RN-SVG) |
| `src/ui/icons/TwakeLogo.tsx` | Ajout logo de marque |
| `src/ui/ErrorState.tsx`, `EmptyState.tsx`, `SharedBadge.tsx` | Migration vers `<CozyIcon>` |
| `src/offline/PinnedBadge.tsx`, `app/preview/[fileId].tsx` | Migration vers `<CozyIcon>` |
| `src/ui/AppBar.tsx` | Logo Twake à gauche du titre |
| `assets/splash.png`, `assets/icon.png`, `assets/adaptive-icon.png` | Régénération branding |
| `app.json` | Ajustements splash/icon si nécessaire |

**Non modifié dans ce lot** : `app/(drive)/_layout.tsx` (onglets → Lot B).

## 6. Conventions

- Règle d'or projet : **« mirror twake-drive-web »** — pour toute correspondance de token/icône/comportement, reproduire ce que fait le web (mêmes noms d'icônes, mêmes valeurs de couleur).
- Aucune couleur en dur hors `theme.ts` ; pas de style inline (StyleSheet ou props Paper) ; composants fonctionnels ; TypeScript strict ; imports externes → cozy-* → locaux (`@/…`).

## 7. Tests

- Conserver `src/ui/icons/FileTypeIcon.test.tsx`.
- Ajouter un test de rendu/snapshot pour `<CozyIcon>` (registre → SVG) et un test des tokens de thème (light/dark exposent les slots attendus).
- **Vérification visuelle sur le Pixel 10 Pro Fold** : splash, header avec logo, écrans d'état (Error/Empty), badges, preview — comparaison avec les captures web de référence. PR purement visuelle → la validation device fait foi.

## 8. Risques & décisions ouvertes

- **Extraction hex cozy-ui** : la palette est minifiée/injectée runtime ; épingler les valeurs exactes depuis `cozy-ui@139.2.0` (procédé §4.1). Si divergence de version, documenter.
- **Poids Lato** : chaque graisse alourdit le bundle ; se limiter aux graisses réellement utilisées (Regular/Bold, Black seulement si un titre l'exige).
- **Fidélité conversion SVG** : vérifier le rendu des dégradés de marque en `react-native-svg`.
- **Génération de l'image splash** : produire un asset propre (cloud + « Twake Workplace ») ; densités Android/iOS.
- **Base worktree** : branché sur `main` (PR indépendante). Tant que la PR Android (#1) n'est pas fusionnée, un test sur device réaffiche les erreurs pré-existantes (expo-video, cozy-client) — **non bloquantes et hors sujet ici**. Rebase possible sur `main` après fusion de #1.

## 9. Hors périmètre (lots suivants)

- **Lot B** : onglets *Mon Drive · Favoris · Récents · Partages · Corbeille* (+ retrait Drives/Paramètres de la barre), header recherche/aide/avatar, tri « A-Z », bascule liste/grille, icônes d'onglets.
- **Lot C** : Favoris (flag `cozyMetadata.favorite`, miroir `buildFavoritesQuery`), Télécharger, Signer, Personnaliser le dossier, Excalidraw, Raccourci, Importer des fichiers.
- Grille d'apps : **exclue** (demande explicite).

## 10. Définition de « done » (Lot A)

- [ ] `theme.ts` reconstruit sur la palette cozy-ui (light + dark), hex épinglés + provenance.
- [ ] Lato chargée et appliquée globalement via Paper.
- [ ] `<CozyIcon>` + registre + SVG cozy-ui/marque en place ; 5 fichiers migrés depuis `vector-icons` (hors onglets).
- [ ] `<TwakeLogo>` créé ; splash « Twake Workplace », header avec logo, icône launcher régénérés.
- [ ] Tests verts (FileTypeIcon conservé + CozyIcon + tokens).
- [ ] Validation visuelle sur le Pixel conforme aux références web.
- [ ] Aucune régression fonctionnelle sur les écrans touchés.
