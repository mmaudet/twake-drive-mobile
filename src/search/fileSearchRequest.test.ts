import { buildFileSearchFindRequest, FILE_SEARCH_LIMIT } from './fileSearchRequest'

describe('buildFileSearchFindRequest', () => {
  it('builds a case-insensitive $regex selector for the stack _find', () => {
    const req = buildFileSearchFindRequest('report')
    expect(typeof req.selector.name.$regex).toBe('string')
    expect(new RegExp(req.selector.name.$regex).test('Q3 REPORT.pdf')).toBe(true)
    expect(new RegExp(req.selector.name.$regex).test('q3 report.pdf')).toBe(true)
    expect(req.selector.trashed).toBe(false)
    expect(req.limit).toBe(FILE_SEARCH_LIMIT)
  })

  it('escapes regex metacharacters from user input', () => {
    const req = buildFileSearchFindRequest('a.b')
    expect(new RegExp(req.selector.name.$regex).test('axb')).toBe(false)
    expect(new RegExp(req.selector.name.$regex).test('a.b')).toBe(true)
  })

  // The request is JSON-serialized onto the wire to the stack — the $regex must
  // survive intact (a RegExp object would become {} and match nothing).
  it('produces a JSON-serializable request', () => {
    const req = buildFileSearchFindRequest('report')
    const roundTripped = JSON.parse(JSON.stringify(req)) as typeof req
    expect(roundTripped.selector.name.$regex).toBe(req.selector.name.$regex)
    expect(new RegExp(roundTripped.selector.name.$regex).test('Q3 REPORT.pdf')).toBe(true)
  })
})
