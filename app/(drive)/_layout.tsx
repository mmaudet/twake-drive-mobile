import React, { useEffect } from 'react'
import { Tabs } from 'expo-router'
import { useTheme } from 'react-native-paper'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

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
            title: t('drive.myFiles'),
            tabBarIcon: ({ color, size }) => <Icon name="folder" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: t('drive.shared'),
            tabBarIcon: ({ color, size }) => (
              <Icon name="account-multiple" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="recent"
          options={{
            title: t('drive.recent'),
            tabBarIcon: ({ color, size }) => <Icon name="clock-outline" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="shareddrives"
          options={{
            title: t('drive.sharedDrives'),
            tabBarIcon: ({ color, size }) => (
              <Icon name="folder-multiple-outline" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="trash"
          options={{
            title: t('drive.trash'),
            tabBarIcon: ({ color, size }) => (
              <Icon name="trash-can-outline" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('settings.title'),
            tabBarIcon: ({ color, size }) => <Icon name="cog-outline" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="onlyoffice/[fileId]"
          options={{
            href: null
          }}
        />
        <Tabs.Screen
          name="note/[fileId]"
          options={{
            href: null
          }}
        />
        <Tabs.Screen
          name="docs/[fileId]"
          options={{
            href: null
          }}
        />
        <Tabs.Screen
          name="docs/new/[folderId]"
          options={{
            href: null
          }}
        />
      </Tabs>
    </>
  )
}
