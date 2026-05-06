import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'
import { buildCozyAppUrl, getSessionCode } from '@/files/cozyAppLink'

// Mirrors twake-drive web's "note" file-type routing: open the cozy `notes`
// web app inside a WebView with a session_code so the notes editor renders
// already authenticated. The hash `/n/<fileId>` is the notes app route for a
// single document, identical to what computePath returns for `type === 'note'`.

export default function CozyNoteScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const client = useClient()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const lookupData = fileLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const fileName = (lookupDoc as { name?: string } | null | undefined)?.name

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!client || !fileId) return
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await getSessionCode(client)
        const url = buildCozyAppUrl(stackUri, 'notes', sessionCode, `/n/${fileId}`)
        console.log('[CozyNoteScreen] editorUrl', url)
        if (!cancelled) setEditorUrl(url)
      } catch (e) {
        console.error('[CozyNoteScreen] failed', e)
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, fileId, reloadTick])

  return (
    <View style={styles.container}>
      <AppBar title={fileName ?? t('drive.note.title')} onBack={() => router.back()} />
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            setEditorUrl(null)
            setReloadTick(t => t + 1)
          }}
        />
      ) : !editorUrl ? (
        <LoadingState />
      ) : (
        <WebView
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          sharedCookiesEnabled
          source={{ uri: editorUrl }}
          style={styles.webview}
          onMessage={event => {
            console.log('[CozyNoteScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[CozyNoteScreen] webview error', syntheticEvent.nativeEvent)
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 }
})
