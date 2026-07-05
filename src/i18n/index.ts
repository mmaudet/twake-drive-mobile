import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import { getLocalePreference, resolveLanguage } from '@/preferences/localePreference'

import en from './locales/en.json'
import fr from './locales/fr.json'

const resources = {
  en: { translation: en },
  fr: { translation: fr }
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
