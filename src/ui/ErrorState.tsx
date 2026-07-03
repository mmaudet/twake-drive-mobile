import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { CozyIcon } from '@/ui/icons/CozyIcon'

interface Props {
  message: string
  onRetry?: () => void
  icon?: string
}

export const ErrorState = ({ message, onRetry, icon = 'info' }: Props) => {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      <CozyIcon name={icon} size={64} color={theme.colors.error} />
      <Text variant="bodyLarge" style={styles.message}>
        {message}
      </Text>
      {onRetry ? (
        <Button mode="contained" onPress={onRetry} style={styles.button}>
          {t('common.retry')}
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 16, textAlign: 'center' },
  button: { marginTop: 16 }
})
