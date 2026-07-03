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
