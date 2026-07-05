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
    void i18n.changeLanguage(resolveLanguage(pref, device, available))
    router.back()
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
