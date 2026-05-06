import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  filesByIdsQuery,
  filesByIdsQueryAs,
  folderContentsQuery,
  folderContentsQueryAs,
  FileQueryResult
} from '@/client/queries'
import { useSharedFileIds } from '@/client/useSharedFiles'

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
  const sheetRef = useRef<FileMetadataSheetHandle>(null)
  const [refreshing, setRefreshing] = useState(false)

  const isRoot = !path || path.length === 0
  const safeCurrentDirId = isRoot ? 'io.cozy.files.root-dir' : path![path!.length - 1]

  const sharedIds = useSharedFileIds()
  const sharedFilesQuery = useQuery(filesByIdsQuery(sharedIds.ids), {
    as: filesByIdsQueryAs(sharedIds.ids),
    enabled: isRoot && sharedIds.status === 'loaded' && sharedIds.ids.length > 0
  })

  const folderQuery = useQuery(folderContentsQuery(safeCurrentDirId), {
    as: folderContentsQueryAs(safeCurrentDirId),
    enabled: !isRoot
  })

  const currentDirLookup = useQuery(fileByIdQuery(safeCurrentDirId), {
    as: fileByIdQueryAs(safeCurrentDirId),
    enabled: !isRoot
  })
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
        await folderQuery.fetch()
      }
    } finally {
      setRefreshing(false)
    }
  }, [isRoot, sharedIds, sharedFilesQuery, folderQuery])

  const renderFileItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={folder =>
            router.push(`/(drive)/shared/${[...(path ?? []), folder._id].join('/')}`)
          }
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          sheetRef.current?.present({
            ...file,
            cozyMetadata: item.cozyMetadata,
            path: item.path
          })
        }}
      />
    )
  }

  const data: FileQueryResult[] = isRoot
    ? ((sharedFilesQuery.data as FileQueryResult[] | null | undefined) ?? [])
    : ((folderQuery.data as FileQueryResult[] | null | undefined) ?? [])

  const isLoading = isRoot
    ? sharedIds.status === 'loading' ||
      (sharedIds.status === 'loaded' &&
        sharedIds.ids.length > 0 &&
        sharedFilesQuery.fetchStatus === 'loading' &&
        data.length === 0)
    : folderQuery.fetchStatus === 'loading'
  const isFailed = isRoot
    ? sharedIds.status === 'failed' || sharedFilesQuery.fetchStatus === 'failed'
    : folderQuery.fetchStatus === 'failed'
  const error = isRoot
    ? (sharedIds.error ?? sharedFilesQuery.lastError)
    : folderQuery.lastError
  const hasNothingYet = data.length === 0
  const retry = () => {
    if (isRoot) {
      sharedIds.refresh()
      void sharedFilesQuery.fetch?.()
    } else {
      void folderQuery.fetch()
    }
  }

  return (
    <View style={styles.container}>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
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
          onEndReached={isRoot ? undefined : () => folderQuery.fetchMore?.()}
        />
      )}
      <FileMetadataSheet ref={sheetRef} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { paddingVertical: 4 }
})
