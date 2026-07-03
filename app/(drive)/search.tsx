import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, StyleSheet } from 'react-native'
import { Searchbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient, Q } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileQueryResult } from '@/client/queries'
import { openFileFromList } from '@/files/openFromList'

const DEBOUNCE_MS = 300

export default function SearchScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const client = useClient()

  const [term, setTerm] = useState('')
  const [debouncedTerm, setDebouncedTerm] = useState('')
  const [results, setResults] = useState<FileQueryResult[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  // Fetch + client-side filter on debouncedTerm
  const fetchRef = useRef(0)
  useEffect(() => {
    if (!debouncedTerm) {
      setResults([])
      setLoading(false)
      return
    }
    if (!client) return

    const token = ++fetchRef.current
    setLoading(true)

    const query = Q('io.cozy.files')
      .where({ name: { $gt: null } })
      .partialIndex({ trashed: false })
      .indexFields(['name'])
      .limitBy(200)

    client
      .query(query)
      .then((res: { data?: FileQueryResult[] }) => {
        if (token !== fetchRef.current) return
        const all: FileQueryResult[] = res?.data ?? []
        const lower = debouncedTerm.toLowerCase()
        setResults(all.filter(f => f.name.toLowerCase().includes(lower)))
      })
      .catch(() => {
        if (token !== fetchRef.current) return
        setResults([])
      })
      .finally(() => {
        if (token !== fetchRef.current) return
        setLoading(false)
      })
  }, [debouncedTerm, client])

  const renderItem = useCallback(
    ({ item }: { item: FileQueryResult }) => {
      if (item.type === 'directory') {
        return (
          <FolderRow
            folder={{ _id: item._id, name: item.name }}
            onPress={() => router.push(`/(drive)/files/${item._id}`)}
          />
        )
      }
      return (
        <FileRow
          file={{ ...item, size: item.size ?? null }}
          onPress={() => {
            if (!client) return
            void openFileFromList(client, router, item).catch(e => {
              console.error('[SearchScreen] openFileFromList failed', e)
            })
          }}
        />
      )
    },
    [router, client]
  )

  const showHint = !debouncedTerm && !term
  const showEmpty = !!debouncedTerm && !loading && results.length === 0

  return (
    <ScreenContainer>
      <AppBar title={t('drive.search')} onBack={() => router.back()} />
      <Searchbar
        placeholder={t('drive.searchHint')}
        value={term}
        onChangeText={setTerm}
        autoFocus
        style={styles.searchbar}
        testID="search-input"
      />
      {showHint ? (
        <EmptyState icon="magnifier" message={t('drive.searchHint')} />
      ) : loading ? (
        <LoadingState />
      ) : showEmpty ? (
        <EmptyState icon="magnifier" message={t('drive.searchEmpty')} />
      ) : (
        <FlatList data={results} keyExtractor={item => item._id} renderItem={renderItem} />
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  searchbar: {
    margin: 8,
    borderRadius: 8
  }
})
