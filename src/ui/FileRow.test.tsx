import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

jest.mock('@/offline/useOfflineState', () => ({
  useOfflineState: jest.fn().mockReturnValue(undefined)
}))

jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => true
}))

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
    expect(screen.getByLabelText('file actions')).toBeOnTheScreen()
  })
})
