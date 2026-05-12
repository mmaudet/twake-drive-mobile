import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Image, Linking, StyleSheet, View } from 'react-native'
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'
import { Button, Divider, Switch, Text, useTheme } from 'react-native-paper'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'
import { useRouter } from 'expo-router'

import { formatFileSize } from '@/utils/formatters'
import { openFileNatively } from '@/files/openFile'
import { isCozyNoteFile, isDocsNoteFile, isOfficeFile, isShortcutFile } from '@/files/fileTypes'
import { fetchShortcutUrl } from '@/files/shortcuts'
import { canPreviewInApp } from '@/files/streamUrl'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineState } from '@/offline/useOfflineState'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { FileThumbnail } from './FileThumbnail'

export interface FileMetadata {
  _id: string
  name: string
  type?: 'file' | 'directory'
  size: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  cozyMetadata?: {
    createdBy?: { account?: string }
  }
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

export interface FileMetadataSheetHandle {
  present: (file: FileMetadata) => void
  dismiss: () => void
}

interface FileMetadataSheetProps {
  onShareRequested?: (file: FileMetadata) => void
  onRenameRequested?: (file: FileMetadata) => void
  onDeleteRequested?: (file: FileMetadata) => void
}

export const FileMetadataSheet = forwardRef<FileMetadataSheetHandle, FileMetadataSheetProps>(
  ({ onShareRequested, onRenameRequested, onDeleteRequested }, ref) => {
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  const router = useRouter()
  const isOnline = useIsOnline()
  const bottomSheetRef = useRef<BottomSheet>(null)
  const [file, setFile] = React.useState<FileMetadata | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const offlineEntry = useOfflineState(file?._id)
  const { pin, unpin } = useOfflineActions()
  const isPinned = !!offlineEntry
  const togglePin = (): void => {
    if (!file) return
    if (isPinned) void unpin(file._id)
    else pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }

  useImperativeHandle(ref, () => ({
    present: (f: FileMetadata) => {
      setFile(f)
      setOpenError(null)
      bottomSheetRef.current?.expand()
    },
    dismiss: () => bottomSheetRef.current?.close()
  }))

  const onOpen = async (): Promise<void> => {
    if (!client || !file) return
    if (isCozyNoteFile(file.name)) {
      bottomSheetRef.current?.close()
      router.push(`/(drive)/note/${file._id}`)
      return
    }
    if (isDocsNoteFile(file.name)) {
      bottomSheetRef.current?.close()
      router.push(`/(drive)/docs/${file._id}`)
      return
    }
    if (isOfficeFile(file.mime)) {
      bottomSheetRef.current?.close()
      router.push(`/(drive)/onlyoffice/${file._id}`)
      return
    }
    if (canPreviewInApp(file)) {
      bottomSheetRef.current?.close()
      router.push(`/(drive)/preview/${file._id}`)
      return
    }
    if (isShortcutFile(file)) {
      setOpening(true)
      setOpenError(null)
      try {
        const url = await fetchShortcutUrl(client, file._id)
        if (!url) throw new Error('Shortcut has no target URL')
        bottomSheetRef.current?.close()
        await Linking.openURL(url)
      } catch (e) {
        console.error('[FileMetadataSheet] open shortcut failed', e)
        setOpenError((e as Error).message ?? 'open failed')
      } finally {
        setOpening(false)
      }
      return
    }
    setOpening(true)
    setOpenError(null)
    try {
      await openFileNatively(client, {
        _id: file._id,
        name: file.name,
        mime: file.mime
      })
    } catch (e) {
      console.error('[FileMetadataSheet] open failed', e)
      setOpenError((e as Error).message ?? 'open failed')
    } finally {
      setOpening(false)
    }
  }

  const onShare = (): void => {
    if (!file || !onShareRequested) return
    bottomSheetRef.current?.close()
    onShareRequested(file)
  }

  const onRename = (): void => {
    if (!file || !onRenameRequested) return
    bottomSheetRef.current?.close()
    onRenameRequested(file)
  }

  const onDelete = (): void => {
    if (!file || !onDeleteRequested) return
    bottomSheetRef.current?.close()
    onDeleteRequested(file)
  }

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['40%', '90%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <BottomSheetView style={styles.container}>
        {file ? (
          <>
            <View style={styles.header}>
              {isPinned && offlineEntry?.state === 'downloaded' && file.class === 'image' ? (
                <Image
                  source={{ uri: FileSystemRepo.localPath(file._id) }}
                  style={styles.localPreview}
                  resizeMode="contain"
                  accessibilityLabel={file.name}
                />
              ) : (
                <FileThumbnail file={file} size={120} />
              )}
              <Text variant="titleMedium" style={styles.name}>
                {file.name}
              </Text>
            </View>
            <Divider />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('drive.offline.keepOffline')}</Text>
              <Switch
                value={isPinned}
                onValueChange={togglePin}
                disabled={!isPinned && !isOnline}
              />
            </View>
            {!isPinned && !isOnline ? (
              <Text style={[styles.toggleHelper, { color: theme.colors.outline }]}>
                {t('drive.offline.disabledOffline')}
              </Text>
            ) : null}
            <Divider />
            <Row label={t('drive.fileMeta.type')} value={file.mime ?? '—'} />
            <Row label={t('drive.fileMeta.size')} value={formatFileSize(file.size)} />
            <Row
              label={t('drive.fileMeta.modified')}
              value={file.updated_at ? format(new Date(file.updated_at), 'PPp') : '—'}
            />
            <Row label={t('drive.fileMeta.path')} value={file.path ?? '—'} />
            <Row
              label={t('drive.fileMeta.owner')}
              value={file.cozyMetadata?.createdBy?.account ?? '—'}
            />
            <View style={styles.footer}>
              <Button
                mode="contained"
                onPress={onOpen}
                loading={opening}
                disabled={opening || (!isOnline && offlineEntry?.state !== 'downloaded')}
                icon="open-in-new"
              >
                {t('drive.fileMeta.open')}
              </Button>
              {openError ? (
                <Text
                  variant="bodySmall"
                  style={[styles.errorText, { color: theme.colors.error }]}
                >
                  {openError}
                </Text>
              ) : null}
              {onShareRequested ? (
                <Button
                  mode="outlined"
                  onPress={onShare}
                  icon="share-variant"
                  disabled={!isOnline}
                >
                  {t('drive.fileMeta.share')}
                </Button>
              ) : null}
              {onRenameRequested ? (
                <Button
                  mode="outlined"
                  onPress={onRename}
                  icon="pencil-outline"
                  disabled={!isOnline}
                >
                  {t('drive.fileMeta.rename')}
                </Button>
              ) : null}
              {onDeleteRequested ? (
                <Button
                  mode="outlined"
                  onPress={onDelete}
                  icon="trash-can-outline"
                  textColor={theme.colors.error}
                  disabled={!isOnline}
                >
                  {t('drive.fileMeta.delete')}
                </Button>
              ) : null}
              {!isOnline ? (
                <Text
                  variant="bodySmall"
                  style={[styles.hint, { color: theme.colors.outline }]}
                >
                  {t('drive.offline.requiresOnline')}
                </Text>
              ) : null}
              <Button mode="outlined" onPress={() => bottomSheetRef.current?.close()}>
                {t('common.close')}
              </Button>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  )
  }
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text variant="labelMedium" style={styles.label}>
      {label}
    </Text>
    <Text variant="bodyMedium" style={styles.value}>
      {value}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  localPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: '#00000010'
  },
  name: { textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  label: { flex: 1 },
  value: { flex: 2, textAlign: 'right' },
  footer: { marginTop: 24, gap: 8 },
  errorText: { textAlign: 'center' },
  hint: { textAlign: 'center', marginTop: 4 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  toggleLabel: { fontSize: 14 },
  toggleHelper: { fontSize: 12, paddingBottom: 8 }
})

FileMetadataSheet.displayName = 'FileMetadataSheet'
