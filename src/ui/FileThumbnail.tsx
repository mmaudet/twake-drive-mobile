import React, { useEffect, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { useClient } from 'cozy-client'

import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'
import { getFileIcon } from '@/utils/fileIcons'

interface FileLike {
  _id: string
  name: string
  type?: 'file' | 'directory'
  mime?: string
  class?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

interface Props {
  file: FileLike
  size?: number
}

const SUPPORTED_PREVIEW_CLASSES = new Set(['image', 'pdf'])

const LINK_TTL_MS = 9 * 60 * 1000
const thumbnailLinkCache = new Map<string, { links: FileLike['links'] | null; at: number }>()

interface StackFileClient {
  collection: (doctype: string) => {
    get: (id: string) => Promise<{ data?: { links?: FileLike['links'] } }>
  }
}

const buildThumbnailUrl = (
  stackUri: string,
  links: FileLike['links'],
  preferred: 'tiny' | 'small'
): string | null => {
  const link = links?.[preferred] ?? links?.tiny ?? links?.small
  if (!link) return null
  const base = stackUri.replace(/\/$/, '')
  return base + (link.startsWith('/') ? link : '/' + link)
}

export const FileThumbnail = ({ file, size = 40 }: Props) => {
  const client = useClient()
  const [errored, setErrored] = useState(false)
  const [resolvedLinks, setResolvedLinks] = useState(file.links)

  // Reset state if the file or its links change.
  useEffect(() => {
    setErrored(false)
    setResolvedLinks(file.links)
  }, [file._id, file.links])

  const stackUri = client?.getStackClient()?.uri as string | undefined
  const fileType = file.type ?? 'file'
  const showThumbnail =
    !!stackUri &&
    !errored &&
    fileType === 'file' &&
    file.class !== undefined &&
    SUPPORTED_PREVIEW_CLASSES.has(file.class)

  useEffect(() => {
    if (!showThumbnail || !client) return
    if (resolvedLinks?.tiny || resolvedLinks?.small) return
    const cached = thumbnailLinkCache.get(file._id)
    if (cached && Date.now() - cached.at < LINK_TTL_MS) {
      if (cached.links) setResolvedLinks(cached.links)
      else setErrored(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const stack = client.getStackClient() as unknown as StackFileClient
        const resp = await stack.collection('io.cozy.files').get(file._id)
        const links = resp?.data?.links ?? null
        thumbnailLinkCache.set(file._id, { links, at: Date.now() })
        if (cancelled) return
        if (links?.tiny || links?.small) setResolvedLinks(links)
        else setErrored(true)
      } catch {
        thumbnailLinkCache.set(file._id, { links: null, at: Date.now() })
        if (!cancelled) setErrored(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, file._id, showThumbnail, resolvedLinks?.tiny, resolvedLinks?.small])

  if (showThumbnail && stackUri) {
    const uri = buildThumbnailUrl(stackUri, resolvedLinks, size <= 48 ? 'tiny' : 'small')
    if (uri) {
      return (
        <View style={[styles.thumbWrapper, { width: size, height: size }]}>
          <Image
            source={{ uri }}
            style={styles.thumb}
            resizeMode="cover"
            onError={() => setErrored(true)}
          />
        </View>
      )
    }
  }

  const iconKey = getFileIcon(fileType, file.mime, file.name)
  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <FileTypeIcon icon={iconKey} size={Math.round(size * 0.85)} />
    </View>
  )
}

const styles = StyleSheet.create({
  thumbWrapper: { borderRadius: 6, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' }
})
