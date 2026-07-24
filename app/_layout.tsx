import 'react-native-url-polyfill/auto'

import React, { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider } from 'react-i18next'

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold
} from '@expo-google-fonts/inter'

import i18n from '@/i18n'
import { AuthProvider, useAuth } from '@/auth/useAuth'
import { darkTheme, lightTheme } from '@/ui/theme'
import { withInterFonts } from '@/ui/fonts'
import { attachRevocationListener } from '@/auth/revocationListener'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import { AuthTransitionOverlay } from '@/ui/AuthTransitionOverlay'
import { PiPSessionProvider } from '@/preview/PiPSession'
import { SharingProvider } from '@/sharing/SharingProvider'
import { useThemePreference } from '@/preferences/themePreference'
import { AppProviderTree } from './_AppProviderTree'

const InnerLayout = () => {
  const colorScheme = useColorScheme()
  const { pref: themePref } = useThemePreference()
  const activeScheme = themePref === 'system' ? colorScheme : themePref
  const theme = activeScheme === 'dark' ? darkTheme : lightTheme
  const { client, logout, authenticating } = useAuth()
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold
  })

  useEffect(() => {
    if (!client) return
    return attachRevocationListener(client, () => {
      void logout()
    })
  }, [client, logout])

  if (!fontsLoaded) return null

  const content = (
    <SafeAreaProvider>
      {/* Render the system status bar with theme-adaptive icons (dark on the
          light UI, light in dark mode) so the time/wifi/battery stay visible —
          without this the default light icons were invisible on the white app
          background under edge-to-edge. Applies to Android and iOS. */}
      <StatusBar style="auto" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider theme={withInterFonts(theme)}>
          <I18nextProvider i18n={i18n}>
            <PiPSessionProvider>
              <SharingProvider>
                <ErrorBoundary>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(drive)" />
                    <Stack.Screen name="index" />
                    <Stack.Screen
                      name="preview/[fileId]"
                      options={{
                        // Native iOS pageSheet: rounded-corner modal that
                        // the OS lets the user drag down to dismiss,
                        // coordinated with any inner UIScrollView (PDF,
                        // text). Works for every preview kind for free.
                        presentation: 'pageSheet',
                        animation: 'slide_from_bottom'
                      }}
                    />
                    <Stack.Screen
                      name="metadata/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="share/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="move/[ids]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="import"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="onlyoffice/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="note/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="docs/[fileId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="docs/new/[folderId]"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="settings"
                      options={{ presentation: 'pageSheet', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen name="search" options={{ animation: 'slide_from_bottom' }} />
                  </Stack>
                  {authenticating && <AuthTransitionOverlay />}
                </ErrorBoundary>
              </SharingProvider>
            </PiPSessionProvider>
          </I18nextProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )

  // AppProviderTree wraps `content` with PendingShareProvider positioned
  // OUTSIDE the `client` auth conditional — see app/_AppProviderTree.tsx for
  // why that placement matters (and app/_AppProviderTree.test.tsx for the
  // regression test that guards it).
  return <AppProviderTree>{content}</AppProviderTree>
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <InnerLayout />
    </AuthProvider>
  )
}
