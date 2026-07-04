import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack })
}))

jest.mock('cozy-client', () => ({
  useClient: () => ({})
}))

// Isolate the screen from the debounce timing (tested separately).
jest.mock('@/search/useDebouncedValue', () => ({
  useDebouncedValue: (v: string) => v
}))

// The server-side search hook is stubbed so this test targets the screen's
// state → UI mapping, not the network.
const mockUseFileSearch = jest.fn()
jest.mock('@/search/useFileSearch', () => ({
  useFileSearch: (...args: unknown[]) => mockUseFileSearch(...args)
}))

const mockOpen = jest.fn().mockResolvedValue(undefined)
jest.mock('@/files/openFromList', () => ({
  openFileFromList: (...args: unknown[]) => mockOpen(...args)
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))

// Screen only pulls the FileQueryResult TYPE from here — stub to avoid loading
// the real query module (which reaches for the cozy-client Q() builder).
jest.mock('@/client/queries', () => ({}))

// Render rows as minimal pressable text so assertions target the screen's logic.
jest.mock('@/ui/FileRow', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    FileRow: (props: { file: { name: string }; onPress: (f: { name: string }) => void }) =>
      React.createElement(Text, { onPress: () => props.onPress(props.file) }, props.file.name)
  }
})
jest.mock('@/ui/FolderRow', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    FolderRow: (props: {
      folder: { name: string; _id: string }
      onPress: (f: { _id: string }) => void
    }) =>
      React.createElement(Text, { onPress: () => props.onPress(props.folder) }, props.folder.name)
  }
})

import SearchScreen from './search'

const setSearch = (over: Record<string, unknown> = {}): void => {
  mockUseFileSearch.mockReturnValue({
    status: 'idle',
    data: [],
    error: null,
    reload: jest.fn(),
    ...over
  })
}

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setSearch()
  })

  it("affiche l'invite tant que < 2 caractères", () => {
    render(<SearchScreen />)
    expect(screen.getByText('drive.search.hint')).toBeTruthy()
    // recherche désactivée : 2e argument (enabled) = false
    expect(mockUseFileSearch.mock.calls[0][1]).toBe(false)
  })

  it('expose le testID du champ de recherche pour Maestro', () => {
    render(<SearchScreen />)
    expect(screen.getByTestId('search-input')).toBeTruthy()
  })

  it('active la recherche et affiche les résultats à partir de 2 caractères', () => {
    setSearch({
      status: 'success',
      data: [{ _id: 'f1', name: 'report.pdf', type: 'file', size: 10 }]
    })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.getByText('report.pdf')).toBeTruthy()
    expect(mockUseFileSearch.mock.calls.at(-1)?.[1]).toBe(true)
  })

  it('ouvre un fichier au tap', () => {
    setSearch({
      status: 'success',
      data: [{ _id: 'f1', name: 'report.pdf', type: 'file', size: 10 }]
    })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    fireEvent.press(screen.getByText('report.pdf'))
    expect(mockOpen).toHaveBeenCalled()
  })

  it('navigue dans un dossier au tap', () => {
    setSearch({ status: 'success', data: [{ _id: 'd1', name: 'Docs', type: 'directory' }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 'do')
    fireEvent.press(screen.getByText('Docs'))
    expect(mockPush).toHaveBeenCalledWith('/(drive)/files/d1')
  })

  it("n'affiche PAS l'état vide pendant 'loading'", () => {
    setSearch({ status: 'loading', data: [] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.queryByText('drive.search.empty')).toBeNull()
  })

  it("n'affiche pas l'état vide en cas d'erreur", () => {
    setSearch({ status: 'error', error: new Error('boom') })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.queryByText('drive.search.empty')).toBeNull()
  })

  it("affiche l'état vide seulement quand la recherche a abouti sans résultat", () => {
    setSearch({ status: 'success', data: [] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.getByText('drive.search.empty')).toBeTruthy()
  })
})
