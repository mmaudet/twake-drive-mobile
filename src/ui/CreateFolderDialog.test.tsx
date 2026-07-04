import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

import { CreateFolderDialog } from './CreateFolderDialog'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('CreateFolderDialog', () => {
  it('expose les testIDs du champ et du bouton pour Maestro', () => {
    render(wrap(<CreateFolderDialog visible onDismiss={jest.fn()} onSubmit={jest.fn()} />))
    expect(screen.getByTestId('create-folder-name-input')).toBeOnTheScreen()
    expect(screen.getByTestId('create-folder-submit')).toBeOnTheScreen()
  })
})
