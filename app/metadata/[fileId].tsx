import React, { useCallback, useState } from 'react'
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Button, Divider, Snackbar, Switch, Text, useTheme } from 'react-native-paper'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FileThumbnail } from '@/ui/FileThumbnail'
import { RenameDialog } from '@/ui/RenameDialog'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { formatFileSize } from '@/utils/formatters'
import { openFileNatively } from '@/files/openFile'
import { renameEntry } from '@/files/renameEntry'
import { softDeleteEntry } from '@/files/deleteFile'
import { isCozyNoteFile, isDocsNoteFile, isOfficeFile, isShortcutFile } from '@/files/fileTypes'
import { fetchShortcutUrl } from '@/files/shortcuts'
import { canPreviewInApp } from '@/files/streamUrl'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineState } from '@/offline/useOfflineState'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { FileSystemRepo } from '@/offline/FileSystemRepo'

// Brief delay so the success snackbar is visible before the modal dismisses.
const SNACKBAR_DISMISS_DELAY_MS = 600

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

export default function MetadataRoute() {
  const router = useRouter()
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const lookupData = fileLookup.data
  const file = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as
    | FileQueryResult
    | null
    | undefined

  const offlineEntry = useOfflineState(fileId ?? undefined)
  const { pin, unpin } = useOfflineActions()
  const isPinned = !!offlineEntry
  const togglePin = (): void => {
    if (!file) return
    if (isPinned) void unpin(file._id)
    else pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }

  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [renameVisible, setRenameVisible] = useState(false)
  const [deleteVisible, setDeleteVisible] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back()
  }, [router])

  const onOpen = async (): Promise<void> => {
    if (!client || !file) return
    if (isCozyNoteFile(file.name)) {
      close()
      router.push(`/note/${file._id}`)
      return
    }
    if (isDocsNoteFile(file.name)) {
      close()
      router.push(`/docs/${file._id}`)
      return
    }
    if (isOfficeFile(file.mime)) {
      close()
      router.push(`/onlyoffice/${file._id}`)
      return
    }
    if (canPreviewInApp(file)) {
      close()
      router.push(`/preview/${file._id}`)
      return
    }
    if (isShortcutFile(file)) {
      setOpening(true)
      setOpenError(null)
      try {
        const url = await fetchShortcutUrl(client, file._id)
        if (!url) throw new Error('Shortcut has no target URL')
        close()
        await Linking.openURL(url)
      } catch (e) {
        setOpenError((e as Error).message ?? 'open failed')
      } finally {
        setOpening(false)
      }
      return
    }
    setOpening(true)
    setOpenError(null)
    try {
      await openFileNatively(client, { _id: file._id, name: file.name, mime: file.mime })
    } catch (e) {
      setOpenError((e as Error).message ?? 'open failed')
    } finally {
      setOpening(false)
    }
  }

  const onShare = (): void => {
    if (!file) return
    router.replace(`/share/${file._id}`)
  }

  const onRenameSubmit = async (newName: string): Promise<void> => {
    if (!client || !file) return
    setMutating(true)
    try {
      await renameEntry(client, file._id, newName)
      setRenameVisible(false)
      setSnackbar(
        t(file.type === 'directory' ? 'drive.rename.successFolder' : 'drive.rename.successFile')
      )
      setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
    } catch (e) {
      setSnackbar(t('drive.rename.errorGeneric'))
    } finally {
      setMutating(false)
    }
  }

  const onDeleteConfirm = async (): Promise<void> => {
    if (!client || !file) return
    setMutating(true)
    try {
      await softDeleteEntry(client, {
        _id: file._id,
        _rev: file._rev,
        name: file.name,
        type: file.type
      })
      setDeleteVisible(false)
      setSnackbar(
        t(file.type === 'directory' ? 'drive.delete.successFolder' : 'drive.delete.successFile')
      )
      setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
    } catch (e) {
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setMutating(false)
    }
  }

  if (fileLookup.fetchStatus === 'loading' && !file) {
    return (
      <ScreenContainer>
        <LoadingState />
      </ScreenContainer>
    )
  }
  if (!file) {
    return (
      <ScreenContainer>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={() => fileLookup.fetch()} />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container}>
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
          <Switch value={isPinned} onValueChange={togglePin} disabled={!isPinned && !isOnline} />
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
            <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
              {openError}
            </Text>
          ) : null}
          <Button mode="outlined" onPress={onShare} icon="share-variant" disabled={!isOnline}>
            {t('drive.fileMeta.share')}
          </Button>
          <Button
            mode="outlined"
            onPress={() => setRenameVisible(true)}
            icon="pencil-outline"
            disabled={!isOnline}
          >
            {t('drive.fileMeta.rename')}
          </Button>
          <Button
            mode="outlined"
            onPress={() => setDeleteVisible(true)}
            icon="trash-can-outline"
            textColor={theme.colors.error}
            disabled={!isOnline}
          >
            {t('drive.fileMeta.delete')}
          </Button>
          {!isOnline ? (
            <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.outline }]}>
              {t('drive.offline.requiresOnline')}
            </Text>
          ) : null}
          <Button mode="outlined" onPress={close}>
            {t('common.close')}
          </Button>
        </View>
      </ScrollView>
      <RenameDialog
        visible={renameVisible}
        initialName={file.name}
        type={file.type}
        onDismiss={() => (mutating ? undefined : setRenameVisible(false))}
        onSubmit={onRenameSubmit}
      />
      <ConfirmDeleteDialog
        visible={deleteVisible}
        target={file}
        loading={mutating}
        onConfirm={() => void onDeleteConfirm()}
        onDismiss={() => (mutating ? undefined : setDeleteVisible(false))}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

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
