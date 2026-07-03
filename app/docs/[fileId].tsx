import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'
import { buildCozyAppUrl, getSessionCode } from '@/files/cozyAppLink'

// Mirrors twake-drive web's "docs" file-type routing: open the cozy `docs`
// web app inside a WebView with a session_code so the docs editor renders
// already authenticated. The hash `/bridge/docs/<externalId>` is the docs
// app route for a single document, identical to what computePath returns
// for `type === 'docs'` in twake-drive web (helpers.ts).
//
// The externalId is read from the file's metadata (see
// cozy-client/dist/models/file.js → isDocs(file)).

export default function DocsScreen() {
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
  const externalId = (lookupDoc as { metadata?: { externalId?: string } } | null | undefined)
    ?.metadata?.externalId

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!client || !fileId) return
      if (!externalId) return
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await getSessionCode(client)
        const url = buildCozyAppUrl(stackUri, 'docs', sessionCode, `/bridge/docs/${externalId}`)
        console.log('[DocsScreen] editorUrl', url)
        if (!cancelled) setEditorUrl(url)
      } catch (e) {
        console.error('[DocsScreen] failed', e)
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, fileId, externalId, reloadTick])

  const missingExternalId = fileLookup.fetchStatus === 'loaded' && !!lookupDoc && !externalId

  return (
    <ScreenContainer>
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            setEditorUrl(null)
            setReloadTick(t => t + 1)
          }}
        />
      ) : missingExternalId ? (
        <ErrorState
          message="Could not resolve docs externalId"
          onRetry={() => {
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
            console.log('[DocsScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[DocsScreen] webview error', syntheticEvent.nativeEvent)
          }}
        />
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 }
})
