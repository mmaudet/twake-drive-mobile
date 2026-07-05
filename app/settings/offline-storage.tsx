import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { Button, Divider, List, Switch, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { Downloader } from '@/offline/Downloader'
import { OfflineSettingsAPI } from '@/offline/offlineSettings'
import { reconcileFolderPins } from '@/offline/reconcileFolderPins'
import { formatFileSize } from '@/utils/formatters'
import type { OfflineFileEntry, OfflineFolderEntry } from '@/offline/types'

export default function OfflineStorageScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const [totalBytes, setTotalBytes] = useState<number>(0)
  const [files, setFiles] = useState<OfflineFileEntry[]>([])
  const [folders, setFolders] = useState<OfflineFolderEntry[]>([])
  const [wifiOnly, setWifiOnly] = useState<boolean>(OfflineSettingsAPI.get().wifiOnly)
  const [diskFull, setDiskFull] = useState<boolean>(OfflineSettingsAPI.status.get().diskFull)

  const refresh = async (): Promise<void> => {
    setFiles(OfflineFilesStore.getAll())
    setFolders(OfflineFilesStore.getAllFolders())
    setTotalBytes(await FileSystemRepo.totalBytes())
  }

  useEffect(() => {
    void refresh()
    // Reconcile any stale folder pins (folder entry survives, child file
    // entries were dropped) — they auto-repopulate.
    if (client) void reconcileFolderPins(client)
    const off1 = OfflineFilesStore.subscribeAll(() => void refresh())
    const off2 = OfflineSettingsAPI.subscribe(() => setWifiOnly(OfflineSettingsAPI.get().wifiOnly))
    const off3 = OfflineSettingsAPI.status.subscribe(() =>
      setDiskFull(OfflineSettingsAPI.status.get().diskFull)
    )
    return () => {
      off1()
      off2()
      off3()
    }
  }, [client])

  // Show every pinned file, regardless of how it was pinned (direct vs via folder).
  // The user expects to see what's actually cached, not just direct pins.
  const inProgress = useMemo(() => files.filter(f => f.state === 'downloading'), [files])
  const failed = useMemo(() => files.filter(f => f.state === 'failed'), [files])

  return (
    <ScreenContainer>
      <ScrollView>
        <List.Item title={t('drive.offline.totalUsed')} description={formatFileSize(totalBytes)} />
        <View style={styles.actionRow}>
          <Button
            mode="outlined"
            onPress={async () => {
              // Unpin every folder first so the auto-purge of any file pinned
              // only via that folder happens through unpinFolder's bookkeeping.
              for (const folder of OfflineFilesStore.getAllFolders()) {
                await OfflineFilesStore.unpinFolder(folder.dirId)
              }
              // Then purge any leftover directly-pinned files.
              for (const f of OfflineFilesStore.getAll()) {
                await OfflineFilesStore.purge(f.fileId)
              }
              await refresh()
            }}
          >
            {t('drive.offline.deleteAll')}
          </Button>
        </View>
        <Divider />
        <List.Item
          title={t('drive.offline.wifiOnly')}
          right={() => (
            <Switch value={wifiOnly} onValueChange={v => OfflineSettingsAPI.set({ wifiOnly: v })} />
          )}
        />
        {diskFull ? (
          <View style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}>
            <Text style={{ color: theme.colors.onErrorContainer }}>
              {t('drive.offline.diskFull')}
            </Text>
          </View>
        ) : null}
        {inProgress.length > 0 ? (
          <List.Item
            title={t('drive.offline.downloading')}
            description={`${files.length - inProgress.length}/${files.length}`}
          />
        ) : null}
        {failed.length > 0 ? (
          <List.Section title={t('drive.offline.errorsSection')}>
            {failed.map(f => (
              <List.Item
                key={f.fileId}
                title={f.name || f.fileId}
                description={f.lastError ?? t('drive.offline.failed')}
                right={() => (
                  <Button
                    mode="text"
                    onPress={() => {
                      OfflineFilesStore.update(f.fileId, e => ({
                        ...e,
                        retryCount: 0,
                        state: 'pending'
                      }))
                      Downloader.enqueue(f.fileId)
                    }}
                  >
                    {t('drive.offline.retry')}
                  </Button>
                )}
              />
            ))}
          </List.Section>
        ) : null}
        <List.Section title={t('drive.offline.foldersSection')}>
          {folders
            .slice()
            .sort((a, b) => b.pinnedAt - a.pinnedAt)
            .map(f => {
              const childEntries = files.filter(file => file.parentFolderPins.includes(f.dirId))
              const childBytes = childEntries.reduce((a, file) => a + file.size, 0)
              return (
                <List.Item
                  key={f.dirId}
                  title={f.name}
                  description={t('drive.offline.folderSummary', {
                    count: childEntries.length,
                    size: formatFileSize(childBytes)
                  })}
                  right={() => (
                    <Button mode="text" onPress={() => void OfflineFilesStore.unpinFolder(f.dirId)}>
                      {t('drive.offline.unpin')}
                    </Button>
                  )}
                />
              )
            })}
        </List.Section>
        <List.Section title={t('drive.offline.filesSection')}>
          {files
            .slice()
            .sort((a, b) => b.pinnedAt - a.pinnedAt)
            .map(f => {
              const isSuspect =
                f.state === 'downloaded' &&
                f.localBytes !== undefined &&
                f.size > 0 &&
                f.localBytes < f.size * 0.5
              const description = isSuspect
                ? `${formatFileSize(f.size)} (local: ${formatFileSize(f.localBytes)}) ⚠️`
                : formatFileSize(f.size)
              return (
                <List.Item
                  key={f.fileId}
                  title={f.name || f.fileId}
                  description={description}
                  right={() => (
                    <Button mode="text" onPress={() => void OfflineFilesStore.unpin(f.fileId)}>
                      {t('drive.offline.unpin')}
                    </Button>
                  )}
                />
              )
            })}
        </List.Section>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  actionRow: { paddingHorizontal: 16, paddingBottom: 8 },
  banner: { padding: 12, marginHorizontal: 16, marginVertical: 8, borderRadius: 8 }
})
