# Charte & icônes (Lot A) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner la charte graphique et les icônes de l'app mobile sur le web Twake Drive (tokens cozy-ui, police Inter, module d'icônes SVG cozy-ui, branding Twake), sans toucher à la structure ni aux fonctionnalités.

**Architecture:** On pose des fondations réutilisables : un fichier de palette (`cozyPalette.ts`) alimente le thème Paper (`theme.ts`) ; la police Inter est branchée sur Paper via `configureFonts` ; un composant `<CozyIcon>` adossé à un registre rend les icônes cozy-ui (SVG via `react-native-svg`) ; un `<TwakeLogo>` et les assets de branding remplacent l'identité générique. Les écrans consomment ensuite ces primitives.

**Tech Stack:** React Native 0.81 / Expo 54, React Native Paper (MD3), `react-native-svg` (15.12, déjà présent), `@expo-google-fonts/inter` + `expo-font`, Jest + `@testing-library/react-native`.

## Global Constraints

- Worktree `/Users/mmaudet/work/twake-drive-mobile-charte`, branche `feat/web-charte-icons` (base `main`).
- Aucune couleur en dur hors `src/ui/theme.ts` / `src/ui/cozyPalette.ts`. Pas de style inline (StyleSheet ou props Paper). Composants fonctionnels. TypeScript strict.
- Règle « mirror twake-drive-web » : noms d'icônes = noms cozy-ui ; valeurs de couleur = valeurs cozy-ui / instance.
- Palette de référence (vérifiée) : `primary #3b82f7` (instance Twake), `primaryContainer #C2DCFF` (frenchPass), `secondary #0DCBCF` (puertoRico), `error #F52D2D` (pomegranate), `background #F5FAFF` (zircon), `surface #FFFFFF`, défaut cozy `dodgerBlue #297EF2`.
- Police charte : **Inter** (`Inter_400Regular/500Medium/600SemiBold/700Bold`).
- Onglets (`app/(drive)/_layout.tsx`) : **NE PAS toucher** (Lot B).
- Chaque commit se termine par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Lancer les tests : `npm test -- <chemin>` ; typecheck : `npm run typecheck`. `npm install --legacy-peer-deps` au besoin.

---

### Task 1 : Palette de tokens (`src/ui/cozyPalette.ts`)

**Files:**
- Create: `src/ui/cozyPalette.ts`
- Test: `src/ui/cozyPalette.test.ts`

**Interfaces:**
- Produces: `cozyPalette: { light: CozyPaletteScheme; dark: CozyPaletteScheme }` où `CozyPaletteScheme = { primary: string; primaryContainer: string; secondary: string; error: string; background: string; surface: string; onSurface: string; onSurfaceVariant: string; outline: string; surfaceVariant: string }`. Type exporté `CozyPaletteScheme`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// src/ui/cozyPalette.test.ts
import { cozyPalette } from './cozyPalette'

const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s)

test('light scheme expose les tokens de marque cozy-ui', () => {
  expect(cozyPalette.light.primary).toBe('#3b82f7')
  expect(cozyPalette.light.primaryContainer).toBe('#C2DCFF')
  expect(cozyPalette.light.error).toBe('#F52D2D')
  expect(cozyPalette.light.background).toBe('#F5FAFF')
})

test('tous les tokens light+dark sont des hex #RRGGBB', () => {
  for (const scheme of [cozyPalette.light, cozyPalette.dark]) {
    for (const value of Object.values(scheme)) {
      expect(isHex(value)).toBe(true)
    }
  }
})
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- src/ui/cozyPalette.test.ts`
Expected: FAIL (`Cannot find module './cozyPalette'`).

- [ ] **Step 3 : Écrire l'implémentation**

```ts
// src/ui/cozyPalette.ts
// Palette Twake/cozy-ui. Sources :
//  - primary : thème de l'instance (--primaryColor: #3b82f7, mmaudet.twake.linagora.com/assets/styles/theme.css)
//  - autres accents : cozy-ui@139.2.0/react/palette.js (frenchPass/puertoRico/pomegranate/zircon)
//  - neutres : rampe cozy-ui coolGrey (approx. alignée ; affinable sur device)
export type CozyPaletteScheme = {
  primary: string
  primaryContainer: string
  secondary: string
  error: string
  background: string
  surface: string
  onSurface: string
  onSurfaceVariant: string
  outline: string
  surfaceVariant: string
}

export const cozyPalette: { light: CozyPaletteScheme; dark: CozyPaletteScheme } = {
  light: {
    primary: '#3b82f7',
    primaryContainer: '#C2DCFF',
    secondary: '#0DCBCF',
    error: '#F52D2D',
    background: '#F5FAFF',
    surface: '#FFFFFF',
    onSurface: '#32363F',
    onSurfaceVariant: '#5D6165',
    outline: '#D6D8DA',
    surfaceVariant: '#F0F3F5'
  },
  dark: {
    primary: '#6FA8FA',
    primaryContainer: '#1E3A5F',
    secondary: '#3FE0E4',
    error: '#FF6B6B',
    background: '#15171A',
    surface: '#1E2126',
    onSurface: '#E3E5E8',
    onSurfaceVariant: '#A0A4A8',
    outline: '#3A3E44',
    surfaceVariant: '#282C32'
  }
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- src/ui/cozyPalette.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/ui/cozyPalette.ts src/ui/cozyPalette.test.ts
git commit -m "feat(charte): add cozy-ui/Twake palette tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Thème Paper (`src/ui/theme.ts`)

**Files:**
- Modify: `src/ui/theme.ts` (réécriture)
- Test: `src/ui/theme.test.ts`

**Interfaces:**
- Consumes: `cozyPalette`, `CozyPaletteScheme` (Task 1).
- Produces: `lightTheme: MD3Theme`, `darkTheme: MD3Theme`, `cozyTokens: { radius: { sm: number; md: number }; shadowColor: string }`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// src/ui/theme.test.ts
import { lightTheme, darkTheme, cozyTokens } from './theme'

test('lightTheme mappe la palette cozy-ui sur les slots Paper', () => {
  expect(lightTheme.colors.primary).toBe('#3b82f7')
  expect(lightTheme.colors.primaryContainer).toBe('#C2DCFF')
  expect(lightTheme.colors.error).toBe('#F52D2D')
  expect(lightTheme.colors.background).toBe('#F5FAFF')
})

test('darkTheme reste un thème MD3 sombre', () => {
  expect(darkTheme.dark).toBe(true)
  expect(darkTheme.colors.primary).toBe('#6FA8FA')
})

test('cozyTokens expose radius + shadow', () => {
  expect(cozyTokens.radius.md).toBeGreaterThan(0)
})
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- src/ui/theme.test.ts`
Expected: FAIL (`lightTheme.colors.primary` = ancienne valeur `#0072B2`).

- [ ] **Step 3 : Écrire l'implémentation**

```ts
// src/ui/theme.ts
import { MD3LightTheme, MD3DarkTheme, MD3Theme } from 'react-native-paper'
import { cozyPalette, CozyPaletteScheme } from './cozyPalette'

const toColors = (s: CozyPaletteScheme) => ({
  primary: s.primary,
  primaryContainer: s.primaryContainer,
  secondary: s.secondary,
  error: s.error,
  background: s.background,
  surface: s.surface,
  onSurface: s.onSurface,
  onSurfaceVariant: s.onSurfaceVariant,
  outline: s.outline,
  surfaceVariant: s.surfaceVariant
})

export const cozyTokens = {
  radius: { sm: 6, md: 12 },
  shadowColor: '#0A1F44'
}

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, ...toColors(cozyPalette.light) }
}

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, ...toColors(cozyPalette.dark) }
}
```

- [ ] **Step 4 : Lancer test + typecheck → succès**

Run: `npm test -- src/ui/theme.test.ts && npm run typecheck`
Expected: PASS (3 tests) ; typecheck OK.

- [ ] **Step 5 : Commit**

```bash
git add src/ui/theme.ts src/ui/theme.test.ts
git commit -m "feat(charte): rebuild Paper theme on cozy-ui palette + cozyTokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Police Inter (`src/ui/fonts.ts` + `app/_layout.tsx`)

**Files:**
- Create: `src/ui/fonts.ts`
- Modify: `app/_layout.tsx` (chargement des polices + passage de `fonts` au thème Paper)
- Modify: `package.json` (dépendances)
- Test: `src/ui/fonts.test.ts`

**Interfaces:**
- Consumes: `lightTheme`, `darkTheme` (Task 2).
- Produces: `interFontConfig` (MD3 `fonts` config), `withInterFonts(theme: MD3Theme): MD3Theme`.

- [ ] **Step 1 : Installer les dépendances**

Run: `npx expo install @expo-google-fonts/inter expo-font`
Expected: ajout à `package.json` sans erreur.

- [ ] **Step 2 : Écrire le test qui échoue**

```ts
// src/ui/fonts.test.ts
import { interFontConfig, withInterFonts } from './fonts'
import { lightTheme } from './theme'

test('la config de police cible la famille Inter', () => {
  expect(interFontConfig.bodyLarge.fontFamily).toBe('Inter_400Regular')
  expect(interFontConfig.titleLarge.fontFamily).toBe('Inter_600SemiBold')
})

test('withInterFonts injecte les fonts dans un thème', () => {
  const themed = withInterFonts(lightTheme)
  expect(themed.fonts.bodyLarge.fontFamily).toBe('Inter_400Regular')
})
```

- [ ] **Step 3 : Lancer le test → échec**

Run: `npm test -- src/ui/fonts.test.ts`
Expected: FAIL (`Cannot find module './fonts'`).

- [ ] **Step 4 : Écrire l'implémentation**

```ts
// src/ui/fonts.ts
import { MD3Theme, configureFonts } from 'react-native-paper'
import type { MD3Type } from 'react-native-paper/lib/typescript/types'

const family = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold'
}

const base: Partial<MD3Type> = { letterSpacing: 0 }

export const interFontConfig = configureFonts({
  config: {
    displayLarge: { ...base, fontFamily: family.bold } as MD3Type,
    displayMedium: { ...base, fontFamily: family.bold } as MD3Type,
    displaySmall: { ...base, fontFamily: family.semibold } as MD3Type,
    headlineLarge: { ...base, fontFamily: family.bold } as MD3Type,
    headlineMedium: { ...base, fontFamily: family.semibold } as MD3Type,
    headlineSmall: { ...base, fontFamily: family.semibold } as MD3Type,
    titleLarge: { ...base, fontFamily: family.semibold } as MD3Type,
    titleMedium: { ...base, fontFamily: family.medium } as MD3Type,
    titleSmall: { ...base, fontFamily: family.medium } as MD3Type,
    labelLarge: { ...base, fontFamily: family.medium } as MD3Type,
    labelMedium: { ...base, fontFamily: family.medium } as MD3Type,
    labelSmall: { ...base, fontFamily: family.medium } as MD3Type,
    bodyLarge: { ...base, fontFamily: family.regular } as MD3Type,
    bodyMedium: { ...base, fontFamily: family.regular } as MD3Type,
    bodySmall: { ...base, fontFamily: family.regular } as MD3Type
  }
})

export const withInterFonts = (theme: MD3Theme): MD3Theme => ({
  ...theme,
  fonts: interFontConfig
})
```

- [ ] **Step 5 : Charger les polices dans `app/_layout.tsx`**

Ajouter le hook `useFonts` et retarder le rendu tant que les polices ne sont pas prêtes ; appliquer `withInterFonts` au thème passé au `PaperProvider`. Repérer la sélection du thème existante (`useColorScheme` → `lightTheme`/`darkTheme`) et l'envelopper :

```tsx
// app/_layout.tsx — imports
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { withInterFonts } from '@/ui/fonts'
// ... dans le composant InnerLayout, avant le return :
const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold })
if (!fontsLoaded) return null
// ... au montage du PaperProvider, remplacer `theme={scheme === 'dark' ? darkTheme : lightTheme}`
//     par `theme={withInterFonts(scheme === 'dark' ? darkTheme : lightTheme)}`
```

- [ ] **Step 6 : Lancer test + typecheck → succès**

Run: `npm test -- src/ui/fonts.test.ts && npm run typecheck`
Expected: PASS (2 tests) ; typecheck OK.

- [ ] **Step 7 : Commit**

```bash
git add src/ui/fonts.ts src/ui/fonts.test.ts app/_layout.tsx package.json package-lock.json
git commit -m "feat(charte): load Inter font and wire it into the Paper theme

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Composant `<CozyIcon>` + registre (`src/ui/icons/`)

**Files:**
- Create: `src/ui/icons/registry.ts`
- Create: `src/ui/icons/CozyIcon.tsx`
- Test: `src/ui/icons/CozyIcon.test.tsx`

**Interfaces:**
- Produces:
  - Type `CozyIconDef = { viewBox: string; paths: Array<{ d: string; fill?: string }> }`.
  - `ICONS: Record<string, CozyIconDef>` (registre, alimenté ici avec `star` et `cloud2`).
  - `<CozyIcon name={string} size={number} color={string} />` (défauts `size=24`, `color='currentColor'` → résolu en `#000` si non fourni).

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// src/ui/icons/CozyIcon.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { CozyIcon } from './CozyIcon'
import { ICONS } from './registry'

test('le registre contient les icônes de base', () => {
  expect(ICONS.star).toBeDefined()
  expect(ICONS.cloud2.viewBox).toBe('0 0 16 16')
})

test('CozyIcon rend une icône connue sans planter', () => {
  const { UNSAFE_root } = render(<CozyIcon name="star" size={24} color="#3b82f7" />)
  expect(UNSAFE_root).toBeTruthy()
})

test('CozyIcon renvoie null pour une icône inconnue', () => {
  const { toJSON } = render(<CozyIcon name="__nope__" />)
  expect(toJSON()).toBeNull()
})
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- src/ui/icons/CozyIcon.test.tsx`
Expected: FAIL (modules absents).

- [ ] **Step 3 : Écrire le registre (avec 2 icônes réelles cozy-ui)**

```ts
// src/ui/icons/registry.ts
// Icônes extraites de cozy-ui@139.2.0/transpiled/react/Icons/<Name>.js
export type CozyIconDef = { viewBox: string; paths: Array<{ d: string; fill?: string }> }

export const ICONS: Record<string, CozyIconDef> = {
  star: {
    viewBox: '0 0 16 16',
    paths: [{ d: 'M8 12.216l4.944 2.984-1.312-5.624L16 5.792l-5.752-.488L8 0 5.752 5.304 0 5.792l4.368 3.784L3.056 15.2 8 12.216z' }]
  },
  cloud2: {
    viewBox: '0 0 16 16',
    paths: [{ d: 'M10.4 13.2a5.6 5.6 0 10-5.152-7.8A3.961 3.961 0 004 5.2a3.954 3.954 0 00-1.161.172 3.968 3.968 0 00-1.525.864 4.01 4.01 0 00-1.27 2.377 3.99 3.99 0 00.63 2.81 3.955 3.955 0 00.943.99 4.029 4.029 0 001.411.668A3.92 3.92 0 004 13.2h6.4z' }]
  }
}
```

- [ ] **Step 4 : Écrire le composant**

```tsx
// src/ui/icons/CozyIcon.tsx
import React from 'react'
import Svg, { Path } from 'react-native-svg'
import { ICONS } from './registry'

type Props = { name: string; size?: number; color?: string }

export function CozyIcon({ name, size = 24, color = '#000000' }: Props) {
  const def = ICONS[name]
  if (!def) return null
  return (
    <Svg width={size} height={size} viewBox={def.viewBox}>
      {def.paths.map((p, i) => (
        <Path key={i} d={p.d} fill={p.fill ?? color} />
      ))}
    </Svg>
  )
}
```

- [ ] **Step 5 : Lancer test + typecheck → succès**

Run: `npm test -- src/ui/icons/CozyIcon.test.tsx && npm run typecheck`
Expected: PASS (3 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/ui/icons/registry.ts src/ui/icons/CozyIcon.tsx src/ui/icons/CozyIcon.test.tsx
git commit -m "feat(icons): add CozyIcon component + SVG registry (star, cloud2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Extraire le jeu d'icônes cozy-ui + 4 SVG de marque (registre)

**Files:**
- Modify: `src/ui/icons/registry.ts` (ajout des icônes)
- Test: `src/ui/icons/registry.test.ts`

**Interfaces:**
- Consumes: `CozyIconDef`, `ICONS` (Task 4).
- Produces: registre complété avec les clés listées ci-dessous.

**Procédé d'extraction (à appliquer pour chaque icône) :**
1. `npm pack cozy-ui@139.2.0` dans un dossier temporaire, `tar xzf cozy-ui-139.2.0.tgz`.
2. Pour l'icône `<Name>` : ouvrir `package/transpiled/react/Icons/<Name>.js`, relever `viewBox` et chaque `d: "..."` (ordre conservé). Une icône monochrome → `{ d }` (teintée par `color`) ; une icône multicolore de marque → `{ d, fill: '#RRGGBB' }` (couleur figée).
3. Ajouter l'entrée `nomEnCamelCase: { viewBox, paths: [...] }` dans `ICONS`.
4. Les 4 SVG de marque (Docs/Excalidraw/Grist/Nextcloud) : les relever depuis le clone web `src/assets/icons/icon-{docs,excalidraw,grist,nextcloud}.svg` (fills figés : docs `#000091`+`#C9191E`, excalidraw `#6965db`, grist `#16B378`, nextcloud `#0082C9`).

**Icônes à ajouter** (clés → nom cozy-ui) : `star`✔, `starOutline`→StarOutline, `cloud2`✔, `clockOutline`→ClockOutline, `shareExternal`→ShareExternal, `trash`→Trash, `magnifier`→Magnifier, `dots`→Dots, `plus`→Plus, `previous`→Previous, `download`→Download, `pen`→Pen, `rename`→Rename, `moveto`→Moveto, `palette`→Palette, `info`→Info, `history`→History, `restore`→Restore, `listMin`→ListMin, `mosaicMin`→MosaicMin, `upload`→Upload, `deviceBrowser`→DeviceBrowser, `fileTypeFolder`→FileTypeFolder, `fileTypeNote`→FileTypeNote, `fileTypeText`→FileTypeText, `fileTypeSheet`→FileTypeSheet, `fileTypeSlide`→FileTypeSlide. SVG de marque : `docs`, `excalidraw`, `grist`, `nextcloud`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// src/ui/icons/registry.test.ts
import { ICONS } from './registry'

const REQUIRED = [
  'star','starOutline','cloud2','clockOutline','shareExternal','trash','magnifier',
  'dots','plus','previous','download','pen','rename','moveto','palette','info',
  'history','restore','listMin','mosaicMin','upload','deviceBrowser',
  'fileTypeFolder','fileTypeNote','fileTypeText','fileTypeSheet','fileTypeSlide',
  'docs','excalidraw','grist','nextcloud'
]

test('toutes les icônes requises sont enregistrées et valides', () => {
  for (const name of REQUIRED) {
    expect(ICONS[name]).toBeDefined()
    expect(ICONS[name].viewBox).toMatch(/^[\d.]+ [\d.]+ [\d.]+ [\d.]+$/)
    expect(ICONS[name].paths.length).toBeGreaterThan(0)
    for (const p of ICONS[name].paths) expect(typeof p.d).toBe('string')
  }
})
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- src/ui/icons/registry.test.ts`
Expected: FAIL (clés manquantes après `star`/`cloud2`).

- [ ] **Step 3 : Compléter le registre**

Appliquer le procédé d'extraction ci-dessus pour chaque clé et ajouter les entrées à `ICONS`. Exemple d'entrée déjà validé (`starOutline`, à relever réellement depuis `StarOutline.js`) — même forme que `star`. Répéter mécaniquement pour toute la liste.

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm test -- src/ui/icons/registry.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ui/icons/registry.ts src/ui/icons/registry.test.ts
git commit -m "feat(icons): extract cozy-ui icon set + 4 brand SVGs into registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : `<TwakeLogo>` (`src/ui/icons/TwakeLogo.tsx`)

**Files:**
- Create: `src/ui/icons/TwakeLogo.tsx`
- Test: `src/ui/icons/TwakeLogo.test.tsx`

**Interfaces:**
- Produces: `<TwakeLogo size={number} />` (défaut `size=32`), rendu RN-SVG du logo cloud dégradé `#FF4759 → #FFD600`.

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// src/ui/icons/TwakeLogo.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { TwakeLogo } from './TwakeLogo'

test('TwakeLogo rend sans planter', () => {
  const { UNSAFE_root } = render(<TwakeLogo size={40} />)
  expect(UNSAFE_root).toBeTruthy()
})
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- src/ui/icons/TwakeLogo.test.tsx`
Expected: FAIL (`Cannot find module './TwakeLogo'`).

- [ ] **Step 3 : Écrire l'implémentation** (SVG relevé de `Drive.jsx`, filtre d'ombre retiré — support RN-SVG limité)

```tsx
// src/ui/icons/TwakeLogo.tsx
import React from 'react'
import Svg, { Rect, Path, Defs, LinearGradient, Stop, G } from 'react-native-svg'

export function TwakeLogo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 33 33" fill="none">
      <Rect x={0.618} y={0.718} width={32} height={32} rx={10.568} fill="url(#twakeLogoGrad)" />
      <G fill="#fff">
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M16.61 18.913a5.25 5.25 0 00-.228-1.54 5.455 5.455 0 00-.398-.96 5.25 5.25 0 00-.927-1.25 5.318 5.318 0 00-2.972-1.496 5.484 5.484 0 00-.779-.058 5.25 5.25 0 00-1.54.229 5.358 5.358 0 00-1.406.665 5.288 5.288 0 00-1.953 2.38 5.276 5.276 0 00-.398 2.29 5.306 5.306 0 005.037 5.037c.087.004.174.006.26.006h8.486v-5.303H16.61z"
        />
        <Path d="M19.791 24.216a7.425 7.425 0 100-14.85 7.425 7.425 0 000 14.85z" />
      </G>
      <Defs>
        <LinearGradient id="twakeLogoGrad" x1={4.126} y1={29.682} x2={39.046} y2={-5.32} gradientUnits="userSpaceOnUse">
          <Stop offset={0.248} stopColor="#FF4759" />
          <Stop offset={1} stopColor="#FFD600" />
        </LinearGradient>
      </Defs>
    </Svg>
  )
}
```

- [ ] **Step 4 : Lancer test + typecheck → succès**

Run: `npm test -- src/ui/icons/TwakeLogo.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/ui/icons/TwakeLogo.tsx src/ui/icons/TwakeLogo.test.tsx
git commit -m "feat(branding): add TwakeLogo (RN-SVG gradient cloud mark)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Migrer 5 fichiers de `vector-icons` vers `<CozyIcon>`

**Files:**
- Modify: `src/ui/ErrorState.tsx`, `src/ui/EmptyState.tsx`, `src/ui/SharedBadge.tsx`, `src/offline/PinnedBadge.tsx`, `app/preview/[fileId].tsx`
- Test: `src/ui/ErrorState.test.tsx` (nouveau, représentatif)

**Interfaces:**
- Consumes: `<CozyIcon>` + `ICONS` (Tasks 4-5).

**Correspondance des glyphes Material → cozy** (à appliquer dans chaque fichier) : icône d'erreur/alerte → `info` ; dossier/état vide → `fileTypeFolder` ; partage → `shareExternal` ; épingle/offline → `download` ; retour/prev → `previous` ; recherche → `magnifier`. (Adapter au glyphe réellement utilisé dans chaque fichier ; conserver `size`/`color` issus du thème.)

- [ ] **Step 1 : Écrire le test qui échoue** (sur `ErrorState`, représentatif)

```tsx
// src/ui/ErrorState.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { ErrorState } from './ErrorState'

test('ErrorState rend son message sans vector-icons', () => {
  const { getByText } = render(
    <PaperProvider><ErrorState message="Boom" /></PaperProvider>
  )
  expect(getByText('Boom')).toBeTruthy()
})
```

(Adapter les props au véritable contrat de `ErrorState`.)

- [ ] **Step 2 : Lancer le test → vérifier l'état initial**

Run: `npm test -- src/ui/ErrorState.test.tsx`
Expected: PASS ou FAIL selon le contrat — sert de filet avant migration.

- [ ] **Step 3 : Remplacer les usages `react-native-vector-icons`**

Dans chacun des 5 fichiers : supprimer `import Icon from 'react-native-vector-icons/MaterialCommunityIcons'` et remplacer chaque `<Icon name="…" .../>` par `<CozyIcon name="…" size={…} color={…} />` (import `import { CozyIcon } from '@/ui/icons/CozyIcon'`), selon la correspondance ci-dessus.

- [ ] **Step 4 : Vérifier l'absence de `vector-icons` (hors onglets)**

Run: `grep -rl "react-native-vector-icons" src app | grep -v "app/(drive)/_layout.tsx"`
Expected: aucune sortie (les 5 fichiers migrés ; seuls les onglets conservent vector-icons, hors périmètre).

- [ ] **Step 5 : Lancer tests + typecheck → succès**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/ui/ErrorState.tsx src/ui/EmptyState.tsx src/ui/SharedBadge.tsx src/offline/PinnedBadge.tsx "app/preview/[fileId].tsx" src/ui/ErrorState.test.tsx
git commit -m "refactor(icons): migrate 5 screens from vector-icons to CozyIcon

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Branding (splash + icône app + logo header) & validation device

**Files:**
- Modify: `src/ui/AppBar.tsx` (logo à gauche du titre)
- Replace: `assets/splash.png`, `assets/icon.png`, `assets/adaptive-icon.png`
- Modify: `app.json` si nécessaire
- Test: `src/ui/AppBar.test.tsx`

**Interfaces:**
- Consumes: `<TwakeLogo>` (Task 6).

- [ ] **Step 1 : Écrire le test qui échoue** (AppBar affiche le logo)

```tsx
// src/ui/AppBar.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { AppBar } from './AppBar'

test('AppBar affiche le TwakeLogo à côté du titre', () => {
  const { getByText, UNSAFE_getByType } = render(
    <PaperProvider><AppBar title="Mes fichiers" /></PaperProvider>
  )
  expect(getByText('Mes fichiers')).toBeTruthy()
  // TwakeLogo rend un Svg ; on vérifie qu'un Svg est présent
  const Svg = require('react-native-svg').default
  expect(UNSAFE_getByType(Svg)).toBeTruthy()
})
```

(Adapter les props au contrat réel d'`AppBar`.)

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm test -- src/ui/AppBar.test.tsx`
Expected: FAIL (pas de Svg dans l'AppBar actuel).

- [ ] **Step 3 : Ajouter le logo dans `AppBar.tsx`**

Insérer `<TwakeLogo size={28} />` (import `@/ui/icons/TwakeLogo`) à gauche du titre dans `Appbar.Header`/`Appbar.Content` (via un `Appbar.Action`/`View` sans casser le bouton retour existant). Ne PAS ajouter recherche/aide/avatar (Lot B).

- [ ] **Step 4 : Régénérer les assets de branding**

Générer un `assets/splash.png` (fond blanc `#FFFFFF`, logo cloud dégradé centré, texte « **Twake Workplace** » sous le logo) et `assets/icon.png` / `assets/adaptive-icon.png` (cloud dégradé). Procédé : rendre le SVG du logo (`Drive.jsx`) en PNG aux tailles requises (p.ex. via `rsvg-convert`/`sharp` ou un export design) ; conserver le `backgroundColor` blanc du splash dans `app.json`. Vérifier les chemins dans `app.json`.

- [ ] **Step 5 : Lancer tests + typecheck → succès**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6 : Build + validation visuelle sur le Pixel**

Run: `JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" npm run android`
Vérifier sur le device : splash « Twake Workplace », header avec logo, couleurs (primary bleu #3b82f7), police Inter, écrans d'état (Error/Empty) et badges avec icônes cozy-ui. Comparer aux captures web de référence.

- [ ] **Step 7 : Commit**

```bash
git add src/ui/AppBar.tsx src/ui/AppBar.test.tsx assets/splash.png assets/icon.png assets/adaptive-icon.png app.json
git commit -m "feat(branding): Twake Workplace splash, app icon, header logo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Auto-revue (couverture de la spec)

- §4.1 tokens de thème → Tasks 1-2 ✓ ; §4.2 Inter → Task 3 ✓ ; §4.3 module d'icônes + migration → Tasks 4,5,7 ✓ ; §4.4 branding (logo/splash/header/icône) → Tasks 6,8 ✓ ; §7 tests → tests par task + validation device (Task 8) ✓ ; onglets non touchés (contrainte) → vérifié Task 7 Step 4 ✓.
- Types cohérents : `CozyIconDef`/`ICONS` définis en Task 4, consommés en 5/7 ; `cozyPalette`/`CozyPaletteScheme` en Task 1 consommés en 2 ; `withInterFonts` en 3.
- Pas de placeholder : valeurs de palette réelles (Task 1), tracés SVG réels (star/cloud2 Task 4, logo Task 6), procédé d'extraction concret (Task 5).
