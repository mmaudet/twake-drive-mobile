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
