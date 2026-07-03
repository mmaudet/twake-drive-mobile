import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams } from 'expo-router'
import { useClient } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { buildCozyAppUrl, getSessionCode } from '@/files/cozyAppLink'

// Mirrors twake-drive web's CreateDocsItem flow: redirect the user to the
// cozy `docs` web app with the route `/bridge/docs/new/<folderId>`. The
// docs app handles document creation server-side and then opens the new
// document. No externalId lookup is needed since the document does not
// exist yet.

export default function DocsNewScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>()
  const client = useClient()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!client || !folderId) return
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await getSessionCode(client)
        const url = buildCozyAppUrl(stackUri, 'docs', sessionCode, `/bridge/docs/new/${folderId}`)
        console.log('[DocsNewScreen] editorUrl', url)
        if (!cancelled) setEditorUrl(url)
      } catch (e) {
        console.error('[DocsNewScreen] failed', e)
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, folderId, reloadTick])

  return (
    <ScreenContainer>
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            setEditorUrl(null)
            setReloadTick(tick => tick + 1)
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
            console.log('[DocsNewScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[DocsNewScreen] webview error', syntheticEvent.nativeEvent)
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
