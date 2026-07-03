import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack })
}))

const mockUseQuery = jest.fn()
jest.mock('cozy-client', () => ({
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args)
}))

// Isolate the screen from the debounce timing (tested in Task 2).
jest.mock('@/search/useDebouncedValue', () => ({
  useDebouncedValue: (v: string) => v
}))

const mockOpen = jest.fn().mockResolvedValue(undefined)
jest.mock('@/files/openFromList', () => ({
  openFileFromList: (...args: unknown[]) => mockOpen(...args)
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

// Query internals are covered in Task 3 — stub them so this test never touches
// the real cozy-client Q() builder (which would be undefined under the mock above).
jest.mock('@/client/queries', () => ({
  searchFilesQuery: (term: string) => ({ term }),
  searchFilesQueryAs: (term: string) => `as:${term}`
}))

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

const setQuery = (over: Record<string, unknown> = {}): void => {
  mockUseQuery.mockReturnValue({
    data: [],
    fetchStatus: 'idle',
    lastError: null,
    fetch: jest.fn(),
    ...over
  })
}

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setQuery()
  })

  it("affiche l'invite tant que < 2 caractères", () => {
    render(<SearchScreen />)
    expect(screen.getByText('drive.search.hint')).toBeTruthy()
    // requête désactivée
    expect(mockUseQuery.mock.calls[0][1]).toMatchObject({ enabled: false })
  })

  it('active la requête et affiche les résultats à partir de 2 caractères', () => {
    setQuery({ data: [{ _id: 'f1', name: 'report.pdf', type: 'file', size: 10 }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.getByText('report.pdf')).toBeTruthy()
  })

  it('ouvre un fichier au tap', () => {
    setQuery({ data: [{ _id: 'f1', name: 'report.pdf', type: 'file', size: 10 }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    fireEvent.press(screen.getByText('report.pdf'))
    expect(mockOpen).toHaveBeenCalled()
  })

  it('navigue dans un dossier au tap', () => {
    setQuery({ data: [{ _id: 'd1', name: 'Docs', type: 'directory' }] })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 'do')
    fireEvent.press(screen.getByText('Docs'))
    expect(mockPush).toHaveBeenCalledWith('/(drive)/files/d1')
  })

  // cozy-client returns fetchStatus 'pending' (NOT 'loading') on the first render
  // of a brand-new query key — the fetch fires in a useEffect, after paint. The
  // empty state must NOT flash before results/spinner.
  it("n'affiche PAS l'état vide tant que la requête est 'pending'", () => {
    setQuery({ data: [], fetchStatus: 'pending' })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.queryByText('drive.search.empty')).toBeNull()
  })

  it("n'affiche PAS l'état vide pendant 'loading'", () => {
    setQuery({ data: [], fetchStatus: 'loading' })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.queryByText('drive.search.empty')).toBeNull()
  })

  it("affiche l'état vide seulement quand la requête a abouti sans résultat", () => {
    setQuery({ data: [], fetchStatus: 'success' })
    render(<SearchScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('drive.search.placeholder'), 're')
    expect(screen.getByText('drive.search.empty')).toBeTruthy()
  })
})
