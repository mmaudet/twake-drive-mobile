import 'react-native-url-polyfill/auto'

import React, { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Stack } from 'expo-router'
import { CozyProvider } from 'cozy-client'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/i18n'
import { AuthProvider, useAuth } from '@/auth/useAuth'
import { darkTheme, lightTheme } from '@/ui/theme'
import { attachRevocationListener } from '@/auth/revocationListener'
import { ErrorBoundary } from '@/ui/ErrorBoundary'

const InnerLayout = () => {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme
  const { client, logout } = useAuth()

  useEffect(() => {
    if (!client) return
    return attachRevocationListener(client, () => {
      void logout()
    })
  }, [client, logout])

  const content = (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider theme={theme}>
          <I18nextProvider i18n={i18n}>
            <BottomSheetModalProvider>
              <ErrorBoundary>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(drive)" />
                  <Stack.Screen name="index" />
                  <Stack.Screen
                    name="preview/[fileId]"
                    options={{
                      presentation: 'transparentModal',
                      animation: 'fade',
                      // Underlying screen stays mounted + visible so the
                      // drag-to-dismiss can reveal it.
                      contentStyle: { backgroundColor: 'transparent' }
                    }}
                  />
                </Stack>
              </ErrorBoundary>
            </BottomSheetModalProvider>
          </I18nextProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )

  return client ? <CozyProvider client={client}>{content}</CozyProvider> : content
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <InnerLayout />
    </AuthProvider>
  )
}
