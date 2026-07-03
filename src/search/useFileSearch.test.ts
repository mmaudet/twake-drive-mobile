/**
 * useFileSearch — unit tests for the paginated "contains" search hook.
 *
 * Mocking strategy: jest.mock is hoisted by Babel before any variable
 * declarations, so the mock factories must be self-contained (no outer
 * variable closures). We retrieve the mock via a `jest.Mock` cast after import
 * (the repo's @types/jest predates `jest.mocked()`).
 */

// ── Module mock declarations (hoisted by jest before imports) ─────────────────

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: jest.fn()
}))

jest.mock('@/client/queries', () => ({
  HIDDEN_ROOT_DIR_IDS: ['io.cozy.files.trash-dir', 'io.cozy.files.shared-drives-dir']
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useClient } from 'cozy-client'
import { useFileSearch } from './useFileSearch'
import { FILE_SEARCH_PAGE_SIZE } from './fileSearchRequest'

// ── Test helpers ──────────────────────────────────────────────────────────────

const mockUseClient = useClient as jest.Mock

/** Install a fresh fetchJSON mock and wire it into the hook's client. */
function setupFetchJSON() {
  const fetchJSON = jest.fn()
  mockUseClient.mockReturnValue({
    getStackClient: () => ({ fetchJSON })
  } as never)
  return fetchJSON
}

/** Build a minimal FileQueryResult-shaped doc. */
const makeDoc = (name: string, id = name) => ({
  _id: id,
  _type: 'io.cozy.files',
  name,
  type: 'file' as const,
  trashed: false
})

/** Already-resolved single-page response (last page). */
const singlePage = (docs: object[]) => Promise.resolve({ docs, next: false })

/** Already-resolved page that declares a following page. */
const pageWithMore = (docs: object[], cursor = 'bm-1') =>
  Promise.resolve({ docs, bookmark: cursor, next: true })

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseClient.mockReset()
})

describe('useFileSearch', () => {
  it('is idle when disabled', () => {
    mockUseClient.mockReturnValue(null as never)
    const { result } = renderHook(() => useFileSearch('report', false))
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toHaveLength(0)
  })

  it('is idle when client is null', () => {
    mockUseClient.mockReturnValue(null as never)
    const { result } = renderHook(() => useFileSearch('report', true))
    expect(result.current.status).toBe('idle')
  })

  it('is idle when enabled becomes false', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockReturnValue(singlePage([makeDoc('report.pdf')]))
    const { result, rerender } = renderHook(
      ({ term, enabled }: { term: string; enabled: boolean }) => useFileSearch(term, enabled),
      { initialProps: { term: 'report', enabled: true } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    rerender({ term: 'report', enabled: false })
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.data).toHaveLength(0)
  })

  it('filters "contains" case-insensitively', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockReturnValueOnce(
      singlePage([
        makeDoc('Q3 REPORT.pdf'),
        makeDoc('q3 report.pdf'),
        makeDoc('summary.pdf'), // no match
        makeDoc('reportage.mp4') // match (contains 'report')
      ])
    )
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    const names = result.current.data.map(d => d.name)
    expect(names).toEqual(
      expect.arrayContaining(['Q3 REPORT.pdf', 'q3 report.pdf', 'reportage.mp4'])
    )
    expect(names).not.toContain('summary.pdf')
  })

  it('filters out trashed docs', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockReturnValueOnce(
      singlePage([
        { ...makeDoc('alive.pdf'), trashed: false },
        { ...makeDoc('deleted.pdf'), trashed: true }
      ])
    )
    const { result } = renderHook(() => useFileSearch('alive', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.map(d => d.name)).toEqual(['alive.pdf'])
  })

  it('filters out HIDDEN_ROOT_DIR_IDS', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockReturnValueOnce(
      singlePage([
        makeDoc('trash-dir-docs', 'io.cozy.files.trash-dir'), // hidden by ID
        makeDoc('my-dir-docs.pdf', 'real-id') // matches term, not hidden
      ])
    )
    const { result } = renderHook(() => useFileSearch('dir', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.map(d => d._id)).toEqual(['real-id'])
  })

  it('paginates: fetches a second page when next:true + bookmark present', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON
      .mockReturnValueOnce(pageWithMore([makeDoc('alpha.pdf')], 'bm-page2'))
      .mockReturnValueOnce(singlePage([makeDoc('alpha2.pdf')]))
    const { result } = renderHook(() => useFileSearch('alpha', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchJSON).toHaveBeenCalledTimes(2)
    // Second call must carry the bookmark cursor
    expect(fetchJSON.mock.calls[1][2]).toMatchObject({ bookmark: 'bm-page2' })
    expect(result.current.data.map(d => d.name)).toEqual(
      expect.arrayContaining(['alpha.pdf', 'alpha2.pdf'])
    )
  })

  it('falls back to doc.length===PAGE_SIZE heuristic when `next` is absent', async () => {
    const fetchJSON = setupFetchJSON()
    // A full page with no `next` field — heuristic says "there might be more"
    const sparsePage = Array.from({ length: FILE_SEARCH_PAGE_SIZE }, (_, i) =>
      // Use a name that doesn't match so we don't hit the result cap
      makeDoc(`file-${i}.txt`)
    )
    fetchJSON
      .mockReturnValueOnce(Promise.resolve({ docs: sparsePage, bookmark: 'bm-fallback' }))
      .mockReturnValueOnce(singlePage([]))
    const { result } = renderHook(() => useFileSearch('zzz-no-match', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    // Should have fetched a second page because the first was full
    expect(fetchJSON).toHaveBeenCalledTimes(2)
  })

  it('stops when the last page is not full (next:false)', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockReturnValueOnce(singlePage([makeDoc('only.pdf')]))
    const { result } = renderHook(() => useFileSearch('only', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchJSON).toHaveBeenCalledTimes(1)
  })

  it('stops early when the result cap (100) is reached', async () => {
    const fetchJSON = setupFetchJSON()
    // One page of 1000 matches — loop exits after page 1 (cap already exceeded)
    const bigPage = Array.from({ length: FILE_SEARCH_PAGE_SIZE }, (_, i) =>
      makeDoc(`match-${i}.pdf`)
    )
    fetchJSON.mockReturnValueOnce(pageWithMore(bigPage, 'bm-cap'))
    const { result } = renderHook(() => useFileSearch('match', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.length).toBeLessThanOrEqual(100)
    // Should NOT have fetched a second page
    expect(fetchJSON).toHaveBeenCalledTimes(1)
  })

  it('accumulates matches across pages', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON
      .mockReturnValueOnce(pageWithMore([makeDoc('doc1.pdf')], 'bm-two'))
      .mockReturnValueOnce(singlePage([makeDoc('doc2.pdf')]))
    const { result } = renderHook(() => useFileSearch('doc', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.map(d => d.name)).toEqual(
      expect.arrayContaining(['doc1.pdf', 'doc2.pdf'])
    )
  })

  it('drops stale responses when the term changes mid-flight', async () => {
    let resolveOld!: (v: object) => void
    const oldPending = new Promise<object>(r => {
      resolveOld = r
    })

    const fetchJSON = setupFetchJSON()
    fetchJSON
      // First term 'old' → slow, blocks until we call resolveOld
      .mockReturnValueOnce(oldPending)
      // Second term 'new' → resolves immediately
      .mockReturnValueOnce(singlePage([makeDoc('new-result.pdf')]))

    const { result, rerender } = renderHook(
      ({ term }: { term: string }) => useFileSearch(term, true),
      { initialProps: { term: 'old' } }
    )

    // Change term before the first request resolves
    rerender({ term: 'new' })
    await waitFor(() => expect(result.current.status).toBe('success'))

    // Resolve the stale first response — state must not change
    await act(async () => {
      resolveOld({ docs: [makeDoc('old-result.pdf')], next: false })
    })

    // Only new-result should be visible
    expect(result.current.data.map(d => d.name)).toEqual(['new-result.pdf'])
  })

  it('surfaces an error state when fetchJSON rejects', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockRejectedValueOnce(new Error('network error'))
    const { result } = renderHook(() => useFileSearch('anything', true))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toHaveLength(0)
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('reload() re-triggers the search', async () => {
    const fetchJSON = setupFetchJSON()
    fetchJSON.mockReturnValue(singlePage([makeDoc('result.pdf')]))
    const { result } = renderHook(() => useFileSearch('result', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchJSON).toHaveBeenCalledTimes(1)

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchJSON).toHaveBeenCalledTimes(2)
  })
})
