import { renderHook, act } from '@testing-library/react-native'
import { useThemePreference } from './themePreference'

describe('useThemePreference', () => {
  it('defaults to system and updates via setPref', () => {
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.pref).toBe('system')
    act(() => result.current.setPref('dark'))
    expect(result.current.pref).toBe('dark')
  })
})
