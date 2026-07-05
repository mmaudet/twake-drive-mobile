import React, { useEffect } from 'react'
import { Tabs } from 'expo-router'
import { useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { OfflineBanner } from '@/ui/OfflineBanner'
import { useForegroundSync } from '@/pouchdb/useForegroundSync'
import { initOfflineSubsystem } from '@/offline/initOffline'

export default function DriveLayout() {
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  useForegroundSync()
  useEffect(() => {
    if (!client) return
    void initOfflineSubsystem(client)
  }, [client])
  return (
    <>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          sceneStyle: { backgroundColor: theme.colors.background }
        }}
      >
        <Tabs.Screen
          name="files"
          options={{
            title: t('drive.myDrive'),
            tabBarIcon: ({ color, size }) => <CozyIcon name="cloud2" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: t('drive.favorites'),
            tabBarIcon: ({ color, size }) => <CozyIcon name="star" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="recent"
          options={{
            title: t('drive.recent'),
            tabBarIcon: ({ color, size }) => (
              <CozyIcon name="clockOutline" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: t('drive.shares'),
            tabBarIcon: ({ color, size }) => (
              <CozyIcon name="shareExternal" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="trash"
          options={{
            title: t('drive.trash'),
            tabBarIcon: ({ color, size }) => <CozyIcon name="trash" color={color} size={size} />
          }}
        />
        <Tabs.Screen name="shareddrives" options={{ href: null }} />
        <Tabs.Screen name="search" options={{ href: null }} />
      </Tabs>
    </>
  )
}
