import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

// SyncIndicator uses cozy-client / pouchdb — stub them out
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))
jest.mock('@/pouchdb/triggerReplication', () => ({
  getPouchLink: () => null
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush })
}))

import { AppBar } from './AppBar'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

beforeEach(() => {
  mockPush.mockClear()
})

test('tapping the avatar opens the menu and the 3 items are present', () => {
  const onLogout = jest.fn()
  render(wrap(<AppBar title="Mes fichiers" onLogout={onLogout} />))

  // Tap the avatar (Avatar.Text renders label "MM" as text)
  fireEvent.press(screen.getByText('MM'))

  // All 3 menu items must be present (i18n returns key in test env)
  expect(screen.getByText('settings.title')).toBeOnTheScreen()
  expect(screen.getByText('drive.sharedDrives')).toBeOnTheScreen()
  expect(screen.getByText('common.logout')).toBeOnTheScreen()
})

test('help button is present when showSearch is true', () => {
  const onLogout = jest.fn()
  render(wrap(<AppBar title="Mes fichiers" onLogout={onLogout} showSearch={true} />))

  // Help button should be present (testID for the help button)
  const helpButton = screen.getByTestId('appbar-help-button')
  expect(helpButton).toBeOnTheScreen()
})
