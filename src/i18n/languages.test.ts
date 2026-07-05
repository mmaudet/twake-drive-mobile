import { isSupportedLanguage, pickLanguage, SUPPORTED_LANGUAGES } from './languages'

describe('isSupportedLanguage', () => {
  it('accepts every declared language code', () => {
    for (const { code } of SUPPORTED_LANGUAGES) expect(isSupportedLanguage(code)).toBe(true)
  })
  it('rejects unknown / empty codes', () => {
    expect(isSupportedLanguage('pt')).toBe(false)
    expect(isSupportedLanguage(null)).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
  })
})

describe('pickLanguage', () => {
  it('honours a concrete stored preference over the device locale', () => {
    expect(pickLanguage('ru', [{ languageCode: 'fr' }])).toBe('ru')
  })
  it('follows the first supported device locale when preference is "system"', () => {
    expect(pickLanguage('system', [{ languageCode: 'de' }, { languageCode: 'en' }])).toBe('de')
  })
  it('skips unsupported device locales in order', () => {
    expect(pickLanguage('system', [{ languageCode: 'pt' }, { languageCode: 'it' }])).toBe('it')
  })
  it('falls back to English when nothing matches', () => {
    expect(pickLanguage('system', [{ languageCode: 'ja' }])).toBe('en')
    expect(pickLanguage(null, [])).toBe('en')
  })
  it('ignores an unsupported stored preference and follows the OS', () => {
    expect(pickLanguage('pt' as never, [{ languageCode: 'es' }])).toBe('es')
  })
})
