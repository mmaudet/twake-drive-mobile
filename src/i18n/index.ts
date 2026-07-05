// On-device/Hermes insurance: guarantees Intl.PluralRules (esp. ru). Not covered by index.test (Node ships full ICU).
import 'intl-pluralrules'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import { getLocalePreference, resolveLanguage } from '@/preferences/localePreference'

import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import de from './locales/de.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  de: { translation: de },
  vi: { translation: vi },
  ru: { translation: ru }
}

const deviceLocale = getLocales()[0]?.languageCode ?? undefined
const lng = resolveLanguage(getLocalePreference(), deviceLocale, Object.keys(resources))

i18n.use(initReactI18next).init({
  resources,
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
