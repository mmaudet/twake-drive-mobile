import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, useTheme } from 'react-native-paper'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { TwakeLogo } from '@/ui/icons/TwakeLogo'
import { useAuth } from '@/auth/useAuth'
import { UserCancelledError } from '@/auth/types'

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const { loginWithTwakeWorkplace } = useAuth()
  const [loading, setLoading] = useState<'signin' | 'signup' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (mode: 'signin' | 'signup'): Promise<void> => {
    setError(null)
    setLoading(mode)
    try {
      await loginWithTwakeWorkplace(mode)
      router.replace('/(drive)/files')
    } catch (err) {
      const e = err as Error
      if (err instanceof UserCancelledError) {
        // silent — user closed the browser
      } else if (e.message === 'DOMAIN_UNSUPPORTED') {
        setError(t('auth.errorDomainUnsupported'))
      } else if (e.message?.toLowerCase().includes('network')) {
        setError(t('auth.errorNetwork'))
      } else {
        setError(t('auth.errorGeneric'))
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <TwakeLogo size={76} />
          <Text
            variant="headlineMedium"
            style={[styles.wordmark, { color: theme.colors.onSurface }]}
          >
            Twake Drive
          </Text>
          <Text
            variant="bodyLarge"
            style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('auth.welcomeSubtitle')}
          </Text>
        </View>

        <View style={styles.actions}>
          <HelperText type="error" visible={!!error} style={styles.error}>
            {error ?? ''}
          </HelperText>
          <Button
            testID="welcome-signup"
            mode="contained"
            onPress={() => void start('signup')}
            loading={loading === 'signup'}
            disabled={loading !== null}
            style={styles.btn}
            contentStyle={styles.btnContent}
          >
            {t('auth.signUp')}
          </Button>
          <Button
            testID="welcome-login"
            mode="outlined"
            onPress={() => void start('signin')}
            loading={loading === 'signin'}
            disabled={loading !== null}
            style={styles.btn}
            contentStyle={styles.btnContent}
          >
            {t('auth.loginCta')}
          </Button>
          <Pressable
            testID="welcome-org-server-link"
            onPress={() => router.push('/(auth)/login')}
            disabled={loading !== null}
            style={styles.link}
          >
            <Text variant="labelLarge" style={[styles.linkText, { color: theme.colors.primary }]}>
              {t('auth.orgServerLink')}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { marginTop: 20, fontWeight: '800' },
  tagline: { marginTop: 8, textAlign: 'center', maxWidth: 260 },
  actions: { gap: 10 },
  error: { textAlign: 'center' },
  btn: { borderRadius: 14 },
  btnContent: { height: 50 },
  link: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  linkText: { textAlign: 'center' }
})
