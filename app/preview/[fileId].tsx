import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as FileSystem from 'expo-file-system/legacy'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'
import { Image } from 'expo-image'
import Pdf from 'react-native-pdf'
import { AudioModule, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { ActivityIndicator, Button, IconButton, ProgressBar, useTheme } from 'react-native-paper'
import { CozyIcon } from '@/ui/icons/CozyIcon'

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
import { isUnsupportedAudio } from '@/files/audioSupport'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { useOfflineState } from '@/offline/useOfflineState'
import { VideoPreview } from '@/preview/VideoPreview'
import { ZoomableImage } from '@/ui/ZoomableImage'

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
        enableDoubleTapZoom
        minScale={1}
        maxScale={3}
        style={[styles.pdf, !loaded && styles.transparent]}
        onLoadProgress={p => setProgress(p)}
        onLoadComplete={() => setLoaded(true)}
        onError={err => {
          console.error('[PreviewScreen] pdf error', err)
          setError(typeof err === 'string' ? err : ((err as Error)?.message ?? 'PDF error'))
        }}
      />
      {error ? (
        <ErrorOverlay message={error} />
      ) : !loaded ? (
        <LoadingOverlay progress={progress} />
      ) : null}
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
      <ZoomableImage
        uri={source.uri}
        headers={source.headers}
        placeholderUri={thumbnailUrl}
        onLoad={() => setLoaded(true)}
        onError={err => {
          console.error('[PreviewScreen] image error', err)
          const e = err as { error?: string } | null
          setError(e?.error ?? 'Image error')
        }}
      />
      {error ? (
        <ErrorOverlay message={error} />
      ) : !loaded && !thumbnailUrl ? (
        <LoadingOverlay />
      ) : null}
    </View>
  )
}

const UnsupportedAudio = ({
  fileId,
  name,
  mime
}: {
  fileId: string
  name: string
  mime: string | undefined
}) => {
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presented, setPresented] = useState(false)
  const onOpenExternal = async (): Promise<void> => {
    if (!client) return
    setBusy(true)
    setError(null)
    setPresented(false)
    try {
      await openFileNatively(client, { _id: fileId, name, mime })
      // FileViewer (UIDocumentInteractionController on iOS) resolves
      // silently even when no third-party app can handle the file. We
      // don't auto-dismiss the modal: show a hint instead so the user
      // knows whether a sheet actually appeared.
      setPresented(true)
    } catch (e) {
      console.error('[AudioPreview] open externally failed', e)
      setError((e as Error).message ?? 'open failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={[styles.viewerContainer, styles.audioContainer]}>
      <View style={styles.unsupportedCard}>
        <CozyIcon name="info" size={56} color="#fff" />
        <Text style={styles.audioTitle} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.unsupportedMessage}>{t('drive.audio.unsupportedCodec')}</Text>
        <Button
          mode="contained"
          icon="open-in-app"
          loading={busy}
          disabled={busy || !client}
          onPress={() => void onOpenExternal()}
        >
          {t('drive.audio.openWith')}
        </Button>
        {error ? (
          <Text style={[styles.unsupportedError, { color: theme.colors.error }]}>{error}</Text>
        ) : null}
        {presented ? (
          <Text style={styles.unsupportedHint}>{t('drive.audio.noAppHint')}</Text>
        ) : null}
      </View>
    </View>
  )
}

const AudioPreview = ({
  fileId,
  source,
  name,
  mime
}: {
  fileId: string
  source: StreamSource
  name: string
  mime: string | undefined
}) => {
  if (isUnsupportedAudio(mime, name)) {
    return <UnsupportedAudio fileId={fileId} name={name} mime={mime} />
  }
  return <SupportedAudioPlayer source={source} name={name} />
}

const SupportedAudioPlayer = ({ source, name }: { source: StreamSource; name: string }) => {
  const player = useAudioPlayer({ uri: source.uri, headers: source.headers })
  const status = useAudioPlayerStatus(player)
  // Keep audio playing when the app is backgrounded or the device is silenced.
  // iOS additionally requires UIBackgroundModes: audio in Info.plist; without
  // it the OS still suspends on background. Note as v2.
  useEffect(() => {
    void AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false
    })
  }, [])
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
  const insets = useSafeAreaInsets()
  const client = useClient()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
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

  const thumbnailUrl = useMemo(
    () => (client && file?.links ? buildThumbnailUrl(client, file.links, 'large') : null),
    [client, file?.links]
  )

  const kind = getPreviewKind(file ?? null)

  // AVPlayer (video) and the audio player rely on the file URL's extension
  // to choose the right codec. The persistent offline blob is stored as
  // `offline/{fileId}` with no extension, so for those kinds we eagerly
  // copy the blob to the OS cache under `{fileId}-{name}` and serve from
  // there. Image / PDF / text don't need this — they sniff the content.
  const [pinnedAliasPath, setPinnedAliasPath] = useState<string | null>(null)
  useEffect(() => {
    setPinnedAliasPath(null)
    if (!fileId || !file) return
    if (kind !== 'video' && kind !== 'audio') return
    if (!OfflineFilesStore.isPinnedAndDownloaded(fileId)) return
    const cacheDir = FileSystem.cacheDirectory
    if (!cacheDir) return
    let cancelled = false
    void (async () => {
      try {
        const dir = `${cacheDir}twake-drive/`
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
        const sanitized = file.name.replace(/[/\\?%*:|"<>]/g, '_')
        const target = `${dir}${fileId}-${sanitized}`
        const info = await FileSystem.getInfoAsync(target)
        if (!info.exists) {
          await FileSystem.copyAsync({
            from: FileSystemRepo.localPath(fileId),
            to: target
          })
        }
        if (!cancelled) setPinnedAliasPath(target)
      } catch (e) {
        console.error('[PreviewScreen] pinned alias copy failed', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fileId, file, kind])

  const source = useMemo<StreamSource | null>(() => {
    if (!fileId) return null
    // Prefer the local blob when available: works offline, no auth, instant.
    if (OfflineFilesStore.isPinnedAndDownloaded(fileId)) {
      // Video / audio need the extension-bearing alias to start decoding;
      // wait for the copy to land before returning anything (preview screen
      // shows LoadingState meanwhile).
      if (kind === 'video' || kind === 'audio') {
        if (!pinnedAliasPath) return null
        return { uri: pinnedAliasPath, headers: {} }
      }
      return { uri: FileSystemRepo.localPath(fileId), headers: {} }
    }
    if (!client) return null
    try {
      return buildFileStreamSource(client, fileId)
    } catch {
      return null
    }
  }, [client, fileId, kind, pinnedAliasPath, offlineEntry?.state])

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
        return <VideoPreview fileId={fileId!} source={source} />
      case 'audio':
        return (
          <AudioPreview
            fileId={fileId!}
            source={source}
            name={file?.name ?? ''}
            mime={file?.mime}
          />
        )
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

  // No AppBar for kinds whose content is more visual than informational.
  // The iOS pageSheet grabber already indicates dismissibility, so we
  // can stay chromeless on these kinds.
  const isChromeless = kind === 'image' || kind === 'video' || kind === 'pdf'

  return (
    <View style={styles.container}>
      {!isChromeless ? <AppBar title={title} onBack={() => router.back()} /> : null}
      {isLoadingFile ? <LoadingState /> : renderViewer()}
      {/* Chromeless kinds (pdf/image/video) drop the AppBar for immersion, but a
          full-screen scrollable/zoomable viewer (notably react-native-pdf)
          captures the pageSheet swipe-to-dismiss gesture — leaving no way back.
          A floating close button guarantees an explicit exit on every platform. */}
      {isChromeless ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          testID="preview-close-button"
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + 8 }]}
        >
          <CozyIcon name="cross" size={22} color="#fff" />
        </Pressable>
      ) : null}
      {externalError ? (
        <Text style={[styles.actionError, !isChromeless && styles.actionErrorChromed]}>
          {externalError}
        </Text>
      ) : null}
    </View>
  )
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  closeButton: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 10
  },
  viewerContainer: { flex: 1 },
  pdf: { flex: 1, width: SCREEN_WIDTH, backgroundColor: '#000' },
  transparent: { backgroundColor: 'transparent' },
  image: { flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' },
  audioContainer: { alignItems: 'center', justifyContent: 'center' },
  audioCard: { alignItems: 'center', padding: 24, gap: 16 },
  unsupportedCard: { alignItems: 'center', padding: 24, gap: 16, maxWidth: 320 },
  unsupportedMessage: { color: '#fff', fontSize: 14, textAlign: 'center', opacity: 0.85 },
  unsupportedHint: { color: '#fff', fontSize: 12, textAlign: 'center', opacity: 0.65 },
  unsupportedError: { fontSize: 12, textAlign: 'center' },
  audioTitle: { color: '#fff', fontSize: 16, textAlign: 'center', maxWidth: 280 },
  audioProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 280 },
  audioBar: { flex: 1 },
  audioTime: { color: '#fff', fontVariant: ['tabular-nums'], fontSize: 12 },
  textScroll: { flex: 1, padding: 16 },
  text: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 18 },
  textTruncated: { fontStyle: 'italic', marginTop: 16, textAlign: 'center' },
  fallbackPanel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionError: { color: '#ff6b6b', textAlign: 'center', marginTop: 4, fontSize: 12 },
  actionErrorChromed: { backgroundColor: '#000', paddingVertical: 8 },
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
