import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { localeDisplayName } from '@/i18n/localeNames'
import {
  LOCALE_SYSTEM,
  getLocalePreference,
  setLocalePreference,
  resolveLanguage
} from '@/preferences/localePreference'
import { getLocales } from 'expo-localization'

export default function LanguageScreen(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  const current = getLocalePreference()
  const available = Object.keys(i18n.options.resources ?? {})

  const choose = (pref: string): void => {
    setLocalePreference(pref)
    const device = getLocales()[0]?.languageCode ?? undefined
    const resolved = resolveLanguage(pref, device, available)
    // Navigate back FIRST, then switch the language on the next tick.
    // i18n.changeLanguage() synchronously re-renders every useTranslation consumer
    // (including the navigators' screen titles); doing that before/around
    // router.back() corrupts the in-flight pop and ejects the user out to the OS
    // launcher. Deferring the language change until after the back navigation
    // avoids that race — the (already-active) settings screen simply re-renders in
    // the new language.
    router.back()
    setTimeout(() => {
      void i18n.changeLanguage(resolved)
    }, 0)
  }

  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={t('settings.systemLanguage')}
          onPress={() => choose(LOCALE_SYSTEM)}
          right={p => (current === LOCALE_SYSTEM ? <List.Icon {...p} icon="check" /> : null)}
        />
        {available.map(code => (
          <List.Item
            key={code}
            title={localeDisplayName(code)}
            onPress={() => choose(code)}
            right={p => (current === code ? <List.Icon {...p} icon="check" /> : null)}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  )
}
