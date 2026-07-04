import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({})
}))

jest.mock('@/offline/useOfflineState', () => ({
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

jest.mock('@/files/favorites', () => ({
  isFavorite: jest.fn().mockReturnValue(false),
  toggleFavorite: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { isFavorite, toggleFavorite } from '@/files/favorites'
import { FolderRow, FolderItem } from './FolderRow'

const folder: FolderItem = { _id: 'd1', name: 'Documents' }

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FolderRow', () => {
  it('renders the folder name', () => {
    render(wrap(<FolderRow folder={folder} onPress={() => {}} />))
    expect(screen.getByText('Documents')).toBeOnTheScreen()
  })

  it('calls onPress with the folder', () => {
    const onPress = jest.fn()
    render(wrap(<FolderRow folder={folder} onPress={onPress} />))
    fireEvent.press(screen.getByText('Documents'))
    expect(onPress).toHaveBeenCalledWith(folder)
  })

  it('renders a 3-dot menu trigger when onTogglePin is provided', () => {
    render(wrap(<FolderRow folder={folder} onPress={jest.fn()} onTogglePin={jest.fn()} />))
    expect(screen.getByLabelText('folder actions')).toBeOnTheScreen()
  })

  it('exposes testIDs for Maestro selection', () => {
    render(
      wrap(
        <FolderRow folder={folder} onPress={() => {}} onTogglePin={jest.fn()} testID="folder-row" />
      )
    )
    expect(screen.getByTestId('folder-row')).toBeOnTheScreen()
    expect(screen.getByTestId('folder-actions')).toBeOnTheScreen()
  })

  it('renders a Move… menu item when onMove is provided', () => {
    render(wrap(<FolderRow folder={folder} onPress={() => {}} onMove={jest.fn()} />))
    expect(screen.getByLabelText('folder actions')).toBeOnTheScreen()
  })

  it('calls onMove when the menu item is tapped', () => {
    const onMove = jest.fn()
    render(wrap(<FolderRow folder={folder} onPress={() => {}} onMove={onMove} />))
    fireEvent.press(screen.getByLabelText('folder actions'))
    fireEvent.press(screen.getByText('drive.fileMeta.move'))
    expect(onMove).toHaveBeenCalledWith(folder)
  })

  describe('favorite menu item', () => {
    it('shows "Add to favorites" label when folder is not a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FolderRow folder={folder} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByLabelText('folder actions'))
      expect(screen.getByText('drive.fileMeta.favorite')).toBeOnTheScreen()
    })

    it('shows "Remove from favorites" label when folder is a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(true)
      render(wrap(<FolderRow folder={folder} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByLabelText('folder actions'))
      expect(screen.getByText('drive.fileMeta.unfavorite')).toBeOnTheScreen()
    })

    it('calls toggleFavorite when the favorite menu item is tapped', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FolderRow folder={folder} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByLabelText('folder actions'))
      fireEvent.press(screen.getByText('drive.fileMeta.favorite'))
      expect(toggleFavorite).toHaveBeenCalledWith(expect.anything(), folder, true)
    })

    it('calls toggleFavorite with next=false when folder is already a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(true)
      render(wrap(<FolderRow folder={folder} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByLabelText('folder actions'))
      fireEvent.press(screen.getByText('drive.fileMeta.unfavorite'))
      expect(toggleFavorite).toHaveBeenCalledWith(expect.anything(), folder, false)
    })
  })
})
