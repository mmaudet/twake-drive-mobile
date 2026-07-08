import React, { useEffect, useRef, useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { EditorHeader } from '@/ui/EditorHeader'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { useSessionCode } from '@/auth/useSessionCode'

export default function DocsNewScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>()
  const client = useClient()
  const router = useRouter()
  const fetchSessionCode = useSessionCode()
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const openedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!client || !folderId) return
      if (openedRef.current) return
      openedRef.current = true
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await fetchSessionCode()
        const url = buildCozyAppUrl(stackUri, 'docs', sessionCode, `/bridge/docs/new/${folderId}`)
        await WebBrowser.openBrowserAsync(url)
        if (!cancelled) router.back()
      } catch (e) {
        console.error('[DocsNewScreen] failed', e)
        openedRef.current = false
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, folderId, reloadTick, fetchSessionCode, router])

  const retry = () => {
    setError(null)
    openedRef.current = false
    setReloadTick(tick => tick + 1)
  }

  return (
    <ScreenContainer>
      <EditorHeader onBack={() => router.back()} />
      {error ? <ErrorState message={error} onRetry={retry} /> : <LoadingState />}
    </ScreenContainer>
  )
}
