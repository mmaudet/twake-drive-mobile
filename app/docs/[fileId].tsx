import React, { useEffect, useRef, useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { EditorHeader } from '@/ui/EditorHeader'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { useSessionCode } from '@/auth/useSessionCode'

export default function DocsScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const client = useClient()
  const router = useRouter()
  const fetchSessionCode = useSessionCode()
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const openedRef = useRef(false)

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
      if (!client || !fileId || !externalId) return
      if (openedRef.current) return
      openedRef.current = true
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await fetchSessionCode()
        const url = buildCozyAppUrl(stackUri, 'docs', sessionCode, `/bridge/docs/${externalId}`)
        await WebBrowser.openBrowserAsync(url)
        if (!cancelled) router.back()
      } catch (e) {
        console.error('[DocsScreen] failed', e)
        openedRef.current = false
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, fileId, externalId, reloadTick, fetchSessionCode, router])

  const missingExternalId = fileLookup.fetchStatus === 'loaded' && !!lookupDoc && !externalId

  const retry = () => {
    setError(null)
    openedRef.current = false
    setReloadTick(t => t + 1)
  }

  return (
    <ScreenContainer>
      <EditorHeader onBack={() => router.back()} />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : missingExternalId ? (
        <ErrorState message="Could not resolve docs externalId" onRetry={retry} />
      ) : (
        <LoadingState />
      )}
    </ScreenContainer>
  )
}
