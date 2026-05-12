import CozyClient, { Q } from 'cozy-client'

import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'

interface FileDoc {
  _id: string
  _rev?: string
  md5sum?: string
  size?: number | string
  name?: string
  type?: string
  dir_id?: string
}

const coerceSize = (raw: unknown): number => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/**
 * Walk every pinned folder, enumerate its children from PouchDB, and ensure
 * each child file has a corresponding MMKV entry. Adds missing entries +
 * enqueues their downloads.
 *
 * Why this exists: the `pinReactor` only fires on PouchDB *change* events.
 * If MMKV entries are dropped (manual purge, "Delete all", backup-restore
 * shenanigans) while the folder pin itself survives, no change event fires
 * for the still-cached child docs and the folder stays "stale-pinned" until
 * the next time those docs happen to change on the server. Reconciliation
 * forces a sync.
 *
 * Returns the number of files newly pinned.
 */
export const reconcileFolderPins = async (client: CozyClient): Promise<number> => {
  let fixed = 0
  for (const folder of OfflineFilesStore.getAllFolders()) {
    const definition = Q('io.cozy.files')
      .where({ dir_id: folder.dirId })
      .indexFields(['dir_id', 'type', 'name'])
      .sortBy([{ dir_id: 'asc' }, { type: 'asc' }, { name: 'asc' }])
    let result
    try {
      result = await client.query(definition)
    } catch {
      continue
    }
    const docs = (result?.data ?? []) as unknown as FileDoc[]
    for (const doc of docs) {
      if (doc.type !== 'file') continue
      if (OfflineFilesStore.get(doc._id)) continue
      OfflineFilesStore.pinViaFolder(doc._id, folder.dirId, {
        rev: doc._rev ?? '',
        md5sum: doc.md5sum ?? '',
        size: coerceSize(doc.size),
        name: doc.name ?? doc._id
      })
      Downloader.enqueue(doc._id)
      fixed += 1
    }
  }
  return fixed
}
