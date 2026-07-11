import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native'
import { FAB, Snackbar } from 'react-native-paper'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileGridItem } from '@/ui/FileGridItem'
import { ViewSwitcher } from '@/ui/ViewSwitcher'
import { useViewMode } from '@/ui/useViewMode'
import { SortControl } from '@/ui/SortControl'
import { useFolderSort } from '@/ui/useFolderSort'
import { CreateFolderDialog } from '@/ui/CreateFolderDialog'
import { SyncBanner } from '@/ui/SyncBanner'
import { CreateOfficeFileDialog } from '@/ui/CreateOfficeFileDialog'
import { CreateShortcutDialog } from '@/ui/CreateShortcutDialog'
import { CozyIcon } from '@/ui/icons/CozyIcon'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { RenameDialog } from '@/ui/RenameDialog'
import { useMultiSelect } from '@/ui/useMultiSelect'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { createFolder } from '@/files/createFolder'
import { createCozyNote } from '@/files/createCozyNote'
import { createOfficeFile, OfficeFileClass } from '@/files/createOfficeFile'
import { createShortcut } from '@/files/createShortcut'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { useSessionCode } from '@/auth/useSessionCode'
import { softDeleteEntry } from '@/files/deleteFile'
import { optimisticFiles } from '@/files/optimisticFiles'
import { renameEntry } from '@/files/renameEntry'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'
import { useFlag } from '@/client/useFlag'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  FileQueryResult
} from '@/client/queries'

export default function FilesScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const fetchSessionCode = useSessionCode()
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
  const [createFolderVisible, setCreateFolderVisible] = useState(false)
  const [creatingClass, setCreatingClass] = useState<OfficeFileClass | null>(null)
  const [createShortcutVisible, setCreateShortcutVisible] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FileQueryResult | null>(null)
  const [pendingRename, setPendingRename] = useState<FileQueryResult | null>(null)
  const [bulkConfirmVisible, setBulkConfirmVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const { mode } = useViewMode()
  const { sort } = useFolderSort()
  const selection = useMultiSelect()
  const offlineActions = useOfflineActions()
  const onToggleFilePin = useCallback(
    (file: { _id: string; name: string; size?: number | null }) => {
      const entry = OfflineFilesStore.get(file._id)
      if (entry?.isDirectPin) void offlineActions.unpin(file._id)
      else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
    },
    [offlineActions]
  )
  const onToggleFolderPin = useCallback(
    (folder: { _id: string; name: string }) => {
      if (OfflineFilesStore.getFolder(folder._id)) void offlineActions.unpinFolder(folder._id)
      else void offlineActions.pinFolder({ _id: folder._id, name: folder.name })
    },
    [offlineActions]
  )
  const client = useClient()
  const docsEnabled = !!useFlag('drive.lasuitedocs.enabled')
  const isOnline = useIsOnline()

  const isRoot = !path || path.length === 0
  const currentDirId = isRoot ? ROOT_DIR_ID : path![path!.length - 1]

  const foldersQuery = useQuery(folderSubfoldersQuery(currentDirId), {
    as: folderSubfoldersQueryAs(currentDirId)
  })
  const filesQuery = useQuery(folderFilesQuery(currentDirId), {
    as: folderFilesQueryAs(currentDirId)
  })

  const currentDirLookup = useQuery(fileByIdQuery(currentDirId), {
    as: fileByIdQueryAs(currentDirId),
    enabled: !isRoot
  })

  const lookupData = currentDirLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const currentDirName = isRoot
    ? t('drive.myDrive')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([foldersQuery.fetch(), filesQuery.fetch()])
    } finally {
      setRefreshing(false)
    }
  }, [foldersQuery, filesQuery])

  const handleCreate = async (name: string) => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) throw new Error('No client')
    await createFolder(client, name, currentDirId)
    setCreateFolderVisible(false)
    await Promise.all([foldersQuery.fetch(), filesQuery.fetch()])
  }

  const handleCreateOffice = async (name: string) => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !creatingClass) throw new Error('No client or class')
    const cls = creatingClass
    const created = await createOfficeFile(client, cls, name, currentDirId)
    setCreatingClass(null)
    await Promise.all([foldersQuery.fetch(), filesQuery.fetch()])
    router.push(`/onlyoffice/${created._id}`)
  }

  const handleCreateNote = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    try {
      const created = await createCozyNote(client, currentDirId)
      await Promise.all([foldersQuery.fetch(), filesQuery.fetch()])
      router.push(`/note/${created._id}`)
    } catch (e) {
      console.error('[FilesScreen] note creation failed', e)
    }
  }

  const handleCreateDocs = (): void => {
    router.push(`/docs/new/${currentDirId}`)
  }

  const handleCreateExcalidraw = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    try {
      const sessionCode = await fetchSessionCode()
      const stackUri = (client.getStackClient() as unknown as { uri: string }).uri
      // Open the Cozy excalidraw web app; it handles file creation and
      // saves into dirId via its own UI. Pragmatic approach: no server-side
      // file is pre-created — the excalidraw app owns the create flow.
      const url = buildCozyAppUrl(stackUri, 'excalidraw', sessionCode, '/')
      await Linking.openURL(url)
    } catch (e) {
      console.error('[FilesScreen] excalidraw open failed', e)
    }
  }

  const handleCreateShortcut = async (name: string, url: string): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) throw new Error('No client')
    await createShortcut(client, currentDirId, name, url)
    setCreateShortcutVisible(false)
    await Promise.all([foldersQuery.fetch(), filesQuery.fetch()])
  }

  const requestDelete = (entry: FileQueryResult): void => {
    setPendingDelete(entry)
  }

  const requestRename = (entry: FileQueryResult): void => {
    setPendingRename(entry)
  }

  const submitRename = async (newName: string): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingRename) return
    const doc = pendingRename
    const revert = optimisticFiles(client, [{ ...doc, name: newName }])
    setPendingRename(null)
    try {
      await renameEntry(client, doc._id, newName)
      setSnackbar(
        t(doc.type === 'directory' ? 'drive.rename.successFolder' : 'drive.rename.successFile')
      )
    } catch (e) {
      revert()
      throw e
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingDelete) return
    const doc = pendingDelete
    const revert = optimisticFiles(client, [{ ...doc, dir_id: TRASH_DIR_ID }])
    setPendingDelete(null)
    setDeleting(true)
    try {
      await softDeleteEntry(client, {
        _id: doc._id,
        _rev: (doc as unknown as { _rev?: string })._rev,
        name: doc.name,
        type: doc.type
      })
      setSnackbar(
        t(doc.type === 'directory' ? 'drive.delete.successFolder' : 'drive.delete.successFile')
      )
    } catch (e) {
      console.error('[FilesScreen] delete failed', e)
      revert()
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  const confirmBulkDelete = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    const items = data.filter(d => selection.isSelected(d._id))
    if (items.length === 0) return
    const revert = optimisticFiles(
      client,
      items.map(item => ({ ...item, dir_id: TRASH_DIR_ID }))
    )
    selection.clear()
    setBulkConfirmVisible(false)
    setDeleting(true)
    try {
      // Sequential rather than parallel: cozy-stack can race on concurrent
      // dir_id mutations and we want to surface any single failure.
      for (const item of items) {
        await softDeleteEntry(client, {
          _id: item._id,
          _rev: (item as unknown as { _rev?: string })._rev,
          name: item.name,
          type: item.type
        })
      }
      setSnackbar(t('drive.delete.successBulk', { count: items.length }))
    } catch (e) {
      console.error('[FilesScreen] bulk delete failed', e)
      revert()
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    const isSelected = selection.isSelected(item._id)
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          selected={isSelected}
          onPress={folder => {
            if (selection.isSelecting) selection.toggle(folder._id)
            else router.push(`/(drive)/files/${[...(path ?? []), folder._id].join('/')}`)
          }}
          onLongPress={folder => selection.select(folder._id)}
          onShare={
            selection.isSelecting
              ? undefined
              : folder => {
                  if (!requireOnline(isOnline, setSnackbar, t)) return
                  router.push(`/share/${folder._id}`)
                }
          }
          onRename={selection.isSelecting ? undefined : () => requestRename(item)}
          onDelete={selection.isSelecting ? undefined : () => requestDelete(item)}
          onMove={selection.isSelecting ? undefined : folder => router.push(`/move/${folder._id}`)}
          onTogglePin={selection.isSelecting ? undefined : onToggleFolderPin}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        selected={isSelected}
        onPress={file => {
          if (selection.isSelecting) {
            selection.toggle(file._id)
            return
          }
          if (!client) return
          void openFileFromList(client, router, file).catch(e =>
            surfaceOpenError(e, setSnackbar, t, 'FilesScreen')
          )
        }}
        onLongPress={file => selection.select(file._id)}
        onShare={
          selection.isSelecting
            ? undefined
            : file => {
                if (!requireOnline(isOnline, setSnackbar, t)) return
                router.push(`/share/${file._id}`)
              }
        }
        onRename={selection.isSelecting ? undefined : () => requestRename(item)}
        onDelete={selection.isSelecting ? undefined : () => requestDelete(item)}
        onMove={selection.isSelecting ? undefined : file => router.push(`/move/${file._id}`)}
        onTogglePin={selection.isSelecting ? undefined : onToggleFilePin}
        onInfo={selection.isSelecting ? undefined : file => router.push(`/metadata/${file._id}`)}
      />
    )
  }

  const renderGridItem = ({ item }: { item: FileQueryResult }) => {
    if (item._id.startsWith('__ph_')) return <View style={styles.gridPlaceholder} />
    const isSelected = selection.isSelected(item._id)
    return (
      <FileGridItem
        file={item}
        selected={isSelected}
        onPress={file => {
          if (selection.isSelecting) {
            selection.toggle(file._id)
            return
          }
          if (item.type === 'directory') {
            router.push(`/(drive)/files/${[...(path ?? []), file._id].join('/')}`)
          } else {
            if (!client) return
            void openFileFromList(client, router, file).catch(e =>
              surfaceOpenError(e, setSnackbar, t, 'FilesScreen')
            )
          }
        }}
        onLongPress={file => selection.select(file._id)}
      />
    )
  }

  // Folders first, then files — same display order as twake-drive-web.
  const folderDocs = (foldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  const fileDocs = (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  // shared-drives-dir + trash-dir are already filtered server-side by
  // buildDriveQuery (see src/client/queries.ts).
  // Sort within each group (folders / files) separately to preserve grouping.
  const data = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const sorted = (arr: FileQueryResult[]) =>
      [...arr].sort(
        (a, b) => dir * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    return [...sorted(folderDocs), ...sorted(fileDocs)]
  }, [folderDocs, fileDocs, sort.dir])

  // In grid mode, pad the last row to a full 3 columns with invisible
  // placeholders so a lone item stays left-aligned (flex:1 would otherwise
  // stretch it across the whole row).
  const gridData = useMemo<FileQueryResult[]>(() => {
    if (mode !== 'grid') return data
    const remainder = data.length % 3
    if (remainder === 0) return data
    const pad = Array.from(
      { length: 3 - remainder },
      (_, i) => ({ _id: `__ph_${i}` }) as FileQueryResult
    )
    return [...data, ...pad]
  }, [data, mode])

  const fabActions = [
    {
      icon: 'folder-plus',
      label: t('drive.createMenu.folder'),
      onPress: () => setCreateFolderVisible(true)
    },
    {
      icon: 'note-text',
      label: t('drive.createMenu.note'),
      onPress: () => void handleCreateNote()
    },
    ...(docsEnabled
      ? [
          {
            icon: 'file-document-edit',
            label: t('drive.createMenu.docs'),
            onPress: () => handleCreateDocs()
          }
        ]
      : []),
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
    },
    {
      icon: (p: { size: number; color?: string }) => (
        <CozyIcon name="excalidraw" size={p.size} color={p.color} />
      ),
      label: t('drive.createMenu.excalidraw'),
      onPress: () => void handleCreateExcalidraw()
    },
    {
      icon: (p: { size: number; color?: string }) => (
        <CozyIcon name="deviceBrowser" size={p.size} color={p.color} />
      ),
      label: t('drive.createMenu.shortcut'),
      onPress: () => setCreateShortcutVisible(true)
    }
  ]

  return (
    <ScreenContainer>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
        showSearch
        selection={
          selection.isSelecting
            ? {
                count: selection.count,
                onCancel: () => selection.clear(),
                actions: [
                  {
                    icon: 'folder-move-outline',
                    onPress: () => {
                      const ids = data
                        .filter(d => selection.isSelected(d._id))
                        .map(d => d._id)
                        .join(',')
                      if (ids) {
                        selection.clear()
                        router.push(`/move/${ids}`)
                      }
                    },
                    accessibilityLabel: t('drive.selection.move')
                  },
                  {
                    icon: 'trash-can-outline',
                    onPress: () => setBulkConfirmVisible(true),
                    accessibilityLabel: t('drive.fileMeta.delete'),
                    destructive: true,
                    testID: 'selection-delete'
                  }
                ]
              }
            : undefined
        }
      />
      <View style={styles.toolbar}>
        <SortControl />
        <ViewSwitcher />
      </View>
      <View style={styles.content}>
        <SyncBanner />
        {(foldersQuery.fetchStatus === 'loading' || filesQuery.fetchStatus === 'loading') &&
        data.length === 0 ? (
          <LoadingState />
        ) : foldersQuery.fetchStatus === 'failed' || filesQuery.fetchStatus === 'failed' ? (
          <ErrorState
            message={t(getErrorMessageKey(foldersQuery.lastError ?? filesQuery.lastError))}
            onRetry={() => {
              void foldersQuery.fetch()
              void filesQuery.fetch()
            }}
          />
        ) : data.length === 0 ? (
          <EmptyState message={t('drive.emptyFolder')} />
        ) : (
          <FlatList
            key={mode}
            data={mode === 'grid' ? gridData : data}
            keyExtractor={item => item._id}
            numColumns={mode === 'grid' ? 3 : undefined}
            renderItem={mode === 'grid' ? renderGridItem : renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              void foldersQuery.fetchMore?.()
              void filesQuery.fetchMore?.()
            }}
          />
        )}
      </View>
      <BigFolderConfirmDialog
        visible={!!offlineActions.pendingConfirmation}
        count={offlineActions.pendingConfirmation?.count ?? 0}
        bytes={offlineActions.pendingConfirmation?.bytes ?? 0}
        onConfirm={() => void offlineActions.confirmPending()}
        onCancel={offlineActions.cancelPending}
      />
      <FAB.Group
        testID="drive-fab"
        open={fabOpen}
        visible={!selection.isSelecting && isOnline}
        icon={fabOpen ? 'close' : 'plus'}
        actions={fabActions}
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
      <CreateShortcutDialog
        visible={createShortcutVisible}
        onDismiss={() => setCreateShortcutVisible(false)}
        onSubmit={handleCreateShortcut}
      />
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
      <ConfirmDeleteDialog
        visible={bulkConfirmVisible}
        bulkCount={selection.count}
        loading={deleting}
        onConfirm={() => void confirmBulkDelete()}
        onDismiss={() => (deleting ? undefined : setBulkConfirmVisible(false))}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  gridPlaceholder: { flex: 1, margin: 4 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4
  }
})
