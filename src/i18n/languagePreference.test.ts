import i18n from 'i18next'
import { renderHook, act } from '@testing-library/react-native'
import {
  getStoredPreference,
  resolveLanguage,
  setLanguagePreference,
  useLanguagePreference
} from './languagePreference'

// In-memory MMKV so the store round-trips within the file. The factory owns its
// Map (self-contained; jest.mock factories may not close over outer variables).
// NOTE: do NOT use jest.resetModules() here — resetting the registry would give
// languagePreference a *different* i18next singleton than the one imported above,
// so the changeLanguage spy would never see the call. Top-level imports share one
// singleton; shared module state is reset in afterEach instead.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>()
  return {
    createMMKV: () => ({
      getString: (k: string) => store.get(k),
      set: (k: string, v: string) => void store.set(k, v),
      remove: (k: string) => void store.delete(k)
    })
  }
})

describe('language preference store', () => {
  let changeLanguage: jest.SpyInstance
  beforeEach(() => {
    // Mock for the whole test so setLanguagePreference never touches the
    // (uninitialised) real i18next and prints init warnings.
    changeLanguage = jest.spyOn(i18n, 'changeLanguage').mockResolvedValue(undefined as never)
  })
  afterEach(() => {
    setLanguagePreference('system') // reset shared module state (uses the mock)
    changeLanguage.mockRestore()
  })

  it('defaults to "system" when nothing is stored', () => {
    expect(getStoredPreference()).toBe('system')
  })

  it('persists and reports a concrete preference', () => {
    setLanguagePreference('es')
    expect(getStoredPreference()).toBe('es')
  })

  it('writes the concrete preference through to MMKV', () => {
    const mmkv = require('react-native-mmkv').createMMKV()
    setLanguagePreference('es')
    expect(mmkv.getString('language')).toBe('es')
  })

  it('changes the i18next language on set', () => {
    setLanguagePreference('de')
    expect(changeLanguage).toHaveBeenCalledWith('de')
  })

  it('resolves "system" against the device locale (fr in tests)', () => {
    expect(resolveLanguage('system')).toBe('fr')
  })

  it('exposes preference + resolvedLanguage and reacts to setPreference', () => {
    const { result, unmount } = renderHook(() => useLanguagePreference())
    expect(result.current.preference).toBe('system')
    expect(result.current.resolvedLanguage).toBe('fr') // device locale in tests
    act(() => result.current.setPreference('es'))
    expect(result.current.preference).toBe('es')
    expect(result.current.resolvedLanguage).toBe('es')
    // Unmount before this describe's afterEach resets the store: RTL's own
    // auto-cleanup afterEach is registered at file-import time (outer scope) and
    // Jest runs afterEach inner-first, so it would otherwise fire *after* our
    // reset — leaving this subscriber mounted while the reset updates state
    // outside act().
    unmount()
  })
})
