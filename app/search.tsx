import React, { useState } from 'react'
import { FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Searchbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { openFileFromList } from '@/files/openFromList'
import { useDebouncedValue } from '@/search/useDebouncedValue'
import { useFileSearch } from '@/search/useFileSearch'
import { FileQueryResult } from '@/client/queries'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

export default function SearchScreen() {
  const router = useRouter()
  const client = useClient()
  const { t } = useTranslation()
  // Top-level route with no navigation header — pad the top safe-area so the
  // Searchbar doesn't render under the status bar.
  const insets = useSafeAreaInsets()
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term.trim(), DEBOUNCE_MS)
  const enabled = debounced.length >= MIN_CHARS

  // Search runs server-side (cozy-stack _find), not against the local PouchDB: the
  // offline io.cozy.files replica can be hundreds of MB and a $regex "contains" scan
  // OOM-kills the app on device. See src/search/useFileSearch.ts.
  const search = useFileSearch(debounced, enabled)
  const data = search.data

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow folder={item} onPress={folder => router.push(`/(drive)/files/${folder._id}`)} />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(() => undefined)
        }}
      />
    )
  }

  return (
    <ScreenContainer style={{ paddingTop: insets.top }}>
      {/* This screen is a slide-up modal and doesn't inherit the app's status-bar
          style — force icons that contrast the (theme-colored) safe-area strip. */}
      <StatusBar style="auto" />
      <Searchbar
        testID="search-input"
        placeholder={t('drive.search.placeholder')}
        value={term}
        onChangeText={setTerm}
        icon="arrow-left"
        onIconPress={() => router.back()}
        autoFocus
      />
      {!enabled ? (
        <EmptyState message={t('drive.search.hint')} />
      ) : search.status === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : search.status === 'error' ? (
        <ErrorState message={t(getErrorMessageKey(search.error))} onRetry={search.reload} />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.search.empty')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </ScreenContainer>
  )
}
