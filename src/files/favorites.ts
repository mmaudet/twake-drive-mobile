import type CozyClient from 'cozy-client'

import type { FileQueryResult } from '@/client/queries'

/**
 * Returns true when the file/folder is marked as a favourite.
 * Mirrors twake-drive-web: the flag lives at `cozyMetadata.favorite`.
 */
export const isFavorite = (file: FileQueryResult): boolean => file.cozyMetadata?.favorite === true

/**
 * Toggle the favourite flag on a file or folder by persisting it via
 * `client.save`. Spreads the existing document to preserve all other
 * fields and merges into the existing cozyMetadata object.
 *
 * Mirrors twake-drive-web's `toggleFavorite` helper (cozy-drive).
 */
export const toggleFavorite = async (
  client: CozyClient,
  file: FileQueryResult,
  next: boolean
): Promise<void> => {
  await client.save({
    ...file,
    cozyMetadata: {
      ...file.cozyMetadata,
      favorite: next
    }
  })
}
