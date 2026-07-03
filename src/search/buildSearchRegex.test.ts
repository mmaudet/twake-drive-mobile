import { buildSearchRegex } from './buildSearchRegex'

describe('buildSearchRegex', () => {
  it('matche en insensible à la casse', () => {
    expect(buildSearchRegex('report').test('Q3 REPORT.pdf')).toBe(true)
    expect(buildSearchRegex('REPORT').test('q3 report.pdf')).toBe(true)
  })

  it('échappe les métacaractères regex (correspondance littérale)', () => {
    expect(buildSearchRegex('a.b').test('axb')).toBe(false)
    expect(buildSearchRegex('a.b').test('xx a.b yy')).toBe(true)
    expect(buildSearchRegex('(a+)+').test('literal (a+)+ text')).toBe(true)
  })

  it('renvoie un RegExp portant le flag i', () => {
    const re = buildSearchRegex('x')
    expect(re).toBeInstanceOf(RegExp)
    expect(re.flags).toContain('i')
  })

  it('trim la saisie', () => {
    expect(buildSearchRegex('  hi  ').source).toBe('hi')
  })
})
