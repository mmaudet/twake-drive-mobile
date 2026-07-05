import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import i18n from '@/i18n'
import LanguageScreen from './language'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))

// ScreenContainer reads safe-area insets; mirrors the same fix already used in
// app/search.test.tsx for the same reason (no <SafeAreaProvider> in this tree).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

describe('LanguageScreen', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('lists a System row plus one row per bundled locale, and switches on tap', () => {
    const changeSpy = jest.spyOn(i18n, 'changeLanguage')
    const { getByText } = render(<LanguageScreen />)
    getByText('Français')
    getByText('English')
    fireEvent.press(getByText('English'))
    // changeLanguage is deferred to the next tick (after the back navigation).
    jest.runOnlyPendingTimers()
    expect(changeSpy).toHaveBeenCalledWith('en')
  })
})
