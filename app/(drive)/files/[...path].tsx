import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { FAB } from 'react-native-paper'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { CreateFolderDialog } from '@/ui/CreateFolderDialog'
import { CreateOfficeFileDialog } from '@/ui/CreateOfficeFileDialog'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { createFolder } from '@/files/createFolder'
import { createOfficeFile, OfficeFileClass } from '@/files/createOfficeFile'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  folderContentsQuery,
  folderContentsQueryAs,
  ROOT_DIR_ID,
  FileQueryResult
} from '@/client/queries'

export default function FilesScreen() {
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
  const [createFolderVisible, setCreateFolderVisible] = useState(false)
  const [creatingClass, setCreatingClass] = useState<OfficeFileClass | null>(null)
  const [fabOpen, setFabOpen] = useState(false)
  const client = useClient()

  const isRoot = !path || path.length === 0
  const currentDirId = isRoot ? ROOT_DIR_ID : path![path!.length - 1]

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
    ? t('drive.myFiles')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await query.fetch()
    } finally {
      setRefreshing(false)
    }
  }, [query])

  const handleCreate = async (name: string) => {
    if (!client) throw new Error('No client')
    await createFolder(client, name, currentDirId)
    setCreateFolderVisible(false)
    await query.fetch()
  }

  const handleCreateOffice = async (name: string) => {
    if (!client || !creatingClass) throw new Error('No client or class')
    const cls = creatingClass
    const created = await createOfficeFile(client, cls, name, currentDirId)
    setCreatingClass(null)
    await query.fetch()
    router.push(`/(drive)/onlyoffice/${created._id}`)
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={folder =>
            router.push(`/(drive)/files/${[...(path ?? []), folder._id].join('/')}`)
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
        <EmptyState message={t('drive.emptyFolder')} />
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
      <FileMetadataSheet ref={sheetRef} />
      <FAB.Group
        open={fabOpen}
        visible
        icon={fabOpen ? 'close' : 'plus'}
        actions={[
          {
            icon: 'folder-plus',
            label: t('drive.createMenu.folder'),
            onPress: () => setCreateFolderVisible(true)
          },
          {
            icon: 'file-document-outline',
            label: t('drive.createMenu.text'),
            onPress: () => setCreatingClass('text')
          },
          {
            icon: 'file-table-outline',
            label: t('drive.createMenu.sheet'),
            onPress: () => setCreatingClass('sheet')
          },
          {
            icon: 'file-presentation-box',
            label: t('drive.createMenu.slide'),
            onPress: () => setCreatingClass('slide')
          }
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
      />
      <CreateFolderDialog
        visible={createFolderVisible}
        onDismiss={() => setCreateFolderVisible(false)}
        onSubmit={handleCreate}
      />
      <CreateOfficeFileDialog
        visible={creatingClass !== null}
        fileClass={creatingClass}
        onDismiss={() => setCreatingClass(null)}
        onSubmit={handleCreateOffice}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
