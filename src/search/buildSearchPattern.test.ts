import { buildSearchPattern } from './buildSearchPattern'

describe('buildSearchPattern', () => {
  it('returns a JSON-serialization-safe string (survives the cozy-client store round-trip)', () => {
    const p = buildSearchPattern('report')
    expect(typeof p).toBe('string')
    // A RegExp object would serialize to {} here; a string must survive intact.
    expect(JSON.parse(JSON.stringify({ $regex: p })).$regex).toBe(p)
  })

  it('matches case-insensitively via [xX] classes (no `i` flag needed)', () => {
    expect(new RegExp(buildSearchPattern('report')).test('Q3 REPORT.pdf')).toBe(true)
    expect(new RegExp(buildSearchPattern('REPORT')).test('q3 report.pdf')).toBe(true)
  })

  it('escapes regex metacharacters — literal match only', () => {
    expect(new RegExp(buildSearchPattern('a.b')).test('axb')).toBe(false)
    expect(new RegExp(buildSearchPattern('a.b')).test('xx a.b yy')).toBe(true)
    expect(new RegExp(buildSearchPattern('(a+)+')).test('literal (a+)+ text')).toBe(true)
  })

  it('trims the term', () => {
    expect(buildSearchPattern('  hi  ')).toBe('[hH][iI]')
  })
})
