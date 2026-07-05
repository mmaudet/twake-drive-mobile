import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { Snackbar } from 'react-native-paper'
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
import { favoritesQuery, favoritesQueryAs, FileQueryResult, TRASH_DIR_ID } from '@/client/queries'
import { isFavorite } from '@/files/favorites'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'

// A trashed folder keeps its cozyMetadata.favorite flag. cozy-stack does NOT
// reliably set a top-level `trashed` boolean on it, but a trashed item always
// sits directly under the trash dir (dir_id) or somewhere under the `/.cozy_trash`
// path — check all three so none leaks into Favoris.
const isInTrash = (d: FileQueryResult): boolean =>
  d.trashed === true ||
  d.dir_id === TRASH_DIR_ID ||
  (typeof d.path === 'string' && d.path.startsWith('/.cozy_trash'))

export default function FavoritesScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const query = useQuery(favoritesQuery(), { as: favoritesQueryAs })

  const queryRef = useRef(query)
  queryRef.current = query

  // Optimistic removal: unfavoriting writes cozyMetadata.favorite=false to Pouch,
  // but the Mango index the query reads lags a beat, so an immediate refetch still
  // returns the (stale) favorite — the row would linger until the next focus. Track
  // just-unfavorited ids and hide them right away (mirrors trash.tsx). Not reset in
  // the focus effect (that would setState during render under the test's mock); the
  // entries become redundant anyway once isFavorite filters the refreshed data.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  useFocusEffect(
    useCallback(() => {
      void queryRef.current.fetch()
    }, [])
  )

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={{
            _id: item._id,
            _type: item._type,
            _rev: item._rev,
            name: item.name,
            cozyMetadata: item.cozyMetadata
          }}
          onPress={() => router.push(`/(drive)/files/${item._id}`)}
          onShare={folder => router.push(`/share/${folder._id}`)}
          onMove={folder => router.push(`/move/${folder._id}`)}
          onFavoriteChange={() => {
            setRemovedIds(prev => new Set(prev).add(item._id))
            void query.fetch()
          }}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(e =>
            surfaceOpenError(e, setSnackbar, t, 'FavoritesScreen')
          )
        }}
        onShare={file => router.push(`/share/${file._id}`)}
        onMove={file => router.push(`/move/${file._id}`)}
        onInfo={file => router.push(`/metadata/${file._id}`)}
        onFavoriteChange={() => {
          setRemovedIds(prev => new Set(prev).add(item._id))
          void query.fetch()
        }}
      />
    )
  }

  // favoritesQuery's nested-favourite filter is unreliable in the offline pouch
  // replica and returns every file (favourites sort first); filter it down to
  // real favourites here (isFavorite is a strict `=== true`).
  const data = ((query.data as FileQueryResult[] | null | undefined) ?? [])
    .filter(isFavorite)
    .filter(d => !isInTrash(d))
    .filter(d => !removedIds.has(d._id))

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
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}
