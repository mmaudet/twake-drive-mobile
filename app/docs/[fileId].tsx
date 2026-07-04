import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { EditorHeader } from '@/ui/EditorHeader'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { LoadingOverlay } from '@/ui/LoadingOverlay'
import { useWebViewSettleReveal } from '@/ui/useWebViewSettleReveal'
import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { useSessionCode } from '@/auth/useSessionCode'

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
  const router = useRouter()
  const fetchSessionCode = useSessionCode()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // Keep an opaque overlay over the WebView until it settles on the editor, so
  // the La Suite Docs OIDC redirect (docs → LemonLDAP → back) does not flash.
  const {
    ready,
    onLoadStart,
    onLoadEnd,
    onNavigationStateChange,
    onError: revealOnError
  } = useWebViewSettleReveal()

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
        const sessionCode = await fetchSessionCode()
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
  }, [client, fileId, externalId, reloadTick, fetchSessionCode])

  const missingExternalId = fileLookup.fetchStatus === 'loaded' && !!lookupDoc && !externalId

  return (
    <ScreenContainer>
      <EditorHeader onBack={() => router.back()} />
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
        <View style={styles.webview}>
          <WebView
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            sharedCookiesEnabled
            source={{ uri: editorUrl }}
            style={styles.webview}
            onLoadStart={onLoadStart}
            onLoadEnd={onLoadEnd}
            onNavigationStateChange={onNavigationStateChange}
            onMessage={event => {
              console.log('[DocsScreen] webview message', event.nativeEvent.data)
            }}
            onError={syntheticEvent => {
              console.error('[DocsScreen] webview error', syntheticEvent.nativeEvent)
              revealOnError()
            }}
          />
          {!ready && <LoadingOverlay />}
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 }
})
