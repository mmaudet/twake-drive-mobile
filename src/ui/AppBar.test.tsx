import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))
jest.mock('./SyncIndicator', () => ({
  SyncIndicator: () => null
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() })
}))

import { AppBar } from './AppBar'

const wrap = (ui: React.ReactElement) => (
  <PaperProvider>
    <SafeAreaProvider>{ui}</SafeAreaProvider>
  </PaperProvider>
)

describe('AppBar showSearch', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('rend la loupe showSearch qui navigue vers /search', () => {
    render(wrap(<AppBar title="Mes fichiers" showSearch />))
    fireEvent.press(screen.getByLabelText('drive.search'))
    expect(mockPush).toHaveBeenCalledWith('/search')
  })

  it('ne rend pas la loupe showSearch sans la prop', () => {
    render(wrap(<AppBar title="Mes fichiers" />))
    expect(screen.queryByLabelText('drive.search')).toBeNull()
  })

  it('expose les testIDs de navigation Maestro', () => {
    render(wrap(<AppBar title="Mes fichiers" showSearch onBack={() => {}} />))
    expect(screen.getByTestId('appbar-search-button')).toBeOnTheScreen()
    expect(screen.getByTestId('appbar-back-button')).toBeOnTheScreen()
  })
})

test('AppBar affiche le TwakeLogo à côté du titre', () => {
  const { getByText, UNSAFE_getByType } = render(wrap(<AppBar title="Mes fichiers" />))
  expect(getByText('Mes fichiers')).toBeTruthy()
  // TwakeLogo renders an Svg root; verify it is present in the tree.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Svg = require('react-native-svg').default
  expect(UNSAFE_getByType(Svg)).toBeTruthy()
})
