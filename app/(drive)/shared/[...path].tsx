import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
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
  fileByIdQuery,
  fileByIdQueryAs,
  filesByIdsQuery,
  filesByIdsQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs,
  FileQueryResult
} from '@/client/queries'
import { useSharedFileIds } from '@/client/useSharedFiles'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'

export default function SharedScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const params = useLocalSearchParams<{ path?: string | string[] }>()
  const rawPath = params.path
  const path: string[] | undefined =
    rawPath === undefined
      ? undefined
      : Array.isArray(rawPath)
        ? rawPath.filter(s => !!s)
        : rawPath
          ? [rawPath]
          : undefined
  const [refreshing, setRefreshing] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const client = useClient()
  const offlineActions = useOfflineActions()
  const onToggleFilePin = (file: { _id: string; name: string; size?: number | null }): void => {
    const entry = OfflineFilesStore.get(file._id)
    if (entry?.isDirectPin) void offlineActions.unpin(file._id)
    else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }
  const onToggleFolderPin = (folder: { _id: string; name: string }): void => {
    if (OfflineFilesStore.getFolder(folder._id)) void offlineActions.unpinFolder(folder._id)
    else void offlineActions.pinFolder({ _id: folder._id, name: folder.name })
  }

  const isRoot = !path || path.length === 0
  const safeCurrentDirId = isRoot ? 'io.cozy.files.root-dir' : path![path!.length - 1]

  const sharedIds = useSharedFileIds()
  const sharedFilesQuery = useQuery(filesByIdsQuery(sharedIds.ids), {
    as: filesByIdsQueryAs(sharedIds.ids),
    enabled: isRoot && sharedIds.status === 'loaded' && sharedIds.ids.length > 0
  })

  const subfoldersQuery = useQuery(folderSubfoldersQuery(safeCurrentDirId), {
    as: folderSubfoldersQueryAs(safeCurrentDirId),
    enabled: !isRoot
  })
  const folderFilesQ = useQuery(folderFilesQuery(safeCurrentDirId), {
    as: folderFilesQueryAs(safeCurrentDirId),
    enabled: !isRoot
  })

  const currentDirLookup = useQuery(fileByIdQuery(safeCurrentDirId), {
    as: fileByIdQueryAs(safeCurrentDirId),
    enabled: !isRoot
  })

  const sharedIdsRef = useRef(sharedIds)
  const sharedFilesQueryRef = useRef(sharedFilesQuery)
  const subfoldersQueryRef = useRef(subfoldersQuery)
  const folderFilesQRef = useRef(folderFilesQ)
  sharedIdsRef.current = sharedIds
  sharedFilesQueryRef.current = sharedFilesQuery
  subfoldersQueryRef.current = subfoldersQuery
  folderFilesQRef.current = folderFilesQ

  useFocusEffect(
    useCallback(() => {
      if (isRoot) {
        sharedIdsRef.current.refresh()
        void sharedFilesQueryRef.current.fetch?.()
      } else {
        void subfoldersQueryRef.current.fetch()
        void folderFilesQRef.current.fetch()
      }
    }, [isRoot])
  )

  const lookupData = currentDirLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const currentDirName = isRoot
    ? t('drive.shared')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (isRoot) {
        sharedIds.refresh()
        await sharedFilesQuery.fetch?.()
      } else {
        await Promise.all([subfoldersQuery.fetch(), folderFilesQ.fetch()])
      }
    } finally {
      setRefreshing(false)
    }
  }, [isRoot, sharedIds, sharedFilesQuery, subfoldersQuery, folderFilesQ])

  const renderFileItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={folder =>
            router.push(`/(drive)/shared/${[...(path ?? []), folder._id].join('/')}`)
          }
          onShare={folder => router.push(`/share/${folder._id}`)}
          onMove={folder => router.push(`/move/${folder._id}`)}
          onTogglePin={onToggleFolderPin}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(e =>
            surfaceOpenError(e, setSnackbar, t, 'SharedScreen')
          )
        }}
        onShare={file => router.push(`/share/${file._id}`)}
        onMove={file => router.push(`/move/${file._id}`)}
        onTogglePin={onToggleFilePin}
        onInfo={file => router.push(`/metadata/${file._id}`)}
      />
    )
  }

  const folderListing: FileQueryResult[] = isRoot
    ? []
    : [
        ...((subfoldersQuery.data as FileQueryResult[] | null | undefined) ?? []),
        ...((folderFilesQ.data as FileQueryResult[] | null | undefined) ?? [])
      ]
  const data: FileQueryResult[] = isRoot
    ? ((sharedFilesQuery.data as FileQueryResult[] | null | undefined) ?? [])
    : folderListing

  const isLoading = isRoot
    ? sharedIds.status === 'loading' ||
      (sharedIds.status === 'loaded' &&
        sharedIds.ids.length > 0 &&
        sharedFilesQuery.fetchStatus === 'loading' &&
        data.length === 0)
    : subfoldersQuery.fetchStatus === 'loading' || folderFilesQ.fetchStatus === 'loading'
  // Note: SharingProvider swallows its own fetch errors, so sharedIds no
  // longer surfaces a 'failed' state — failures of the secondary
  // filesByIdsQuery fetch still drive the failed UI here.
  const isFailed = isRoot
    ? sharedFilesQuery.fetchStatus === 'failed'
    : subfoldersQuery.fetchStatus === 'failed' || folderFilesQ.fetchStatus === 'failed'
  const error = isRoot
    ? sharedFilesQuery.lastError
    : (subfoldersQuery.lastError ?? folderFilesQ.lastError)
  const hasNothingYet = data.length === 0
  const retry = () => {
    if (isRoot) {
      sharedIds.refresh()
      void sharedFilesQuery.fetch?.()
    } else {
      void subfoldersQuery.fetch()
      void folderFilesQ.fetch()
    }
  }

  return (
    <ScreenContainer>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
        showSearch
      />
      {isLoading && hasNothingYet ? (
        <LoadingState />
      ) : isFailed ? (
        <ErrorState message={t(getErrorMessageKey(error))} onRetry={retry} />
      ) : hasNothingYet ? (
        <EmptyState message={t('drive.emptyShared')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderFileItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.5}
          onEndReached={
            isRoot
              ? undefined
              : () => {
                  void subfoldersQuery.fetchMore?.()
                  void folderFilesQ.fetchMore?.()
                }
          }
        />
      )}
      <BigFolderConfirmDialog
        visible={!!offlineActions.pendingConfirmation}
        count={offlineActions.pendingConfirmation?.count ?? 0}
        bytes={offlineActions.pendingConfirmation?.bytes ?? 0}
        onConfirm={() => void offlineActions.confirmPending()}
        onCancel={offlineActions.cancelPending}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { paddingVertical: 4 }
})
