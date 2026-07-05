// Use the legacy import. expo-file-system v19 (SDK 54) deprecates
// `cacheDirectory`, `makeDirectoryAsync` and `downloadAsync` on the root
// module — they throw at runtime. The legacy submodule keeps the same API.
import * as FileSystem from 'expo-file-system/legacy'
import FileViewer from 'react-native-file-viewer'
import type CozyClient from 'cozy-client'

import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { NoCompatibleAppError } from './errors'

export interface OpenableFile {
  _id: string
  name: string
  mime?: string
}

const sanitizeName = (name: string): string => name.replace(/[/\\?%*:|"<>]/g, '_')

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

const cacheAliasPath = (cacheDir: string, file: OpenableFile): string =>
  `${cacheDir}twake-drive/${file._id}-${sanitizeName(file.name)}`

// Hand a local path to the OS viewer. Android's FileViewer rejects with
// "No app associated with this mime type" when nothing can open it; translate
// that into a typed error so callers can surface a friendly message instead of
// leaking the raw string. Other failures pass through unchanged.
const openInViewer = async (path: string): Promise<void> => {
  try {
    await FileViewer.open(path, { showOpenWithDialog: true, showAppsSuggestions: true })
  } catch (e) {
    const message = (e as { message?: string } | null)?.message ?? ''
    if (/no app associated/i.test(message)) throw new NoCompatibleAppError()
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export const openFileNatively = async (client: CozyClient, file: OpenableFile): Promise<void> => {
  const cacheDir = FileSystem.cacheDirectory
  if (!cacheDir) throw new Error('Cache directory unavailable')
  const aliasPath = cacheAliasPath(cacheDir, file)
  await FileSystem.makeDirectoryAsync(`${cacheDir}twake-drive/`, { intermediates: true })

  if (OfflineFilesStore.isPinnedAndDownloaded(file._id)) {
    // The persistent blob is stored as `offline/{fileId}` with no
    // extension; without one, iOS (UIDocumentInteractionController)
    // and Android both fail to dispatch the viewer and hang. Copy
    // to a cache path that carries the real filename + extension.
    // The cacheDirectory is OS-managed so the copy is short-lived.
    const blobPath = FileSystemRepo.localPath(file._id)
    const blobInfo = await FileSystem.getInfoAsync(blobPath)
    if (!blobInfo.exists) {
      throw new Error(`Pinned blob missing on disk: ${blobPath}`)
    }
    const aliasInfo = await FileSystem.getInfoAsync(aliasPath)
    if (!aliasInfo.exists) {
      await FileSystem.copyAsync({ from: blobPath, to: aliasPath })
    }
    await openInViewer(aliasPath)
    return
  }

  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const stackUri = stackClient.uri
  const token = stackClient.getAccessToken()
  if (!token) throw new Error('No access token available')

  const downloadUrl = `${stackUri}/files/download/${encodeURIComponent(file._id)}`

  const result = await FileSystem.downloadAsync(downloadUrl, aliasPath, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (result.status >= 400) {
    throw new Error(`Download failed (HTTP ${result.status})`)
  }

  await openInViewer(result.uri)
}
