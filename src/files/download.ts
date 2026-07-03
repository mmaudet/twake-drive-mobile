import type CozyClient from 'cozy-client'

import { openFileNatively } from './openFile'

export interface DownloadableFile {
  _id: string
  name: string
  mime?: string
}

/**
 * Download a file to the device cache and hand it to the OS viewer/share
 * sheet. Delegates to `openFileNatively` which already handles the full
 * pipeline: cache lookup → authenticated download → FileViewer.open.
 *
 * Mirrors the explicit "Télécharger" action in twake-drive-web.
 */
export const download = (client: CozyClient, file: DownloadableFile): Promise<void> =>
  openFileNatively(client, file)
