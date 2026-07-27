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

  it('pins the favorite flag in the partialIndex, not in the sort', () => {
    expect(captured.partialIndexArg).toMatchObject({ 'cozyMetadata.favorite': true })
  })

  // cozy-pouch-link's native SQLite engine only maps $eq/$ne/$gt/$gte/$lt/$lte/
  // $in/$nin/$exists. A field-level $or or a $regex makes it emit `undefined` as
  // the SQL operator, so `find` returns null and Favoris goes silently empty on
  // the local replica. The trash exclusions live in the screen, not the index.
  it('only uses partialIndex conditions the native SQLite engine can translate', () => {
    expect(captured.partialIndexArg).toEqual({ 'cozyMetadata.favorite': true })
  })

  it('selects on the sort attribute so the Mango index is usable', () => {
    expect(captured.whereArg).toMatchObject({ name: { $gt: null } })
  })

  it('indexes on name so the stack can use a Mango index', () => {
    expect(captured.indexFieldsArg).toEqual(['name'])
  })

  it('sorts by name ascending', () => {
    expect(captured.sortByArg).toEqual([{ name: 'asc' }])
  })

  // cozy-stack rejects a Mango sort whose keys mix directions with
  // "Mango sort can only use a single order (asc or desc)", which crashed
  // the Favoris screen.
  it('uses a single sort direction across every sort key', () => {
    const directions = (captured.sortByArg as Record<string, string>[]).flatMap(key =>
      Object.values(key)
    )
    expect(new Set(directions).size).toBe(1)
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
