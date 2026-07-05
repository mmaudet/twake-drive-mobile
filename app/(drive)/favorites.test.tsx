import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { I18nextProvider } from 'react-i18next'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn()
  }),
  useFocusEffect: (cb: () => void) => cb()
}))

jest.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ logout: jest.fn() })
}))

// useQuery is the core hook used by the wired-up favorites screen.
// The mock returns the shape the screen expects: { data, fetchStatus }.
const mockUseQuery = jest.fn()

jest.mock('cozy-client', () => {
  // Chainable no-op Q builder — enough for favoritesQuery() to not throw.
  const makeQDef = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {}
    const chain = (): typeof self => self
    self.where = chain
    self.partialIndex = chain
    self.indexFields = chain
    self.sortBy = chain
    self.limitBy = chain
    return self
  }
  return {
    __esModule: true,
    Q: jest.fn(makeQDef),
    useClient: () => ({ getStackClient: () => ({ uri: '' }) }),
    useQuery: (...args: unknown[]) => mockUseQuery(...args)
  }
})

jest.mock('@/ui/SyncIndicator', () => ({
  SyncIndicator: () => null
}))

// FavoritesScreen renders AppBar, which now reads the account identity via
// useCurrentUser (Task 4/8). The local cozy-client Q() mock above only stubs
// the chainable methods favoritesQuery() needs (where/sortBy/limitBy/...) —
// it has no .getById, which useCurrentUser's module-level query descriptor
// calls at import time, so mock the hook directly instead.
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ initials: 'MM', loading: false })
}))

// FolderRow / FileRow pull in offline + sharing hooks
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

jest.mock('@/pouchdb/triggerReplication', () => ({
  getPouchLink: () => null
}))

import FavoritesScreen from './favorites'
import i18n from '@/i18n'

const wrap = (ui: React.ReactElement) => (
  <I18nextProvider i18n={i18n}>
    <PaperProvider>{ui}</PaperProvider>
  </I18nextProvider>
)

// Helper: build a minimal query result
const makeQueryResult = (data: unknown[], fetchStatus: string = 'loaded') => ({
  data,
  fetchStatus,
  lastError: null,
  fetch: jest.fn()
})

describe('FavoritesScreen', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    mockUseQuery.mockReturnValue(makeQueryResult([]))
  })

  it('renders the Favoris title', () => {
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Favoris')).toBeOnTheScreen()
  })

  it('renders the empty favorites message when there are no favorites', () => {
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Aucun favori')).toBeOnTheScreen()
  })

  it('hides the empty state while data is being fetched', () => {
    mockUseQuery.mockReturnValue(makeQueryResult([], 'loading'))
    render(wrap(<FavoritesScreen />))
    // When loading, the empty-state message must NOT appear
    expect(screen.queryByText('Aucun favori')).toBeNull()
  })

  it('renders a favorited file name in the list', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult([
        {
          _id: 'fav-1',
          name: 'Important doc.pdf',
          type: 'file',
          size: 2048,
          mime: 'application/pdf',
          updated_at: '2026-01-01T00:00:00.000Z',
          cozyMetadata: { favorite: true }
        }
      ])
    )
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Important doc.pdf')).toBeOnTheScreen()
  })

  it('renders a favorited folder name in the list', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult([
        {
          _id: 'dir-1',
          name: 'My Project',
          type: 'directory',
          cozyMetadata: { favorite: true }
        }
      ])
    )
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('My Project')).toBeOnTheScreen()
  })

  // The offline pouch query fails OPEN and returns non-favourites too; the
  // screen must filter them out client-side (isFavorite, strict === true).
  it('shows only real favourites, dropping non-favourites the query wrongly returns', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult([
        {
          _id: 'fav-1',
          name: 'Real favourite.pdf',
          type: 'file',
          size: 1024,
          cozyMetadata: { favorite: true }
        },
        {
          _id: 'not-1',
          name: 'Not a favourite',
          type: 'directory',
          cozyMetadata: { favorite: false }
        },
        { _id: 'not-2', name: 'No favourite flag', type: 'directory' }
      ])
    )
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Real favourite.pdf')).toBeOnTheScreen()
    expect(screen.queryByText('Not a favourite')).toBeNull()
    expect(screen.queryByText('No favourite flag')).toBeNull()
  })

  // A trashed folder keeps its cozyMetadata.favorite flag, so the fails-open
  // query returns it. cozy-stack does NOT reliably set a `trashed` boolean, so
  // the screen must also catch the trash dir_id and the /.cozy_trash path.
  it('drops favourited items in the trash (trashed flag, trash dir_id, or trash path)', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult([
        {
          _id: 'live',
          name: 'Live favourite',
          type: 'directory',
          cozyMetadata: { favorite: true }
        },
        {
          _id: 't1',
          name: 'Trashed by flag',
          type: 'directory',
          trashed: true,
          cozyMetadata: { favorite: true }
        },
        {
          _id: 't2',
          name: 'Trashed by dir_id',
          type: 'directory',
          dir_id: 'io.cozy.files.trash-dir',
          cozyMetadata: { favorite: true }
        },
        {
          _id: 't3',
          name: 'Trashed by path',
          type: 'directory',
          path: '/.cozy_trash/old',
          cozyMetadata: { favorite: true }
        }
      ])
    )
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Live favourite')).toBeOnTheScreen()
    expect(screen.queryByText('Trashed by flag')).toBeNull()
    expect(screen.queryByText('Trashed by dir_id')).toBeNull()
    expect(screen.queryByText('Trashed by path')).toBeNull()
  })
})
