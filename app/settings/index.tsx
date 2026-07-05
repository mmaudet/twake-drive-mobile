import React from 'react'
import { ScrollView } from 'react-native'
import { List } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'

export default function SettingsIndex(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item
          title={t('drive.offline.storageTitle')}
          left={p => <List.Icon {...p} icon="cloud-download-outline" />}
          right={p => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/settings/offline-storage')}
        />
      </ScrollView>
    </ScreenContainer>
  )
}
