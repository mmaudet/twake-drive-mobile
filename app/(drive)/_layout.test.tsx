import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

// Mock expo-router: Tabs.Screen renders its title only when visible (href !== null)
jest.mock('expo-router', () => {
  const { Text, View } = require('react-native')

  function MockTabsScreen({
    options
  }: {
    name: string
    options?: { title?: string; href?: null; tabBarIcon?: unknown }
  }) {
    if (options?.href === null || !options?.title) return null
    return <Text testID="tab-label">{options.title}</Text>
  }

  function MockTabs({ children }: { children: React.ReactNode }) {
    return <View testID="tabs-container">{children}</View>
  }
  MockTabs.Screen = MockTabsScreen

  return {
    __esModule: true,
    Tabs: MockTabs,
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({})
  }
})

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

jest.mock('@/ui/OfflineBanner', () => ({
  OfflineBanner: () => null
}))

jest.mock('@/pouchdb/useForegroundSync', () => ({
  useForegroundSync: () => undefined
}))

jest.mock('@/offline/initOffline', () => ({
  initOfflineSubsystem: jest.fn()
}))

import DriveLayout from './_layout'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('DriveLayout — bottom tabs', () => {
  it('renders exactly 5 visible tab labels', () => {
    render(wrap(<DriveLayout />))
    const tabs = screen.getAllByTestId('tab-label')
    expect(tabs).toHaveLength(5)
  })

  it('has the correct 5 tab labels in order', () => {
    render(wrap(<DriveLayout />))
    const tabs = screen.getAllByTestId('tab-label')
    const labels = tabs.map(t => t.props.children as string)
    expect(labels).toEqual([
      'drive.myDrive',
      'drive.favorites',
      'drive.recent',
      'drive.shares',
      'drive.trash'
    ])
  })
})
