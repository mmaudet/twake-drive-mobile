import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, HelperText, IconButton, Text, TextInput, useTheme } from 'react-native-paper'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'

import { TwakeLogo } from '@/ui/icons/TwakeLogo'
import { useAuth } from '@/auth/useAuth'
import { UserCancelledError } from '@/auth/types'

const isValidEmail = (s: string): boolean => /\S+@\S+\.\S+/.test(s)

export default function LoginScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/welcome')
  }

  const onSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      await login(email)
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
        setError(`${e.name}: ${e.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={goBack}
          accessibilityLabel={t('common.back')}
          style={styles.back}
        />
        <TwakeLogo size={44} />

        <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
            {t('auth.orgServerBadge')}
          </Text>
        </View>

        <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
          {t('auth.loginCta')}
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('auth.orgServerSubtitle')}
        </Text>

        <TextInput
          label={t('auth.emailLabel')}
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (isValidEmail(email) && !loading) void onSubmit()
          }}
          mode="outlined"
          style={styles.field}
        />
        <HelperText type="error" visible={!!error}>
          {error ?? ''}
        </HelperText>

        <Text variant="bodySmall" style={[styles.assist, { color: theme.colors.onSurfaceVariant }]}>
          {t('auth.orgServerAssist')}
        </Text>

        <View style={styles.spacer} />

        <Button
          mode="contained"
          onPress={onSubmit}
          disabled={!isValidEmail(email) || loading}
          loading={loading}
          style={styles.btn}
          contentStyle={styles.btnContent}
        >
          {t('auth.continue')}
        </Button>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 24 },
  back: { alignSelf: 'flex-start', margin: 0, marginLeft: -8, marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  title: { marginTop: 16, fontWeight: '800' },
  subtitle: { marginTop: 8, lineHeight: 20 },
  field: { marginTop: 20 },
  assist: { marginTop: 4 },
  spacer: { flex: 1 },
  btn: { borderRadius: 14 },
  btnContent: { height: 50 }
})
