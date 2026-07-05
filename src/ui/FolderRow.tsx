import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, List, Menu, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'
import { useFileSharingStatus } from '@/sharing/SharingProvider'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineFolderState } from '@/offline/useOfflineState'
import { PinnedBadge } from '@/offline/PinnedBadge'
import { folderBadgeEntry } from '@/offline/folderBadgeEntry'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { SharedBadge } from './SharedBadge'

export interface FolderItem {
  _id: string
  name: string
  cozyMetadata?: { favorite?: boolean }
}

interface Props {
  folder: FolderItem
  onPress: (folder: FolderItem) => void
  onLongPress?: (folder: FolderItem) => void
  /** Render the row in the "selected" state (tinted background). */
  selected?: boolean
  /**
   * When any of `onShare` / `onRename` / `onDelete` is provided, a 3-dot
   * menu is rendered with the corresponding action(s). Without any, the
   * chevron-right is shown. The menu is hidden while `selected` to keep
   * the row in pure selection mode.
   */
  onShare?: (folder: FolderItem) => void
  onRename?: (folder: FolderItem) => void
  onRestore?: (folder: FolderItem) => void
  onDelete?: (folder: FolderItem) => void
  onTogglePin?: (folder: FolderItem) => void
  onMove?: (folder: FolderItem) => void
  /** Stable id for E2E (Maestro) selection. */
  testID?: string
}

export const FolderRow = ({
  folder,
  onPress,
  onLongPress,
  selected,
  onShare,
  onRename,
  onRestore,
  onDelete,
  onTogglePin,
  onMove,
  testID
}: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const [menuVisible, setMenuVisible] = useState(false)
  const sharingStatus = useFileSharingStatus(folder._id)
  const folderOfflineState = useOfflineFolderState(folder._id)
  const isPinned = folderOfflineState.pinned
  const hasMenu =
    (!!onShare || !!onRename || !!onRestore || !!onDelete || !!onTogglePin || !!onMove) && !selected

  const description =
    isPinned && folderOfflineState.downloading > 0
      ? t('drive.offline.folderPartial', {
          count: folderOfflineState.downloaded,
          total: folderOfflineState.total
        })
      : undefined

  return (
    <List.Item
      testID={testID}
      title={folder.name}
      description={description}
      // Honour the `style` Paper passes to `left` so the folder icon aligns
      // with file thumbnails in the same list (matching column widths).
      left={props => (
        <View style={[props.style, styles.leftSlot]}>
          {selected ? (
            <View style={[styles.checkmark, { backgroundColor: theme.colors.primary }]}>
              <CozyIcon name="check" size={24} color={theme.colors.onPrimary} />
            </View>
          ) : (
            <View style={styles.thumbWrap}>
              <FileTypeIcon icon="folder" size={40} />
              <SharedBadge status={sharingStatus} />
              <PinnedBadge
                entry={
                  isPinned && folderOfflineState.aggregate
                    ? folderBadgeEntry(folderOfflineState.aggregate)
                    : undefined
                }
                testID="pinned-badge"
              />
            </View>
          )}
        </View>
      )}
      right={props =>
        hasMenu ? (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                {...props}
                icon={p => <CozyIcon name="dotsVertical" size={p?.size ?? 24} color={p?.color} />}
                onPress={() => setMenuVisible(true)}
                accessibilityLabel="folder actions"
                // Per-folder testID so E2E can open a SPECIFIC row's menu without
                // a `rightOf` selector (which resolves to the wrong row — it caused
                // wrong-folder deletions during bring-up).
                testID={`folder-actions:${folder.name}`}
              />
            }
          >
            {onTogglePin ? (
              <Menu.Item
                leadingIcon={isPinned ? 'cloud-off-outline' : 'cloud-download-outline'}
                title={t(isPinned ? 'drive.offline.unpin' : 'drive.offline.pin')}
                disabled={!isPinned && !isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onTogglePin(folder)
                }}
              />
            ) : null}
            {onShare ? (
              <Menu.Item
                leadingIcon={() => (
                  <CozyIcon name="shareExternal" size={24} color={theme.colors.onSurface} />
                )}
                title={t('drive.fileMeta.share')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onShare(folder)
                }}
              />
            ) : null}
            {onRename ? (
              <Menu.Item
                leadingIcon={() => (
                  <CozyIcon name="rename" size={24} color={theme.colors.onSurface} />
                )}
                title={t('drive.fileMeta.rename')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onRename(folder)
                }}
              />
            ) : null}
            {onRestore ? (
              <Menu.Item
                leadingIcon={() => (
                  <CozyIcon name="restore" size={24} color={theme.colors.onSurface} />
                )}
                title={t('drive.trashActions.restore')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onRestore(folder)
                }}
              />
            ) : null}
            {onDelete ? (
              <Menu.Item
                leadingIcon={() => (
                  <CozyIcon name="trash" size={24} color={theme.colors.onSurface} />
                )}
                title={t('drive.fileMeta.delete')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onDelete(folder)
                }}
              />
            ) : null}
            {onMove ? (
              <Menu.Item
                leadingIcon={() => (
                  <CozyIcon name="moveto" size={24} color={theme.colors.onSurface} />
                )}
                title={t('drive.fileMeta.move')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onMove(folder)
                }}
              />
            ) : null}
            <Menu.Item
              leadingIcon={() => (
                <CozyIcon
                  name={
                    isFavorite(folder as Parameters<typeof isFavorite>[0]) ? 'star' : 'starOutline'
                  }
                  size={24}
                  color={theme.colors.onSurface}
                />
              )}
              title={t(
                isFavorite(folder as Parameters<typeof isFavorite>[0])
                  ? 'drive.fileMeta.unfavorite'
                  : 'drive.fileMeta.favorite'
              )}
              onPress={() => {
                setMenuVisible(false)
                if (!client) return
                const next = !isFavorite(folder as Parameters<typeof isFavorite>[0])
                void toggleFavorite(
                  client,
                  folder as Parameters<typeof toggleFavorite>[1],
                  next
                ).then(() => {
                  triggerPouchReplication(client)
                })
              }}
            />
          </Menu>
        ) : (
          <List.Icon
            {...props}
            icon={p => <CozyIcon name="chevronRight" size={p?.size ?? 24} color={p?.color} />}
          />
        )
      }
      onPress={() => onPress(folder)}
      onLongPress={onLongPress ? () => onLongPress(folder) : undefined}
      style={[styles.row, selected && { backgroundColor: theme.colors.primaryContainer }]}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  leftSlot: { justifyContent: 'center', alignItems: 'center', width: 40, height: 40 },
  thumbWrap: { position: 'relative', width: 40, height: 40 },
  checkmark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
