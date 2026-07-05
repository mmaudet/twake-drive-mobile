import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockBack = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ fileId: 'f1' })
}))

const pdfFile = {
  _id: 'f1',
  name: 'demande.pdf',
  type: 'file',
  mime: 'application/pdf',
  links: { self: '/files/f1' }
}

// Drives which preview kind the screen renders. Flipped per test.
let mockKind = 'pdf'

jest.mock('@/files/streamUrl', () => ({
  __esModule: true,
  getPreviewKind: () => mockKind,
  buildFileStreamSource: () => ({ uri: 'https://example.test/f1', headers: {} }),
  buildThumbnailUrl: () => null
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: () => ({ data: pdfFile, fetchStatus: 'loaded' })
}))

jest.mock('@/client/queries', () => ({
  __esModule: true,
  fileByIdQuery: () => ({}),
  fileByIdQueryAs: () => undefined
}))

// Native / heavy modules imported at load time — stub so the file resolves.
jest.mock('react-native-pdf', () => {
  const react = require('react')
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => react.createElement('Pdf', props)
  }
})
jest.mock('expo-image', () => {
  const react = require('react')
  return {
    __esModule: true,
    Image: (props: Record<string, unknown>) => react.createElement('Image', props)
  }
})
jest.mock('expo-audio', () => ({
  __esModule: true,
  AudioModule: { setAudioModeAsync: jest.fn() },
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  useAudioPlayerStatus: () => ({ isLoaded: false })
}))
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  copyAsync: jest.fn()
}))
jest.mock('@/files/openFile', () => ({ openFileNatively: jest.fn() }))
jest.mock('@/files/audioSupport', () => ({ isUnsupportedAudio: () => false }))
jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: { isPinnedAndDownloaded: () => false }
}))
jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath: (id: string) => `file://${id}` }
}))
jest.mock('@/offline/useOfflineState', () => ({ useOfflineState: () => undefined }))
jest.mock('@/preview/VideoPreview', () => {
  const react = require('react')
  return { __esModule: true, VideoPreview: () => react.createElement('VideoPreview') }
})
jest.mock('@/ui/ZoomableImage', () => {
  const react = require('react')
  return { __esModule: true, ZoomableImage: () => react.createElement('ZoomableImage') }
})
jest.mock('@/ui/AppBar', () => {
  const react = require('react')
  return {
    __esModule: true,
    AppBar: (props: Record<string, unknown>) => react.createElement('AppBar', props)
  }
})
jest.mock('@/ui/icons/CozyIcon', () => {
  const react = require('react')
  return {
    __esModule: true,
    CozyIcon: (props: Record<string, unknown>) => react.createElement('CozyIcon', props)
  }
})

import PreviewScreen from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('PreviewScreen', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockKind = 'pdf'
  })

  it('renders a close button on a chromeless PDF preview and goes back when tapped', () => {
    render(wrap(<PreviewScreen />))
    const closeBtn = screen.getByTestId('preview-close-button')
    fireEvent.press(closeBtn)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('also exposes the close button on image previews', () => {
    mockKind = 'image'
    render(wrap(<PreviewScreen />))
    expect(screen.getByTestId('preview-close-button')).toBeOnTheScreen()
  })
})
