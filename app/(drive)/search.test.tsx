import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

// ── expo-router ──────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() })
}))

// ── cozy-client ──────────────────────────────────────────────────────────────
// mockClient starts with 'mock' so Jest's babel transform allows it to be used
// inside the jest.mock factory even though jest.mock is hoisted to the top.
const mockQuery = jest.fn()
// FileThumbnail (rendered inside FileRow) calls client.getStackClient().uri
const mockClient = { query: mockQuery, getStackClient: () => ({ uri: '' }) }

jest.mock('cozy-client', () => {
  const makeQDef = (): Record<string, () => unknown> => {
    const self: Record<string, () => unknown> = {}
    const chain = (): Record<string, () => unknown> => self
    self.where = chain
    self.partialIndex = chain
    self.indexFields = chain
    self.limitBy = chain
    return self
  }
  return {
    __esModule: true,
    // Return the same stable reference on every render to avoid infinite loops
    // caused by the fetch useEffect depending on `client`.
    useClient: () => mockClient,
    Q: jest.fn(makeQDef)
  }
})

// ── SyncIndicator internals ───────────────────────────────────────────────────
jest.mock('@/pouchdb/triggerReplication', () => ({
  getPouchLink: () => null
}))

// ── offline / network helpers used by FileRow / FolderRow ────────────────────
jest.mock('@/offline/useOfflineState', () => ({
  useOfflineState: jest.fn().mockReturnValue(undefined),
  useOfflineFolderPinned: jest.fn().mockReturnValue(false),
  useOfflineFolderState: jest.fn().mockReturnValue({
    pinned: false,
    aggregate: null,
    total: 0,
    downloaded: 0,
    downloading: 0,
    pending: 0,
    failed: 0
  })
}))

jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => true
}))

jest.mock('@/files/openFromList', () => ({
  openFileFromList: jest.fn().mockResolvedValue(undefined)
}))

// ── Subject ───────────────────────────────────────────────────────────────────
import SearchScreen from './search'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

// ---------------------------------------------------------------------------
describe('SearchScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockQuery.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ── 1. Initial render ─────────────────────────────────────────────────────
  it('renders the search input', () => {
    render(wrap(<SearchScreen />))
    expect(screen.getByPlaceholderText('drive.searchHint')).toBeOnTheScreen()
  })

  it('shows the empty hint when no term has been entered', () => {
    render(wrap(<SearchScreen />))
    // EmptyState renders the message as a Text node
    expect(screen.getByText('drive.searchHint')).toBeOnTheScreen()
  })

  // ── 2. Results ────────────────────────────────────────────────────────────
  it('shows a file row after a debounced search returns a matching file', async () => {
    mockQuery.mockResolvedValue({
      data: [
        {
          _id: 'f1',
          name: 'hello.pdf',
          type: 'file',
          size: 1024,
          mime: 'application/pdf',
          updated_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    })

    render(wrap(<SearchScreen />))
    fireEvent.changeText(screen.getByPlaceholderText('drive.searchHint'), 'hello')

    await act(async () => {
      jest.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(screen.getByText('hello.pdf')).toBeOnTheScreen()
    })
  })

  // ── 3. Empty result ───────────────────────────────────────────────────────
  it('shows the empty-results state when the server returns no matching files', async () => {
    mockQuery.mockResolvedValue({
      data: [
        {
          _id: 'f2',
          name: 'other.pdf',
          type: 'file',
          size: 512,
          mime: 'application/pdf',
          updated_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    })

    render(wrap(<SearchScreen />))
    fireEvent.changeText(screen.getByPlaceholderText('drive.searchHint'), 'zzznomatch')

    await act(async () => {
      jest.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(screen.getByText('drive.searchEmpty')).toBeOnTheScreen()
    })
  })
})
