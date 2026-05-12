import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function SettingsIndex() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <ScrollView>
      <List.Item
        title={t('drive.offline.storageTitle')}
        left={p => <List.Icon {...p} icon="cloud-download-outline" />}
        right={p => <List.Icon {...p} icon="chevron-right" />}
        onPress={() => router.push('/(drive)/settings/offline-storage')}
      />
    </ScrollView>
  )
}
