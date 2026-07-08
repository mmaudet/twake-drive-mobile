import React, { useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Appbar, Button, Portal, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { CreateFolderDialog } from '@/ui/CreateFolderDialog'
import { createFolder } from '@/files/createFolder'
import {
  FileQueryResult,
  fileByIdQuery,
  fileByIdQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs
} from '@/client/queries'

import { FolderPickerRow, FolderPickerRowItem } from './FolderPickerRow'

export interface FolderPickerSelection {
  _id: string
  name: string
}

export interface FolderPickerProps {
  currentFolderId: string
  excludeIds: Set<string>
  confirmLabel: string
  isBusy: boolean
  isAtRoot: boolean
  onDrillIn: (item: FolderPickerRowItem) => void
  onBack: () => void
  onConfirm: (folder: FolderPickerSelection) => void
  onCancel: () => void
}

export const FolderPicker = ({
  currentFolderId,
  excludeIds,
  confirmLabel,
  isBusy,
  isAtRoot,
  onDrillIn,
  onBack,
  onConfirm,
  onCancel
}: FolderPickerProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const [creatingFolder, setCreatingFolder] = useState(false)

  const folderLookup = useQuery(fileByIdQuery(currentFolderId), {
    as: fileByIdQueryAs(currentFolderId)
  })
  const folderDoc = (
    Array.isArray(folderLookup.data) ? folderLookup.data[0] : folderLookup.data
  ) as FileQueryResult | null | undefined

  const subfoldersQuery = useQuery(folderSubfoldersQuery(currentFolderId), {
    as: folderSubfoldersQueryAs(currentFolderId)
  })
  const filesQuery = useQuery(folderFilesQuery(currentFolderId), {
    as: folderFilesQueryAs(currentFolderId)
  })

  const subfolders = (subfoldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  const files = (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  const items: FolderPickerRowItem[] = [
    ...subfolders.map(d => ({ _id: d._id, name: d.name, type: 'directory' as const })),
    ...files.map(f => ({ _id: f._id, name: f.name, type: 'file' as const }))
  ]

  const isLoading =
    (folderLookup.fetchStatus === 'loading' && !folderDoc) ||
    (subfoldersQuery.fetchStatus === 'loading' && subfolders.length === 0)
  const hasError = folderLookup.fetchStatus === 'failed' || subfoldersQuery.fetchStatus === 'failed'

  const title = folderDoc?.name ?? ''

  const handleDrillIn = (item: FolderPickerRowItem): void => {
    if (item.type !== 'directory') return
    onDrillIn(item)
  }

  const handleCreateFolder = async (name: string): Promise<void> => {
    if (!client) throw new Error('No client')
    const created = await createFolder(client, name, currentFolderId)
    setCreatingFolder(false)
    // Auto-drill into the new folder via the router
    onDrillIn({ _id: created._id, name: created.name, type: 'directory' })
    void subfoldersQuery.fetch()
  }

  const confirmDisabled = isBusy || excludeIds.has(currentFolderId)

  return (
    // Portal.Host scopes Paper's <Portal> (used by CreateFolderDialog) to the
    // picker's view tree. Without it, the dialog mounts into the app-level
    // PortalHost (below the iOS native pageSheet), and the user only sees the
    // dimmed backdrop without the dialog itself.
    <Portal.Host>
      <ScreenContainer>
        {/* statusBarHeight={0}: inside a pageSheet the modal already starts
            below the system status bar, so Paper's default top inset
            doubles up the spacing. */}
        <Appbar.Header statusBarHeight={0}>
          {isAtRoot ? null : (
            <Appbar.Action
              isLeading
              animated={false}
              icon={p => (
                <CozyIcon name="previous" size={p?.size ?? 24} color={theme.colors.onSurface} />
              )}
              onPress={onBack}
              accessibilityLabel={t('common.back')}
            />
          )}
          <Appbar.Content title={title} />
          <Appbar.Action
            icon={p => <CozyIcon name="folderAdd" size={p?.size ?? 24} color={p?.color} />}
            accessibilityLabel={t('drive.move.newFolder')}
            onPress={() => setCreatingFolder(true)}
          />
        </Appbar.Header>
        {hasError ? (
          <ErrorState
            message={t('drive.preview.loadFailed')}
            onRetry={() => {
              void folderLookup.fetch()
              void subfoldersQuery.fetch()
              void filesQuery.fetch()
            }}
          />
        ) : isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState message={t('drive.emptyFolder')} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={i => i._id}
            renderItem={({ item }) => (
              <FolderPickerRow
                item={item}
                disabled={item.type === 'file' || excludeIds.has(item._id)}
                onPress={handleDrillIn}
              />
            )}
          />
        )}
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.colors.surfaceVariant, borderTopColor: theme.colors.outline }
          ]}
        >
          <Button mode="outlined" onPress={onCancel} style={styles.footerButton}>
            {t('common.cancel')}
          </Button>
          <Button
            mode="contained"
            testID="folder-picker-confirm"
            disabled={confirmDisabled}
            loading={isBusy}
            onPress={() => onConfirm({ _id: currentFolderId, name: title })}
            style={styles.footerButton}
          >
            {confirmLabel}
          </Button>
        </View>
        <CreateFolderDialog
          visible={creatingFolder}
          onDismiss={() => setCreatingFolder(false)}
          onSubmit={handleCreateFolder}
        />
      </ScreenContainer>
    </Portal.Host>
  )
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  footerButton: { flex: 1 }
})
