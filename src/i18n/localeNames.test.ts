import { localeDisplayName } from './localeNames'

describe('localeDisplayName', () => {
  it('returns native names for known codes', () => {
    expect(localeDisplayName('fr')).toBe('Français')
    expect(localeDisplayName('en')).toBe('English')
    expect(localeDisplayName('it')).toBe('Italiano')
    expect(localeDisplayName('es')).toBe('Español')
    expect(localeDisplayName('de')).toBe('Deutsch')
    expect(localeDisplayName('vi')).toBe('Tiếng Việt')
    expect(localeDisplayName('ru')).toBe('Русский')
  })
  it('accepts common country-style aliases', () => {
    expect(localeDisplayName('ge')).toBe('Deutsch')
    expect(localeDisplayName('vn')).toBe('Tiếng Việt')
  })
  it('falls back to the upper-cased code for unknown locales', () => {
    expect(localeDisplayName('zz')).toBe('ZZ')
  })
})
