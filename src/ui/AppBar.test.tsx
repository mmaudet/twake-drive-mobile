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

import { AppBar } from './AppBar'

const wrap = (ui: React.ReactElement) => (
  <PaperProvider>
    <SafeAreaProvider>{ui}</SafeAreaProvider>
  </PaperProvider>
)

describe('AppBar onSearch', () => {
  it('rend une action loupe qui déclenche onSearch', () => {
    const onSearch = jest.fn()
    render(wrap(<AppBar title="Mes fichiers" onSearch={onSearch} />))
    fireEvent.press(screen.getByLabelText('drive.search.action'))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('ne rend pas la loupe sans onSearch', () => {
    render(wrap(<AppBar title="Mes fichiers" />))
    expect(screen.queryByLabelText('drive.search.action')).toBeNull()
  })

  it('masque la loupe en mode sélection', () => {
    const onSearch = jest.fn()
    render(
      wrap(
        <AppBar
          title="Mes fichiers"
          onSearch={onSearch}
          selection={{ count: 1, onCancel: jest.fn(), actions: [] }}
        />
      )
    )
    expect(screen.queryByLabelText('drive.search.action')).toBeNull()
  })
})
