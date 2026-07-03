import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Button, Dialog, FAB, Portal, Snackbar, Text, useTheme } from 'react-native-paper'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from 'cozy-client'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import {
  trashFoldersQuery,
  trashFoldersQueryAs,
  trashFilesQuery,
  trashFilesQueryAs,
  FileQueryResult
} from '@/client/queries'
import { restoreEntry, emptyTrash } from '@/files/trashActions'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'

export default function TrashScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const theme = useTheme()
  const foldersQuery = useQuery(trashFoldersQuery(), { as: trashFoldersQueryAs })
  const filesQuery = useQuery(trashFilesQuery(), { as: trashFilesQueryAs })

  const foldersQueryRef = useRef(foldersQuery)
  const filesQueryRef = useRef(filesQuery)
  foldersQueryRef.current = foldersQuery
  filesQueryRef.current = filesQuery

  useFocusEffect(
    useCallback(() => {
      void foldersQueryRef.current.fetch()
      void filesQueryRef.current.fetch()
    }, [])
  )

  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [emptyDialogVisible, setEmptyDialogVisible] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const isOnline = useIsOnline()

  const folderDocs = (foldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  const fileDocs = (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  // Folders first, then files — same display order as the regular folder
  // listing and as twake-drive-web's trash view.
  const data = [...folderDocs, ...fileDocs]

  const handleRestore = async (item: FileQueryResult): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    try {
      await restoreEntry(client, item._id)
      setSnackbar(t('drive.trashActions.restoreSuccess'))
      await onRefresh()
    } catch (e) {
      console.error('[TrashScreen] restore failed', e)
      setSnackbar(t('drive.trashActions.restoreError'))
    }
  }

  const handleEmpty = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    setEmptying(true)
    try {
      await emptyTrash(client)
      setSnackbar(t('drive.trashActions.emptySuccess'))
      setEmptyDialogVisible(false)
      await onRefresh()
    } catch (e) {
      console.error('[TrashScreen] empty failed', e)
      setSnackbar(t('drive.trashActions.emptyError'))
    } finally {
      setEmptying(false)
    }
  }

  /**
   * Pull-to-refresh: re-run both queries through the link chain.
   * useQuery handles the initial fetch on mount on its own.
   */
  const onRefresh = useCallback((): void => {
    void foldersQuery.fetch()
    void filesQuery.fetch()
  }, [foldersQuery, filesQuery])

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={() => undefined}
          onRestore={() => void handleRestore(item)}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => router.push(`/metadata/${file._id}`)}
        onRestore={() => void handleRestore(item)}
      />
    )
  }

  return (
    <ScreenContainer>
      <AppBar title={t('drive.trash')} onLogout={logout} showSearch />
      {(foldersQuery.fetchStatus === 'loading' || filesQuery.fetchStatus === 'loading') &&
      data.length === 0 ? (
        <LoadingState />
      ) : foldersQuery.fetchStatus === 'failed' || filesQuery.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(foldersQuery.lastError ?? filesQuery.lastError))}
          onRetry={onRefresh}
        />
      ) : (
        // Always render the FlatList (even when empty, via
        // ListEmptyComponent) so the RefreshControl stays reachable —
        // otherwise the user can't pull-to-refresh to ask Pouch to
        // sync a freshly-trashed doc that hasn't replicated yet.
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState message={t('drive.emptyTrash')} />}
          contentContainerStyle={data.length === 0 ? styles.emptyContent : undefined}
          refreshControl={
            <RefreshControl
              refreshing={
                foldersQuery.fetchStatus === 'loading' || filesQuery.fetchStatus === 'loading'
              }
              onRefresh={onRefresh}
            />
          }
        />
      )}
      {data.length > 0 ? (
        <FAB
          icon="delete-sweep"
          label={t('drive.trashActions.emptyButton')}
          style={styles.fab}
          disabled={!isOnline}
          onPress={() => setEmptyDialogVisible(true)}
        />
      ) : null}
      <Portal>
        <Dialog
          visible={emptyDialogVisible}
          onDismiss={emptying ? undefined : () => setEmptyDialogVisible(false)}
          dismissable={!emptying}
        >
          <Dialog.Title>{t('drive.trashActions.emptyConfirmTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('drive.trashActions.emptyConfirmBody')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEmptyDialogVisible(false)} disabled={emptying}>
              {t('common.cancel')}
            </Button>
            <Button
              onPress={() => void handleEmpty()}
              loading={emptying}
              disabled={emptying}
              textColor={theme.colors.error}
            >
              {t('drive.trashActions.emptyConfirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' }
})
