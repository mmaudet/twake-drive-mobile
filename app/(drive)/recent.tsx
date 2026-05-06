import React, { useRef } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { recentQuery, recentQueryAs, FileQueryResult } from '@/client/queries'

export default function RecentScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const sheetRef = useRef<FileMetadataSheetHandle>(null)
  const query = useQuery(recentQuery(), { as: recentQueryAs })

  const renderItem = ({ item }: { item: FileQueryResult }) => (
    <FileRow
      file={{ ...item, size: item.size ?? null }}
      onPress={file => {
        sheetRef.current?.present({ ...file, cozyMetadata: item.cozyMetadata, path: item.path })
      }}
    />
  )

  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

  return (
    <View style={styles.container}>
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
      <FileMetadataSheet ref={sheetRef} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
