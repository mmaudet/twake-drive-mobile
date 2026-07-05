import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { SUPPORTED_LANGUAGES } from '@/i18n/languages'
import { useLanguagePreference } from '@/i18n/languagePreference'

export default function SettingsIndex() {
  const { t } = useTranslation()
  const router = useRouter()
  const { preference, resolvedLanguage } = useLanguagePreference()
  const currentLanguageLabel =
    preference === 'system'
      ? t('settings.languageSystem')
      : (SUPPORTED_LANGUAGES.find(l => l.code === resolvedLanguage)?.label ?? '')
  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={t('settings.language')}
          description={currentLanguageLabel}
          left={p => <List.Icon {...p} icon="translate" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/(drive)/settings/language')}
          testID="settings-language"
        />
        <List.Item
          title={t('drive.offline.storageTitle')}
          left={p => <List.Icon {...p} icon="cloud-download-outline" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/(drive)/settings/offline-storage')}
        />
      </ScrollView>
    </ScreenContainer>
  )
}
