import { buildFilePageFindRequest, FILE_SEARCH_PAGE_SIZE } from './fileSearchRequest'

describe('buildFilePageFindRequest', () => {
  it('uses the name-index sentinel selector', () => {
    const req = buildFilePageFindRequest()
    // $gt: null on `name` is the sentinel that tells cozy-stack to use the name index
    expect(req.selector).toEqual({ name: { $gt: null } })
  })

  it('sorts ascending by name', () => {
    const req = buildFilePageFindRequest()
    expect(req.sort).toEqual([{ name: 'asc' }])
  })

  it('requests the right page size', () => {
    const req = buildFilePageFindRequest()
    expect(req.limit).toBe(FILE_SEARCH_PAGE_SIZE)
  })

  it('includes the trashed field so the client can filter it', () => {
    const req = buildFilePageFindRequest()
    expect(req.fields).toContain('trashed')
  })

  it('includes no bookmark when called without argument', () => {
    const req = buildFilePageFindRequest()
    expect(req.bookmark).toBeUndefined()
  })

  it('passes a bookmark through for the next page', () => {
    const req = buildFilePageFindRequest('cursor-abc')
    expect(req.bookmark).toBe('cursor-abc')
  })

  it('produces a JSON-serializable request (bookmark survives round-trip)', () => {
    const req = buildFilePageFindRequest('cursor-xyz')
    const roundTripped = JSON.parse(JSON.stringify(req)) as typeof req
    expect(roundTripped.bookmark).toBe('cursor-xyz')
    expect(roundTripped.selector).toEqual({ name: { $gt: null } })
  })
})
