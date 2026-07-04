import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, useTheme } from 'react-native-paper'

/** Opaque, full-bleed loading overlay. Unlike LoadingState (transparent), this
 *  paints a solid themed background so it can sit ON TOP of a WebView and hide
 *  its intermediate pages — e.g. the OIDC redirect flash — until the editor is
 *  ready. Meant to be rendered as an absolutely-positioned sibling of the WebView. */
export const LoadingOverlay = (): React.ReactElement => {
  const theme = useTheme()
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.colors.background }]}
    >
      <ActivityIndicator animating size="large" />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' }
})
