import type CozyClient from 'cozy-client'
import { pouchLink } from '@/client/createClient'

export interface DeletableEntry {
  _id: string
  _rev?: string
  _type?: string
  name?: string
  type?: 'file' | 'directory'
}

/**
 * Soft-delete a file or directory: cozy-stack moves it to the trash and sets
 * `trashed: true`. Hard deletion happens later from the Trash screen.
 *
 * Uses `client.destroy(doc)` (not `client.collection().destroy()`) so the
 * cache-invalidation hooks fire — under the hood this dispatches
 * `Mutations.deleteDocument`, which removes the doc from any cached query
 * result. Same path twake-drive-web uses; without it the deleted file lingers
 * in the folder listing until a hard reload.
 */
export const softDeleteEntry = async (
  client: CozyClient,
  entry: DeletableEntry
): Promise<void> => {
  await client.destroy({
    _id: entry._id,
    _rev: entry._rev,
    _type: entry._type ?? 'io.cozy.files'
  })
  pouchLink.syncImmediately()
}
