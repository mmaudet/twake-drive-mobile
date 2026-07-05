import React, { useCallback, useRef } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
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
import { favoritesQuery, favoritesQueryAs, FileQueryResult } from '@/client/queries'
import { isFavorite } from '@/files/favorites'
import { openFileFromList } from '@/files/openFromList'

export default function FavoritesScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const query = useQuery(favoritesQuery(), { as: favoritesQueryAs })

  const queryRef = useRef(query)
  queryRef.current = query

  useFocusEffect(
    useCallback(() => {
      void queryRef.current.fetch()
    }, [])
  )

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={{ _id: item._id, name: item.name, cozyMetadata: item.cozyMetadata }}
          onPress={() => router.push(`/(drive)/files/${item._id}`)}
          onShare={folder => router.push(`/share/${folder._id}`)}
          onMove={folder => router.push(`/move/${folder._id}`)}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(e => {
            console.error('[FavoritesScreen] openFileFromList failed', e)
          })
        }}
        onShare={file => router.push(`/share/${file._id}`)}
        onMove={file => router.push(`/move/${file._id}`)}
        onInfo={file => router.push(`/metadata/${file._id}`)}
      />
    )
  }

  // favoritesQuery's nested-favourite filter is unreliable in the offline pouch
  // replica and returns every file (favourites sort first); filter it down to
  // real favourites here (isFavorite is a strict `=== true`).
  const data = ((query.data as FileQueryResult[] | null | undefined) ?? []).filter(isFavorite)

  return (
    <ScreenContainer>
      <AppBar title={t('drive.favorites')} onLogout={logout} showSearch />
      {query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={() => query.fetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState icon="star" message={t('drive.emptyFavorites')} />
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
    </ScreenContainer>
  )
}
