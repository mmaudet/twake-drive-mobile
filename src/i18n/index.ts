import 'intl-pluralrules'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import de from './locales/de.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'
import { DEFAULT_LANGUAGE } from './languages'
import { getStoredPreference, resolveLanguage } from './languagePreference'

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  de: { translation: de },
  vi: { translation: vi },
  ru: { translation: ru }
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getStoredPreference()),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }
})

export default i18n
