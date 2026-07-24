import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, useTheme } from 'react-native-paper'

import { TwakeLogo } from '@/ui/icons/TwakeLogo'

export const AuthTransitionOverlay = () => {
  const theme = useTheme()
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { backgroundColor: theme.colors.background }
      ]}
    >
      <TwakeLogo size={72} />
      <ActivityIndicator animating size="large" style={styles.spinner} />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  spinner: { marginTop: 28 }
})
