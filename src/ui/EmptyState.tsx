import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import { CozyIcon } from '@/ui/icons/CozyIcon'

interface Props {
  icon?: string
  message: string
}

export const EmptyState = ({ icon = 'fileTypeFolder', message }: Props) => {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      <CozyIcon name={icon} size={64} color={theme.colors.onSurfaceVariant} />
      <Text variant="bodyLarge" style={styles.message}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 16, textAlign: 'center' }
})
