import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
// Side-effect import: `@/i18n` calls i18next.init() at module load. Production
// gets this for free from the root layout; this isolated render does not, so
// without it every t() call below renders its raw key instead of copy.
import '@/i18n'
import SettingsIndex from './index'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

// ScreenContainer reads safe-area insets; mirrors the same fix already used in
// app/settings/language.test.tsx (no <SafeAreaProvider> in this tree).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

// useThemePreference is exercised elsewhere against the real MMKV-backed store
// (src/preferences/themePreference.ts has its own coverage). Stubbing it here
// isolates SettingsIndex's wiring: pressing a row must call setPref with the
// row's key. `jest.spyOn` on the real module's `setThemePreference` export does
// NOT work for this — the hook hands out a direct reference to the function
// captured at module-load time, so a spy on the export is never invoked; only
// mocking the hook itself observes the call.
const mockSetPref = jest.fn()
jest.mock('@/preferences/themePreference', () => ({
  useThemePreference: () => ({ pref: 'system', setPref: mockSetPref })
}))

describe('SettingsIndex', () => {
  it('offers three theme options and applies the choice', () => {
    const { getByText } = render(<SettingsIndex />)
    getByText('Système')
    getByText('Clair')
    fireEvent.press(getByText('Sombre'))
    expect(mockSetPref).toHaveBeenCalledWith('dark')
  })
})
