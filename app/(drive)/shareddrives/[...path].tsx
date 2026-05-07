import React, { useCallback, useRef, useState } from 'react'
import { FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'
import { Snackbar } from 'react-native-paper'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { ShareSheet, ShareSheetHandle } from '@/ui/ShareSheet'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { fetchShortcutTarget, fetchShortcutUrl } from '@/files/shortcuts'
import { isShortcutFile } from '@/files/fileTypes'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  folderContentsQuery,
  folderContentsQueryAs,
  SHARED_DRIVES_DIR_ID,
  FileQueryResult
} from '@/client/queries'

const stripUrlExt = (name: string): string => name.replace(/\.url$/i, '')

export default function SharedDrivesScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
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
  const shareRef = useRef<ShareSheetHandle>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const isRoot = !path || path.length === 0
  const currentDirId = isRoot ? SHARED_DRIVES_DIR_ID : path![path!.length - 1]

  const query = useQuery(folderContentsQuery(currentDirId), {
    as: folderContentsQueryAs(currentDirId)
  })

  const currentDirLookup = useQuery(fileByIdQuery(currentDirId), {
    as: fileByIdQueryAs(currentDirId),
    enabled: !isRoot
  })
  const lookupData = currentDirLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const currentDirName = isRoot
    ? t('drive.sharedDrives')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await query.fetch()
    } finally {
      setRefreshing(false)
    }
  }, [query])

  // Each child of shared-drives-dir is a `.url` shortcut whose
  // metadata.target._id is the drive's root folder. We resolve lazily on tap
  // so the listing stays cheap, then push that root folder onto our stack.
  const onDrivePress = useCallback(
    async (shortcut: FileQueryResult) => {
      if (!client) return
      try {
        const target = await fetchShortcutTarget(client, shortcut._id)
        if (target?._id) {
          router.push(`/(drive)/shareddrives/${target._id}`)
          return
        }
        // No same-instance target — fall back to opening the URL externally
        // (matches the web's ExternalRedirect behavior).
        const url = await fetchShortcutUrl(client, shortcut._id)
        if (url) {
          await Linking.openURL(url)
          return
        }
        setResolveError(t('errors.generic'))
      } catch (e) {
        console.error('[SharedDrives] resolve shortcut failed', e)
        setResolveError(t('errors.generic'))
      }
    },
    [client, router, t]
  )

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (isRoot && isShortcutFile(item)) {
      return (
        <FolderRow
          folder={{ ...item, name: stripUrlExt(item.name) }}
          onPress={() => onDrivePress(item)}
          onShare={folder =>
            shareRef.current?.present({
              _id: item._id,
              name: folder.name,
              type: 'directory'
            })
          }
        />
      )
    }
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={folder =>
            router.push(`/(drive)/shareddrives/${[...(path ?? []), folder._id].join('/')}`)
          }
          onShare={folder =>
            shareRef.current?.present({
              _id: folder._id,
              name: folder.name,
              type: 'directory'
            })
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
        title={currentDirName}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
      />
      {query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={() => query.fetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.emptySharedDrives')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => query.fetchMore?.()}
        />
      )}
      <FileMetadataSheet
        ref={sheetRef}
        onShareRequested={file => shareRef.current?.present(file)}
      />
      <ShareSheet ref={shareRef} />
      <Snackbar
        visible={!!resolveError}
        onDismiss={() => setResolveError(null)}
        duration={3000}
      >
        {resolveError ?? ''}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
