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

// SettingsIndex now renders the account header via useCurrentUser (Task 4),
// which calls cozy-client's useQuery under the hood — this suite has no
// CozyClient in the render tree, so mock it locally (see task-8-brief.md).
// The identity returned is configurable per test via `mockUser` (reset in
// beforeEach below) so each test can exercise a different name/email/initials
// combination without re-mocking the module. `mockUser` must keep its "mock"
// prefix — babel-plugin-jest-hoist only allows jest.mock() factories to close
// over out-of-scope identifiers named that way.
let mockUser: { name?: string; email?: string; initials: string; loading: boolean } = {
  initials: 'MM',
  loading: false
}
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => mockUser
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

// SettingsIndex now renders a logout row (Task 9) wired to useAuth().logout.
// The real useAuth() throws when rendered outside an AuthProvider, so this
// isolated render must mock the hook directly (same pattern as
// app/(drive)/favorites.test.tsx) rather than spy on the real module.
const mockLogout = jest.fn()
jest.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ logout: mockLogout })
}))

describe('SettingsIndex', () => {
  beforeEach(() => {
    mockUser = { initials: 'MM', loading: false }
    mockLogout.mockReset()
  })

  it('offers three theme options and applies the choice', () => {
    const { getByText } = render(<SettingsIndex />)
    getByText('Système')
    getByText('Clair')
    fireEvent.press(getByText('Sombre'))
    expect(mockSetPref).toHaveBeenCalledWith('dark')
  })

  describe('account header', () => {
    it('shows the name as title and the email as description, with the avatar initials', () => {
      mockUser = { name: 'Alice B', email: 'a@b.c', initials: 'AB', loading: false }
      const { getByText } = render(<SettingsIndex />)
      expect(getByText('Alice B')).toBeTruthy()
      expect(getByText('a@b.c')).toBeTruthy()
      expect(getByText('AB')).toBeTruthy()
    })

    it('falls back to the email as title with no description when there is no name', () => {
      mockUser = { name: undefined, email: 'solo@example.com', initials: 'S', loading: false }
      const { getByText } = render(<SettingsIndex />)
      expect(getByText('solo@example.com')).toBeTruthy()
      expect(getByText('S')).toBeTruthy()
    })

    it('falls back to the translated account label when there is neither name nor email', () => {
      mockUser = { name: undefined, email: undefined, initials: 'U', loading: false }
      const { getByText } = render(<SettingsIndex />)
      expect(getByText('Compte')).toBeTruthy()
      expect(getByText('U')).toBeTruthy()
    })
  })

  it('renders the app version and a logout row that calls logout', () => {
    const { getByText } = render(<SettingsIndex />)
    fireEvent.press(getByText('Se déconnecter'))
    expect(mockLogout).toHaveBeenCalled()
  })
})
