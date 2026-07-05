import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'react-native-paper'

import { FileThumbnail } from './FileThumbnail'
import { PinnedBadge } from '@/offline/PinnedBadge'
import { folderBadgeEntry } from '@/offline/folderBadgeEntry'
import { useOfflineState, useOfflineFolderState } from '@/offline/useOfflineState'
import type { FileQueryResult } from '@/client/queries'

interface Props {
  file: FileQueryResult
  onPress: (file: FileQueryResult) => void
  onLongPress?: (file: FileQueryResult) => void
  /** Render the tile in the "selected" state (tinted background). */
  selected?: boolean
}

const THUMBNAIL_SIZE = 64

/**
 * A grid tile for a single file or folder.
 * Shows a thumbnail/icon at the top and the entry name (up to 2 lines) below.
 * Mirrors the press/long-press/selected contract of FileRow and FolderRow.
 */
export function FileGridItem({ file, onPress, onLongPress, selected }: Props) {
  const { colors, roundness } = useTheme()
  const isFolder = file.type === 'directory'
  // Offline/pinned indicator — mirror the LIST rows so the badge also shows in
  // grid. Each hook is a no-op when given `undefined`, so only the relevant one
  // subscribes (file → useOfflineState, folder → useOfflineFolderState).
  const fileEntry = useOfflineState(isFolder ? undefined : file._id)
  const folderState = useOfflineFolderState(isFolder ? file._id : undefined)
  const badgeEntry = isFolder
    ? folderState.pinned && folderState.aggregate
      ? folderBadgeEntry(folderState.aggregate)
      : undefined
    : fileEntry

  const containerStyle = [
    styles.container,
    { borderRadius: roundness },
    selected && { backgroundColor: colors.primaryContainer }
  ]

  return (
    <Pressable
      testID="file-grid-item"
      onPress={() => onPress(file)}
      onLongPress={onLongPress ? () => onLongPress(file) : undefined}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !selected && { backgroundColor: colors.surfaceVariant }
      ]}
      accessibilityRole="button"
      accessibilityLabel={file.name}
    >
      <View testID="file-grid-icon" style={styles.iconWrapper}>
        <FileThumbnail file={file} size={THUMBNAIL_SIZE} />
        <PinnedBadge entry={badgeEntry} testID="pinned-badge" />
      </View>
      <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={2}>
        {file.name}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 4,
    padding: 8,
    alignItems: 'center'
  },
  iconWrapper: {
    position: 'relative',
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  name: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16
  }
})
