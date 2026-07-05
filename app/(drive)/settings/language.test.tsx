import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import { setLanguagePreference } from '@/i18n/languagePreference'
import LanguageSettings from './language'

const renderScreen = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <PaperProvider>
        <LanguageSettings />
      </PaperProvider>
    </I18nextProvider>
  )

describe('language switcher', () => {
  // Reset to device default (fr). The still-mounted screen from the test we're
  // cleaning up after re-renders synchronously off this call (useSyncExternalStore
  // + react-i18next's languageChanged listener), so it must run inside act() —
  // RNTL's own auto-cleanup-on-unmount afterEach is registered at the root scope
  // and therefore runs *after* this describe-scoped one.
  afterEach(() => act(() => setLanguagePreference('system')))

  it('lists System + all seven languages', () => {
    renderScreen()
    expect(screen.getByTestId('lang-system')).toBeOnTheScreen()
    for (const code of ['en', 'fr', 'es', 'it', 'de', 'vi', 'ru']) {
      expect(screen.getByTestId(`lang-${code}`)).toBeOnTheScreen()
    }
  })

  it('switches the app language when a language is picked', async () => {
    renderScreen()
    fireEvent.press(screen.getByTestId('lang-ru'))
    await waitFor(() => expect(i18n.language).toBe('ru'))
  })
})
