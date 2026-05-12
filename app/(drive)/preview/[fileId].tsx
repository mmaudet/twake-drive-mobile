import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'
import { Image } from 'expo-image'
import Pdf from 'react-native-pdf'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { ActivityIndicator, Button, IconButton, ProgressBar, useTheme } from 'react-native-paper'

import { AppBar } from '@/ui/AppBar'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'
import {
  buildFileStreamSource,
  buildThumbnailUrl,
  getPreviewKind,
  StreamSource
} from '@/files/streamUrl'
import { openFileNatively } from '@/files/openFile'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { useOfflineState } from '@/offline/useOfflineState'

const TEXT_MAX_BYTES = 1_000_000

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const LoadingOverlay = ({ progress }: { progress?: number }) => (
  <View style={styles.overlay} pointerEvents="none">
    <ActivityIndicator size="large" color="#fff" />
    {typeof progress === 'number' ? (
      <View style={styles.progressWrapper}>
        <ProgressBar progress={Math.max(0, Math.min(1, progress))} color="#fff" />
      </View>
    ) : null}
  </View>
)

const PdfPreview = ({
  source,
  thumbnailUrl
}: {
  source: StreamSource
  thumbnailUrl: string | null
}) => {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  return (
    <View style={styles.viewerContainer}>
      {thumbnailUrl && !loaded ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
        />
      ) : null}
      <Pdf
        source={{ uri: source.uri, headers: source.headers, cache: true }}
        trustAllCerts={false}
        style={[styles.pdf, !loaded && styles.transparent]}
        onLoadProgress={p => setProgress(p)}
        onLoadComplete={() => setLoaded(true)}
        onError={err => {
          console.error('[PreviewScreen] pdf error', err)
          setError(typeof err === 'string' ? err : (err as Error)?.message ?? 'PDF error')
        }}
      />
      {error ? <ErrorOverlay message={error} /> : !loaded ? <LoadingOverlay progress={progress} /> : null}
    </View>
  )
}

const ImagePreview = ({
  source,
  thumbnailUrl
}: {
  source: StreamSource
  thumbnailUrl: string | null
}) => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <View style={styles.viewerContainer}>
      <Image
        source={{ uri: source.uri, headers: source.headers }}
        placeholder={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
        placeholderContentFit="contain"
        style={styles.image}
        contentFit="contain"
        transition={150}
        onLoad={() => setLoaded(true)}
        onError={err => {
          console.error('[PreviewScreen] image error', err)
          setError(err?.error ?? 'Image error')
        }}
      />
      {error ? <ErrorOverlay message={error} /> : !loaded && !thumbnailUrl ? <LoadingOverlay /> : null}
    </View>
  )
}

const VideoPreview = ({ source }: { source: StreamSource }) => {
  const player = useVideoPlayer({ uri: source.uri, headers: source.headers }, p => {
    p.loop = false
    p.play()
  })
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true)
    })
    return () => sub.remove()
  }, [player])
  return (
    <View style={styles.viewerContainer}>
      <VideoView player={player} style={styles.video} contentFit="contain" allowsFullscreen nativeControls />
      {!ready ? <LoadingOverlay /> : null}
    </View>
  )
}

const AudioPreview = ({ source, name }: { source: StreamSource; name: string }) => {
  const player = useAudioPlayer({ uri: source.uri, headers: source.headers })
  const status = useAudioPlayerStatus(player)
  const ready = status.isLoaded
  const duration = ready ? status.duration : 0
  const position = ready ? status.currentTime : 0
  return (
    <View style={[styles.viewerContainer, styles.audioContainer]}>
      <View style={styles.audioCard}>
        <IconButton
          icon={status.playing ? 'pause' : 'play'}
          size={56}
          mode="contained"
          disabled={!ready}
          onPress={() => {
            if (status.playing) player.pause()
            else player.play()
          }}
        />
        <Text style={styles.audioTitle} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.audioProgressRow}>
          <Text style={styles.audioTime}>{formatTime(position)}</Text>
          <View style={styles.audioBar}>
            <ProgressBar progress={duration > 0 ? position / duration : 0} color="#fff" />
          </View>
          <Text style={styles.audioTime}>{formatTime(duration)}</Text>
        </View>
      </View>
      {!ready ? <LoadingOverlay /> : null}
    </View>
  )
}

const TextPreview = ({ source }: { source: StreamSource }) => {
  const theme = useTheme()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const resp = await fetch(source.uri, {
          headers: { ...source.headers, Range: `bytes=0-${TEXT_MAX_BYTES - 1}` }
        })
        if (!resp.ok && resp.status !== 206) throw new Error(`HTTP ${resp.status}`)
        const text = await resp.text()
        if (cancelled) return
        const totalHeader = resp.headers.get('Content-Range')
        if (totalHeader) {
          const total = Number(totalHeader.split('/')[1])
          if (Number.isFinite(total) && total > text.length) setTruncated(true)
        }
        setContent(text)
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? 'Fetch error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source.uri, source.headers])

  if (error) return <ErrorOverlay message={error} />
  if (content === null) return <LoadingOverlay />
  return (
    <ScrollView style={[styles.textScroll, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.text, { color: theme.colors.onBackground }]} selectable>
        {content}
      </Text>
      {truncated ? (
        <Text style={[styles.textTruncated, { color: theme.colors.onSurfaceVariant }]}>
          … (truncated)
        </Text>
      ) : null}
    </ScrollView>
  )
}

const ErrorOverlay = ({ message }: { message: string }) => (
  <View style={styles.overlay} pointerEvents="none">
    <Text style={styles.errorText}>{message}</Text>
  </View>
)

export default function PreviewScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const client = useClient()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const [externalLoading, setExternalLoading] = useState(false)
  const [externalError, setExternalError] = useState<string | null>(null)
  const fallbackTriggered = useRef(false)

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const lookupData = fileLookup.data
  const file = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as
    | FileQueryResult
    | null
    | undefined

  // Re-renders when the offline state of this file changes (so a download
  // completing while the screen is open swaps the source to the local blob).
  const offlineEntry = useOfflineState(fileId ?? undefined)
  const source = useMemo<StreamSource | null>(() => {
    if (!fileId) return null
    // Prefer the local blob when available: works offline, no auth, instant.
    if (OfflineFilesStore.isPinnedAndDownloaded(fileId)) {
      return { uri: FileSystemRepo.localPath(fileId), headers: {} }
    }
    if (!client) return null
    try {
      return buildFileStreamSource(client, fileId)
    } catch {
      return null
    }
  }, [client, fileId, offlineEntry?.state])

  const thumbnailUrl = useMemo(
    () => (client && file?.links ? buildThumbnailUrl(client, file.links, 'large') : null),
    [client, file?.links]
  )

  const kind = getPreviewKind(file ?? null)

  // Unsupported types: download then native intent, then back.
  useEffect(() => {
    if (!client || !file || kind !== 'unsupported' || fallbackTriggered.current) return
    fallbackTriggered.current = true
    void (async () => {
      try {
        await openFileNatively(client, { _id: file._id, name: file.name, mime: file.mime })
        router.back()
      } catch (e) {
        console.error('[PreviewScreen] native fallback failed', e)
        setExternalError((e as Error).message ?? t('drive.preview.loadFailed'))
        fallbackTriggered.current = false
      }
    })()
  }, [client, file, kind, router, t])

  const onOpenExternally = async (): Promise<void> => {
    if (!client || !file) return
    setExternalLoading(true)
    setExternalError(null)
    try {
      await openFileNatively(client, { _id: file._id, name: file.name, mime: file.mime })
    } catch (e) {
      console.error('[PreviewScreen] open externally failed', e)
      setExternalError((e as Error).message ?? t('drive.preview.loadFailed'))
    } finally {
      setExternalLoading(false)
    }
  }

  const isLoadingFile = fileLookup.fetchStatus === 'loading' || (!file && !fileLookup.data)
  const title = file?.name ?? t('drive.preview.title')

  const renderViewer = (): React.ReactElement => {
    if (!source) return <LoadingState />
    switch (kind) {
      case 'pdf':
        return <PdfPreview source={source} thumbnailUrl={thumbnailUrl} />
      case 'image':
        return <ImagePreview source={source} thumbnailUrl={thumbnailUrl} />
      case 'video':
        return <VideoPreview source={source} />
      case 'audio':
        return <AudioPreview source={source} name={file?.name ?? ''} />
      case 'text':
        return <TextPreview source={source} />
      case 'unsupported':
      default:
        return externalError ? (
          <ErrorState
            message={externalError}
            onRetry={() => {
              setExternalError(null)
              fallbackTriggered.current = false
            }}
          />
        ) : (
          <View style={styles.fallbackPanel}>
            <LoadingState />
          </View>
        )
    }
  }

  return (
    <View style={styles.container}>
      <AppBar title={title} onBack={() => router.back()} />
      {isLoadingFile ? <LoadingState /> : renderViewer()}
      {kind !== 'unsupported' && file ? (
        <View style={styles.actions}>
          <Button
            mode="text"
            icon="open-in-new"
            loading={externalLoading}
            disabled={externalLoading}
            onPress={onOpenExternally}
          >
            {t('drive.preview.openExternally')}
          </Button>
          {externalError ? <Text style={styles.actionError}>{externalError}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  viewerContainer: { flex: 1 },
  pdf: { flex: 1, width: SCREEN_WIDTH, backgroundColor: '#000' },
  transparent: { backgroundColor: 'transparent' },
  image: { flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' },
  video: { flex: 1, width: SCREEN_WIDTH, backgroundColor: '#000' },
  audioContainer: { alignItems: 'center', justifyContent: 'center' },
  audioCard: { alignItems: 'center', padding: 24, gap: 16 },
  audioTitle: { color: '#fff', fontSize: 16, textAlign: 'center', maxWidth: 280 },
  audioProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 280 },
  audioBar: { flex: 1 },
  audioTime: { color: '#fff', fontVariant: ['tabular-nums'], fontSize: 12 },
  textScroll: { flex: 1, padding: 16 },
  text: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 18 },
  textTruncated: { fontStyle: 'italic', marginTop: 16, textAlign: 'center' },
  fallbackPanel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#000' },
  actionError: { color: '#ff6b6b', textAlign: 'center', marginTop: 4, fontSize: 12 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    gap: 16
  },
  progressWrapper: { width: 200 },
  errorText: { color: '#fff', textAlign: 'center', paddingHorizontal: 32 }
})
