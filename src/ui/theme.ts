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
