import React from 'react'
import { StyleSheet, View } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { useTheme } from 'react-native-paper'

import { OfflineFileEntry } from './types'

interface Props {
  entry: OfflineFileEntry | undefined
  size?: number
  testID?: string
}

const iconForState = (state: OfflineFileEntry['state']): string => {
  switch (state) {
    case 'downloaded': return 'cloud-check'
    case 'downloading': return 'cloud-download'
    case 'pending': return 'cloud-outline'
    case 'failed': return 'cloud-alert'
    case 'paused-auth': return 'cloud-clock'
  }
}

export const PinnedBadge = ({ entry, size = 12, testID }: Props): React.ReactElement | null => {
  const theme = useTheme()
  if (!entry) return null
  const color =
    entry.state === 'failed'
      ? theme.colors.error
      : entry.state === 'pending' || entry.state === 'paused-auth'
        ? theme.colors.outline
        : theme.colors.primary
  return (
    <View
      testID={testID}
      style={[styles.wrap, { backgroundColor: theme.colors.surface, borderColor: color }]}
    >
      <Icon name={iconForState(entry.state)} size={size} color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
