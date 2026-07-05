import i18n from './index'

// The bundle is the source of truth for which languages ship (mirrors the
// data-driven language picker). Kept as a literal so a dropped resource fails here.
const EXPECTED_LANGUAGES = ['en', 'fr', 'es', 'it', 'de', 'vi', 'ru']

describe('i18n bootstrap', () => {
  it('registers a translation bundle for every supported language', () => {
    for (const code of EXPECTED_LANGUAGES) {
      expect(i18n.hasResourceBundle(code, 'translation')).toBe(true)
    }
  })
  it('defaults to the device language in the test env (fr)', () => {
    expect(i18n.language).toBe('fr')
  })
  it('renders a Russian plural form correctly', () => {
    const t = i18n.getFixedT('ru')
    expect(t('drive.move.successBulk', { count: 1 })).toContain('перемещён')
    expect(t('drive.move.successBulk', { count: 3 })).toContain('перемещены')
    expect(t('drive.move.successBulk', { count: 8 })).toContain('элементов')
  })
})
