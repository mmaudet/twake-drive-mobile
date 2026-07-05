import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, List, Menu, useTheme } from 'react-native-paper'
import { formatDistanceToNow } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { formatFileSize } from '@/utils/formatters'
import { useFileSharingStatus } from '@/sharing/SharingProvider'
import { useIsOnline } from '@/network/useIsOnline'
import { PinnedBadge } from '@/offline/PinnedBadge'
import { useOfflineState } from '@/offline/useOfflineState'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { download } from '@/files/download'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { FileThumbnail } from './FileThumbnail'
import { SharedBadge } from './SharedBadge'

export interface FileItem {
  _id: string
  name: string
  type?: 'file' | 'directory'
  size: number | null
  mime?: string
  class?: string
  updated_at?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
  cozyMetadata?: { favorite?: boolean }
}

interface Props {
  file: FileItem
  onPress: (file: FileItem) => void
  onLongPress?: (file: FileItem) => void
  /** Render the row in the "selected" state (tinted background). */
  selected?: boolean
  /** When any of `onShare` / `onRename` / `onDelete` is provided, a 3-dot
   *  menu is rendered on the right with the corresponding action(s).
   *  Without any, the row stays unadorned (the metadata sheet still
   *  surfaces these actions). The menu is hidden while `selected` to keep
   *  the row in pure selection mode. */
  onShare?: (file: FileItem) => void
  onRename?: (file: FileItem) => void
  onRestore?: (file: FileItem) => void
  onDelete?: (file: FileItem) => void
  onTogglePin?: (file: FileItem) => void
  onMove?: (file: FileItem) => void
  /** Opens the metadata/details sheet for this row. */
  onInfo?: (file: FileItem) => void
  /** Called after a favorite toggle so the parent can refetch its query — the
   * lists are non-reactive, so without this a removed favorite lingers. */
  onFavoriteChange?: () => void
  /** Stable id for E2E (Maestro) selection. */
  testID?: string
}

export const FileRow = ({
  file,
  onPress,
  onLongPress,
  selected,
  onShare,
  onRename,
  onRestore,
  onDelete,
  onTogglePin,
  onMove,
  onInfo,
  onFavoriteChange,
  testID
}: Props) => {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const [menuVisible, setMenuVisible] = useState(false)
  const offlineEntry = useOfflineState(file._id)
  const isPinned = !!offlineEntry
  // "Retirer du hors-ligne" can only apply to a DIRECT pin. A file that's offline
  // solely because its parent folder is pinned must show "Garder hors-ligne"
  // (which adds a direct pin) — showing "Retirer" there made onToggleFilePin fall
  // through and RE-PIN the file instead of removing it (opposite of the label).
  const isDirectPin = !!offlineEntry?.isDirectPin
  const size = formatFileSize(file.size)
  const dateLocale = i18n.language?.startsWith('fr') ? fr : enUS
  const date = file.updated_at
    ? formatDistanceToNow(new Date(file.updated_at), { addSuffix: true, locale: dateLocale })
    : ''
  const offlineDescription =
    offlineEntry?.state === 'downloading' && offlineEntry.bytesDownloaded !== undefined
      ? `${formatFileSize(offlineEntry.bytesDownloaded)} / ${formatFileSize(file.size)}`
      : undefined
  const description = offlineDescription ?? (date ? `${size} · ${date}` : size)
  const sharingStatus = useFileSharingStatus(file._id)
  const hasMenu =
    (!!onShare ||
      !!onRename ||
      !!onRestore ||
      !!onDelete ||
      !!onTogglePin ||
      !!onMove ||
      !!onInfo) &&
    !selected

  return (
    <List.Item
      testID={testID}
      title={file.name}
      description={description}
      // Honour the `style` Paper passes to `left` (margins, etc.) so the
      // thumbnail aligns with `<List.Icon>` columns elsewhere in the app.
      left={props => (
        <View style={[props.style, styles.leftSlot]}>
          {selected ? (
            <View style={[styles.checkmark, { backgroundColor: theme.colors.primary }]}>
              <CozyIcon name="check" size={24} color={theme.colors.onPrimary} />
            </View>
          ) : (
            <View style={styles.thumbWrap}>
              <FileThumbnail file={file} size={40} />
              <SharedBadge status={sharingStatus} />
              <PinnedBadge entry={offlineEntry} testID="pinned-badge" />
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
                accessibilityLabel={t('a11y.fileActions')}
                testID="file-actions"
              />
            }
          >
            {onTogglePin ? (
              <Menu.Item
                leadingIcon={isDirectPin ? 'cloud-off-outline' : 'cloud-download-outline'}
                title={t(isDirectPin ? 'drive.offline.unpin' : 'drive.offline.pin')}
                disabled={!isDirectPin && !isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onTogglePin(file)
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
                  onShare(file)
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
                  onRename(file)
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
                  onRestore(file)
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
                  onDelete(file)
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
                  onMove(file)
                }}
              />
            ) : null}
            {onInfo ? (
              <Menu.Item
                leadingIcon={() => (
                  <CozyIcon name="info" size={24} color={theme.colors.onSurface} />
                )}
                title={t('drive.fileMeta.info')}
                onPress={() => {
                  setMenuVisible(false)
                  onInfo(file)
                }}
              />
            ) : null}
            <Menu.Item
              leadingIcon={() => (
                <CozyIcon
                  name={
                    isFavorite(file as Parameters<typeof isFavorite>[0]) ? 'star' : 'starOutline'
                  }
                  size={24}
                  color={theme.colors.onSurface}
                />
              )}
              title={t(
                isFavorite(file as Parameters<typeof isFavorite>[0])
                  ? 'drive.fileMeta.unfavorite'
                  : 'drive.fileMeta.favorite'
              )}
              onPress={() => {
                setMenuVisible(false)
                if (!client) return
                const next = !isFavorite(file as Parameters<typeof isFavorite>[0])
                void toggleFavorite(client, file as Parameters<typeof toggleFavorite>[1], next)
                  .then(() => {
                    triggerPouchReplication(client)
                    onFavoriteChange?.()
                  })
                  .catch(e => console.error('[FileRow] toggleFavorite failed', e))
              }}
            />
            <Menu.Item
              leadingIcon={() => (
                <CozyIcon name="download" size={24} color={theme.colors.onSurface} />
              )}
              title={t('drive.fileMeta.download')}
              onPress={() => {
                setMenuVisible(false)
                if (!client) return
                void download(client, file)
              }}
            />
          </Menu>
        ) : null
      }
      onPress={() => onPress(file)}
      onLongPress={onLongPress ? () => onLongPress(file) : undefined}
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
