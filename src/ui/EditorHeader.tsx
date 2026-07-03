import React from 'react'
import { StatusBar, StyleSheet, View } from 'react-native'
import { Appbar } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TwakeLogo } from '@/ui/icons/TwakeLogo'
import { CozyIcon } from '@/ui/icons/CozyIcon'

interface Props {
  title: string
  onBack: () => void
  onShare?: () => void
}

/** Header for full-screen editor routes: a back action to return to the drive,
 *  the Twake logo, the document title, and an optional share action on the right.
 *  We pass the top safe-area inset explicitly as statusBarHeight: these routes
 *  are pageSheets where Appbar.Header's automatic inset is unreliable (it worked
 *  for OnlyOffice but overlapped the status bar on Notes), so forcing it keeps
 *  the phone clock/icons visible above the header on EVERY editor. */
export const EditorHeader = ({ title, onBack, onShare }: Props): React.ReactElement => {
  const insets = useSafeAreaInsets()
  // Inside the editor pageSheet the safe-area top inset comes back as 0, so
  // fall back to Android's native status-bar height constant to guarantee the
  // header sits below the clock/icons on every editor (Note/OnlyOffice/Docs).
  const topInset = insets.top || StatusBar.currentHeight || 0
  return (
    <Appbar.Header statusBarHeight={topInset}>
      <Appbar.BackAction onPress={onBack} />
      <View style={styles.logo}>
        <TwakeLogo size={28} />
      </View>
      <Appbar.Content title={title} />
      {onShare ? (
        <Appbar.Action
          icon={p => <CozyIcon name="shareExternal" size={p?.size ?? 24} color={p?.color} />}
          onPress={onShare}
          accessibilityLabel="Partager"
        />
      ) : null}
    </Appbar.Header>
  )
}

const styles = StyleSheet.create({
  logo: { marginLeft: 4, marginRight: 4, justifyContent: 'center' }
})
