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
