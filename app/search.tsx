import React, { useState } from 'react'
import { FlatList } from 'react-native'
import { Searchbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
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
import { searchFilesQuery, searchFilesQueryAs, FileQueryResult } from '@/client/queries'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

export default function SearchScreen() {
  const router = useRouter()
  const client = useClient()
  const { t } = useTranslation()
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term.trim(), DEBOUNCE_MS)
  const enabled = debounced.length >= MIN_CHARS

  const query = useQuery(searchFilesQuery(debounced), {
    as: searchFilesQueryAs(debounced),
    enabled
  })
  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

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
    <ScreenContainer>
      <Searchbar
        placeholder={t('drive.search.placeholder')}
        value={term}
        onChangeText={setTerm}
        icon="arrow-left"
        onIconPress={() => router.back()}
        autoFocus
      />
      {!enabled ? (
        <EmptyState message={t('drive.search.hint')} />
      ) : (query.fetchStatus === 'loading' || query.fetchStatus === 'pending') &&
        data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={() => void query.fetch()}
        />
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
