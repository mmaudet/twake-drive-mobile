import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useFocusEffect, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { RenameDialog } from '@/ui/RenameDialog'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { recentQuery, recentQueryAs, FileQueryResult } from '@/client/queries'
import { softDeleteEntry } from '@/files/deleteFile'
import { renameEntry } from '@/files/renameEntry'
import { openFileFromList } from '@/files/openFromList'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'

export default function RecentScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const query = useQuery(recentQuery(), { as: recentQueryAs })

  const queryRef = useRef(query)
  queryRef.current = query

  useFocusEffect(
    useCallback(() => {
      void queryRef.current.fetch()
    }, [])
  )

  const [pendingDelete, setPendingDelete] = useState<FileQueryResult | null>(null)
  const [pendingRename, setPendingRename] = useState<FileQueryResult | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const isOnline = useIsOnline()
  const offlineActions = useOfflineActions()
  const onToggleFilePin = (file: { _id: string; name: string; size?: number | null }): void => {
    const entry = OfflineFilesStore.get(file._id)
    if (entry?.isDirectPin) void offlineActions.unpin(file._id)
    else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }

  const confirmDelete = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingDelete) return
    setDeleting(true)
    try {
      await softDeleteEntry(client, {
        _id: pendingDelete._id,
        _rev: (pendingDelete as unknown as { _rev?: string })._rev,
        name: pendingDelete.name,
        type: pendingDelete.type
      })
      setSnackbar(t('drive.delete.successFile'))
      setPendingDelete(null)
      await query.fetch()
    } catch (e) {
      console.error('[RecentScreen] delete failed', e)
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  const submitRename = async (newName: string): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingRename) return
    await renameEntry(client, pendingRename._id, newName)
    setSnackbar(t('drive.rename.successFile'))
    setPendingRename(null)
    await query.fetch()
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => (
    <FileRow
      file={{ ...item, size: item.size ?? null }}
      onPress={file => {
        if (!client) return
        void openFileFromList(client, router, file).catch(e => {
          console.error('[RecentScreen] openFileFromList failed', e)
          setSnackbar((e as Error).message ?? t('drive.preview.loadFailed'))
        })
      }}
      onShare={file => {
        if (!requireOnline(isOnline, setSnackbar, t)) return
        router.push(`/share/${file._id}`)
      }}
      onRename={() => setPendingRename(item)}
      onDelete={() => setPendingDelete(item)}
      onMove={file => router.push(`/move/${file._id}`)}
      onTogglePin={onToggleFilePin}
      onInfo={file => router.push(`/metadata/${file._id}`)}
    />
  )

  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

  return (
    <ScreenContainer>
      <AppBar title={t('drive.recent')} onLogout={logout} />
      {query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={() => query.fetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.emptyRecent')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={query.fetchStatus === 'loading'}
              onRefresh={() => query.fetch()}
            />
          }
        />
      )}
      <ConfirmDeleteDialog
        visible={!!pendingDelete}
        target={pendingDelete}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => (deleting ? undefined : setPendingDelete(null))}
      />
      <RenameDialog
        visible={!!pendingRename}
        initialName={pendingRename?.name ?? ''}
        type={pendingRename?.type}
        onDismiss={() => setPendingRename(null)}
        onSubmit={submitRename}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
