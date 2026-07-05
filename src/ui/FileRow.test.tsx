import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({ getStackClient: () => ({ uri: undefined }), links: [] })
}))

jest.mock('@/offline/useOfflineState', () => ({
  useOfflineState: jest.fn().mockReturnValue(undefined)
}))

jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => true
}))

jest.mock('@/files/favorites', () => ({
  isFavorite: jest.fn().mockReturnValue(false),
  toggleFavorite: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/files/download', () => ({
  download: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { isFavorite, toggleFavorite } from '@/files/favorites'
import { download } from '@/files/download'
import { FileRow, FileItem } from './FileRow'

const file: FileItem = {
  _id: 'f1',
  name: 'rapport.pdf',
  size: 2_400_000,
  mime: 'application/pdf',
  updated_at: '2026-04-29T10:00:00.000Z'
}

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FileRow', () => {
  it('renders the file name', () => {
    render(wrap(<FileRow file={file} onPress={() => {}} />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })

  it('calls onPress with the file when tapped', () => {
    const onPress = jest.fn()
    render(wrap(<FileRow file={file} onPress={onPress} />))
    fireEvent.press(screen.getByText('rapport.pdf'))
    expect(onPress).toHaveBeenCalledWith(file)
  })

  it('renders a 3-dot menu trigger when onTogglePin is provided', () => {
    render(wrap(<FileRow file={file} onPress={jest.fn()} onTogglePin={jest.fn()} />))
    expect(screen.getByTestId('file-actions')).toBeOnTheScreen()
  })

  it('exposes testIDs for Maestro selection', () => {
    render(
      wrap(<FileRow file={file} onPress={() => {}} onTogglePin={jest.fn()} testID="file-row" />)
    )
    expect(screen.getByTestId('file-row')).toBeOnTheScreen()
    expect(screen.getByTestId('file-actions')).toBeOnTheScreen()
  })

  it('renders a Move… menu item when onMove is provided', () => {
    render(wrap(<FileRow file={file} onPress={() => {}} onMove={jest.fn()} />))
    expect(screen.getByTestId('file-actions')).toBeOnTheScreen()
  })

  it('calls onMove when the menu item is tapped', () => {
    const onMove = jest.fn()
    render(wrap(<FileRow file={file} onPress={() => {}} onMove={onMove} />))
    fireEvent.press(screen.getByTestId('file-actions'))
    fireEvent.press(screen.getByText('drive.fileMeta.move'))
    expect(onMove).toHaveBeenCalledWith(file)
  })

  describe('favorite menu item', () => {
    it('shows "Add to favorites" label when file is not a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId('file-actions'))
      expect(screen.getByText('drive.fileMeta.favorite')).toBeOnTheScreen()
    })

    it('shows "Remove from favorites" label when file is a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(true)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId('file-actions'))
      expect(screen.getByText('drive.fileMeta.unfavorite')).toBeOnTheScreen()
    })

    it('calls toggleFavorite when the favorite menu item is tapped', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId('file-actions'))
      fireEvent.press(screen.getByText('drive.fileMeta.favorite'))
      expect(toggleFavorite).toHaveBeenCalledWith(expect.anything(), file, true)
    })

    it('calls toggleFavorite with next=false when file is already a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(true)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId('file-actions'))
      fireEvent.press(screen.getByText('drive.fileMeta.unfavorite'))
      expect(toggleFavorite).toHaveBeenCalledWith(expect.anything(), file, false)
    })
  })

  describe('download menu item', () => {
    it('shows "Télécharger" label in the menu', () => {
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId('file-actions'))
      expect(screen.getByText('drive.fileMeta.download')).toBeOnTheScreen()
    })

    it('calls download when the download menu item is tapped', () => {
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId('file-actions'))
      fireEvent.press(screen.getByText('drive.fileMeta.download'))
      expect(download).toHaveBeenCalledWith(expect.anything(), file)
    })
  })
})
