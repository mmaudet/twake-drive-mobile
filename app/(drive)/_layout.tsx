import React from 'react'
import { Tabs } from 'expo-router'
import { useTheme } from 'react-native-paper'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { useTranslation } from 'react-i18next'

export default function DriveLayout() {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary
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
        name="trash"
        options={{
          title: t('drive.trash'),
          tabBarIcon: ({ color, size }) => (
            <Icon name="trash-can-outline" color={color} size={size} />
          )
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
    </Tabs>
  )
}
