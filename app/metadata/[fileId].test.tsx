import React from 'react'
import { ActivityIndicator } from 'react-native-paper'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => true
  }),
  useLocalSearchParams: () => ({ fileId: 'f1' })
}))

const mockUseQuery = jest.fn()

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null,
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({ getById: () => ({}) })
}))

const mockPin = jest.fn()
const mockUnpin = jest.fn()

jest.mock('@/offline/useOfflineActions', () => ({
  useOfflineActions: () => ({ pin: mockPin, unpin: mockUnpin })
}))

jest.mock('@/offline/useOfflineState', () => ({ useOfflineState: () => undefined }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))

jest.mock('@/files/openFile', () => ({ openFileNatively: jest.fn() }))
jest.mock('@/files/shortcuts', () => ({ fetchShortcutUrl: jest.fn() }))
jest.mock('@/files/renameEntry', () => ({ renameEntry: jest.fn() }))
jest.mock('@/files/deleteFile', () => ({ softDeleteEntry: jest.fn() }))
jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath: (id: string) => `file://${id}` }
}))

import MetadataRoute from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const defaultFileData = {
  _id: 'f1',
  name: 'rapport.pdf',
  type: 'file',
  size: 2_400_000,
  mime: 'application/pdf',
  updated_at: '2026-04-29T10:00:00.000Z',
  path: '/Drive/rapport.pdf',
  cozyMetadata: { createdBy: { account: 'me' } }
}

describe('MetadataRoute', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPush.mockReset()
    mockReplace.mockReset()
    mockPin.mockReset()
    mockUnpin.mockReset()
    mockUseQuery.mockReturnValue({
      data: defaultFileData,
      fetchStatus: 'loaded',
      fetch: jest.fn()
    })
  })

  it('renders the file name', () => {
    render(wrap(<MetadataRoute />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })

  it('calls router.replace with /share/<fileId> when Share is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.share'))
    expect(mockReplace).toHaveBeenCalledWith('/share/f1')
  })

  it('calls router.back when Close is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('common.close'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('renders a loading state while the file query is loading', () => {
    mockUseQuery.mockReturnValueOnce({ data: undefined, fetchStatus: 'loading', fetch: jest.fn() })
    render(wrap(<MetadataRoute />))
    expect(screen.queryByText('rapport.pdf')).toBeNull()
    expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toBeTruthy()
  })

  it('renders an error state when the file lookup returns no data', () => {
    mockUseQuery.mockReturnValueOnce({ data: null, fetchStatus: 'loaded', fetch: jest.fn() })
    render(wrap(<MetadataRoute />))
    expect(screen.queryByText('rapport.pdf')).toBeNull()
    expect(screen.getByText('drive.preview.loadFailed')).toBeOnTheScreen()
  })

  it('calls pin when the offline switch is toggled on', () => {
    render(wrap(<MetadataRoute />))
    const sw = screen.getByRole('switch')
    fireEvent(sw, 'valueChange', true)
    expect(mockPin).toHaveBeenCalledWith({ _id: 'f1', name: 'rapport.pdf', size: 2_400_000 })
  })
})
