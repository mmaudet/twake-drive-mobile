/**
 * Tests for query builders — focus on the shape produced by favoritesQuery()
 * so regressions in selector / partialFilter / sort are caught early.
 *
 * cozy-client imports native modules that aren't available in Jest, so we
 * mock the whole package with a Q builder that records its call arguments
 * and is fully chainable.
 */

// ── The captured args from the Q builder chain ─────────────────────────────
const captured: {
  doctype?: string
  whereArg?: unknown
  partialIndexArg?: unknown
  indexFieldsArg?: unknown
  sortByArg?: unknown
  limitByArg?: unknown
} = {}

jest.mock('cozy-client', () => {
  const makeDef = (doctype: string) => {
    captured.doctype = doctype
    const self: Record<string, unknown> = {}
    const chain =
      (key: string) =>
      (arg: unknown): typeof self => {
        // Coerce key → captured property names
        if (key === 'where') captured.whereArg = arg
        if (key === 'partialIndex') captured.partialIndexArg = arg
        if (key === 'indexFields') captured.indexFieldsArg = arg
        if (key === 'sortBy') captured.sortByArg = arg
        if (key === 'limitBy') captured.limitByArg = arg
        return self
      }
    self.where = chain('where')
    self.partialIndex = chain('partialIndex')
    self.indexFields = chain('indexFields')
    self.sortBy = chain('sortBy')
    self.limitBy = chain('limitBy')
    return self
  }

  return {
    __esModule: true,
    Q: jest.fn((doctype: string) => makeDef(doctype)),
    // Stubs for anything else queries.ts might re-export / use
    QueryDefinition: class {},
    useClient: () => null,
    useQuery: jest.fn()
  }
})

import { favoritesQuery, favoritesQueryAs, recentQuery } from './queries'

describe('favoritesQuery', () => {
  beforeEach(() => {
    // Reset captured state before each test
    Object.keys(captured).forEach(k => delete (captured as Record<string, unknown>)[k])
    favoritesQuery()
  })

  it('targets io.cozy.files', () => {
    expect(captured.doctype).toBe('io.cozy.files')
  })

  it('filters on cozyMetadata.favorite via the where selector', () => {
    expect(captured.whereArg).toMatchObject({ 'cozyMetadata.favorite': true })
  })

  it('indexes the nested favorite field so PouchDB matches it locally', () => {
    expect(captured.indexFieldsArg).toContain('cozyMetadata.favorite')
  })

  it('indexes on name so the stack can use a Mango index', () => {
    expect(captured.indexFieldsArg).toContain('name')
  })

  it('sorts by name ascending', () => {
    expect(captured.sortByArg).toEqual(expect.arrayContaining([{ name: 'asc' }]))
  })
})

describe('favoritesQueryAs', () => {
  it('is a non-empty string constant', () => {
    expect(typeof favoritesQueryAs).toBe('string')
    expect(favoritesQueryAs.length).toBeGreaterThan(0)
  })
})

describe('recentQuery', () => {
  beforeEach(() => {
    Object.keys(captured).forEach(k => delete (captured as Record<string, unknown>)[k])
    recentQuery()
  })

  it('targets io.cozy.files', () => {
    expect(captured.doctype).toBe('io.cozy.files')
  })

  // Perf fix: NO partialIndex, so the requested index name matches the
  // replication warmup (`by_updated_at`) and pouch never rebuilds it over the
  // whole replica on first open (the ~1-minute freeze).
  it('does not use a partialIndex', () => {
    expect(captured.partialIndexArg).toBeUndefined()
  })

  it('sorts by updated_at descending', () => {
    expect(captured.sortByArg).toEqual([{ updated_at: 'desc' }])
  })

  it('over-fetches (limit 200) so the screen can filter client-side', () => {
    expect(captured.limitByArg).toBe(200)
  })
})
