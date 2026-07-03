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
