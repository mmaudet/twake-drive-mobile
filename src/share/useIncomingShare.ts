import { useMemo } from 'react'
import { useShareIntent } from 'expo-share-intent'
import type { SharedItem } from '@/files/uploadSharedFile'
import { SHARE_SCHEME } from '@/config/appIdentifiers'

export interface IncomingShare {
  items: SharedItem[]
  text?: string
  hasShare: boolean
  reset: () => void
}

interface RawFile {
  path?: string
  fileName?: string
  mimeType?: string
  size?: number | null
}

// expo-share-intent's getScheme() defaults to app.json scheme[0] (= "cozy",
// reserved for the OAuth deep-link). Force the dedicated "twakedrive" scheme so
// the JS listener (twakedrive://dataUrl=) and the reset key ("twakedriveShareKey")
// match exactly what the iOS Share Extension redirects to.
const SHARE_INTENT_OPTIONS = { scheme: SHARE_SCHEME } as const

const normalizeUri = (path: string): string =>
  path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`

const toItems = (files: unknown): SharedItem[] => {
  if (!Array.isArray(files)) return []
  return (files as RawFile[]).map(f => ({
    uri: normalizeUri(f.path ?? ''),
    name: f.fileName ?? 'shared',
    mimeType: f.mimeType ?? 'application/octet-stream',
    size: f.size ?? undefined
  }))
}

export const useIncomingShare = (): IncomingShare => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent(SHARE_INTENT_OPTIONS)
  const si = shareIntent as { files?: unknown; text?: string; webUrl?: string } | null
  const text = si?.text ?? si?.webUrl ?? undefined
  // Rebuilding `items` fresh every render (a new array/object identity even
  // when the share hasn't changed) re-triggers PendingShareProvider's staging
  // effect, which depends on this reference. Memoize on the raw files
  // reference so `items` is stable across renders where the share is unchanged.
  const files = si?.files
  const items = useMemo(() => toItems(files), [files])
  return {
    items,
    text,
    hasShare: !!hasShareIntent,
    reset: resetShareIntent
  }
}
