import React from 'react'
import { ScrollView } from 'react-native'
import { Avatar, List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { useCurrentUser } from '@/account/useCurrentUser'
import { getLocalePreference, LOCALE_SYSTEM } from '@/preferences/localePreference'
import { localeDisplayName } from '@/i18n/localeNames'
import { useThemePreference, ThemePref } from '@/preferences/themePreference'
import { useAuth } from '@/auth/useAuth'

export default function SettingsIndex(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  const { name, email, initials } = useCurrentUser()
  const { logout } = useAuth()
  const localePref = getLocalePreference()
  const languageValue =
    localePref === LOCALE_SYSTEM ? t('settings.systemLanguage') : localeDisplayName(localePref)
  const { pref: themePref, setPref: setThemePref } = useThemePreference()
  const themeOptions: { key: ThemePref; label: string }[] = [
    { key: 'system', label: t('settings.themeSystem') },
    { key: 'light', label: t('settings.themeLight') },
    { key: 'dark', label: t('settings.themeDark') }
  ]
  const version = Constants.expoConfig?.version ?? ''
  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={name ?? email ?? t('settings.account')}
          description={name ? email : undefined}
          left={() => <Avatar.Text size={40} label={initials} />}
        />
        <List.Item
          title={t('settings.language')}
          description={languageValue}
          left={p => <List.Icon {...p} icon="translate" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/settings/language')}
        />
        <List.Item
          title={t('drive.offline.storageTitle')}
          left={p => <List.Icon {...p} icon="cloud-download-outline" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/settings/offline-storage')}
        />
        <List.Subheader>{t('settings.theme')}</List.Subheader>
        {themeOptions.map(o => (
          <List.Item
            key={o.key}
            title={o.label}
            onPress={() => setThemePref(o.key)}
            right={p => (themePref === o.key ? <List.Icon {...p} icon="check" /> : null)}
          />
        ))}
        <List.Subheader>{t('settings.about')}</List.Subheader>
        <List.Item title={t('settings.version')} description={version} />
        <List.Item
          title={t('common.logout')}
          left={p => <List.Icon {...p} icon="logout" />}
          onPress={() => void logout()}
        />
      </ScrollView>
    </ScreenContainer>
  )
}
