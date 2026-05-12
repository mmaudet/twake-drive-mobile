import React from 'react'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function SettingsLayout() {
  const { t } = useTranslation()
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen
        name="offline-storage"
        options={{ title: t('drive.offline.storageTitle') }}
      />
    </Stack>
  )
}
