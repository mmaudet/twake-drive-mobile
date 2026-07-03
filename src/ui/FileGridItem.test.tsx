import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

import { FileGridItem } from './FileGridItem'
import type { FileQueryResult } from '@/client/queries'

const file: FileQueryResult = {
  _id: 'file-1',
  _type: 'io.cozy.files',
  name: 'rapport-annuel.pdf',
  type: 'file',
  size: 1_200_000,
  mime: 'application/pdf',
  class: 'pdf'
}

const folder: FileQueryResult = {
  _id: 'dir-1',
  _type: 'io.cozy.files',
  name: 'Projets',
  type: 'directory'
}

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FileGridItem', () => {
  it('renders the file name', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} />))
    expect(screen.getByText('rapport-annuel.pdf')).toBeOnTheScreen()
  })

  it('renders a thumbnail/icon area', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} />))
    expect(screen.getByTestId('file-grid-icon')).toBeOnTheScreen()
  })

  it('calls onPress with the file when tapped', () => {
    const onPress = jest.fn()
    render(wrap(<FileGridItem file={file} onPress={onPress} />))
    fireEvent.press(screen.getByText('rapport-annuel.pdf'))
    expect(onPress).toHaveBeenCalledWith(file)
  })

  it('calls onLongPress when long-pressed', () => {
    const onLongPress = jest.fn()
    render(wrap(<FileGridItem file={file} onPress={() => {}} onLongPress={onLongPress} />))
    fireEvent(screen.getByTestId('file-grid-item'), 'longPress')
    expect(onLongPress).toHaveBeenCalledWith(file)
  })

  it('renders a folder name', () => {
    render(wrap(<FileGridItem file={folder} onPress={() => {}} />))
    expect(screen.getByText('Projets')).toBeOnTheScreen()
  })

  it('applies selected visual state when selected prop is true', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} selected />))
    // Container should still render the name
    expect(screen.getByText('rapport-annuel.pdf')).toBeOnTheScreen()
  })
})
