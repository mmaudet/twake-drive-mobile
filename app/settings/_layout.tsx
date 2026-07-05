import React from 'react'
import { Stack, useRouter } from 'expo-router'
import { Appbar } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

export default function SettingsLayout(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('settings.title'),
          headerLeft: () => (
            <Appbar.Action
              icon="close"
              onPress={() => router.back()}
              accessibilityLabel={t('common.close')}
            />
          )
        }}
      />
      <Stack.Screen name="offline-storage" options={{ title: t('drive.offline.storageTitle') }} />
      <Stack.Screen name="language" options={{ title: t('settings.language') }} />
    </Stack>
  )
}
