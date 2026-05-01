import React, { useMemo, useRef } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { Breadcrumb, BreadcrumbSegment } from '@/ui/Breadcrumb'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import {
  folderContentsQuery,
  folderContentsQueryAs,
  sharedWithMeQuery,
  sharedWithMeQueryAs,
  FileQueryResult
} from '@/client/queries'

export default function SharedScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const params = useLocalSearchParams<{ path?: string[] }>()
  const path = params.path as string[] | undefined
  const sheetRef = useRef<FileMetadataSheetHandle>(null)

  const isRoot = !path || path.length === 0

  const segments = useMemo<BreadcrumbSegment[]>(() => {
    const list: BreadcrumbSegment[] = [{ id: 'root', name: t('drive.shared') }]
    if (path) for (const id of path) list.push({ id })
    return list
  }, [path, t])

  const query = useQuery(
    isRoot ? sharedWithMeQuery() : folderContentsQuery(path[path.length - 1]),
    { as: isRoot ? sharedWithMeQueryAs : folderContentsQueryAs(path[path.length - 1]) }
  )

  const onSegmentPress = (index: number) => {
    if (index === 0) router.dismissAll()
    else router.dismissTo(`/(drive)/shared/${path?.slice(0, index).join('/')}`)
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => {
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
        onPress={file =>
          sheetRef.current?.present({
            ...file,
            cozyMetadata: item.cozyMetadata,
            path: item.path
          })
        }
      />
    )
  }

  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

  return (
    <View style={styles.container}>
      <AppBar
        title={
          isRoot
            ? t('drive.shared')
            : (segments[segments.length - 1].name ?? segments[segments.length - 1].id)
        }
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
      />
      {!isRoot ? <Breadcrumb segments={segments} onSegmentPress={onSegmentPress} /> : null}
      {query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={() => query.fetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.emptyShared')} />
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
          onEndReachedThreshold={0.5}
          onEndReached={() => query.fetchMore?.()}
        />
      )}
      <FileMetadataSheet ref={sheetRef} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
