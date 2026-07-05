import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
// NOTE: imported as `itLocale`, not `it`, so it does not shadow Jest's global `it()`.
import itLocale from './locales/it.json'
import de from './locales/de.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'

const bundles = { en, fr, es, it: itLocale, de, vi, ru }
type LanguageCode = keyof typeof bundles
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

/** Leaf [dotted-key, value] pairs. */
function entries(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    entries(v, prefix ? `${prefix}.${k}` : k)
  )
}
const stripPlural = (k: string) =>
  PLURAL_SUFFIXES.reduce((acc, s) => (acc.endsWith(s) ? acc.slice(0, -s.length) : acc), k)
const logicalKeys = (o: unknown) => new Set(entries(o).map(([k]) => stripPlural(k)))
const rawKeys = (o: unknown) => new Set(entries(o).map(([k]) => k))

const enLogical = logicalKeys(en)
const pluralBases = new Set(
  entries(en)
    .map(([k]) => k)
    .filter(k => k !== stripPlural(k))
    .map(stripPlural)
)

describe('locale parity', () => {
  for (const code of Object.keys(bundles) as LanguageCode[]) {
    describe(code, () => {
      it('has exactly the English logical key set', () => {
        const keys = logicalKeys(bundles[code])
        expect([...enLogical].filter(k => !keys.has(k))).toEqual([]) // missing
        expect([...keys].filter(k => !enLogical.has(k))).toEqual([]) // extra
      })
      it('carries the plural categories its grammar requires', () => {
        const keys = rawKeys(bundles[code])
        const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories
        for (const base of pluralBases) {
          for (const cat of cats) expect(keys.has(`${base}_${cat}`)).toBe(true)
        }
      })
      it('has no empty values', () => {
        expect(
          entries(bundles[code])
            .filter(([, v]) => v.trim() === '')
            .map(([k]) => k)
        ).toEqual([])
      })
    })
  }
})
