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
