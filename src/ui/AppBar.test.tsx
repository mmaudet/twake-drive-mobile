import React from 'react'
import { render } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

// SyncIndicator (rendered by AppBar) uses cozy-client and the pouch link.
// Return null-safe stubs so the component silently renders nothing for sync.
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  getPouchLink: () => null
}))

import { AppBar } from './AppBar'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

test('AppBar affiche le TwakeLogo à côté du titre', () => {
  const { getByText, UNSAFE_getByType } = render(wrap(<AppBar title="Mes fichiers" />))
  expect(getByText('Mes fichiers')).toBeTruthy()
  // TwakeLogo renders an Svg root; verify it is present in the tree.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Svg = require('react-native-svg').default
  expect(UNSAFE_getByType(Svg)).toBeTruthy()
})
