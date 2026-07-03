// Deep import to skip cozy-client's mobile.native authentication module which
// pulls in `react-native-inappbrowser-reborn` (we stub that in the bundler but
// jest does not resolve it). The dsl module is self-contained.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Q: Query } = require('cozy-client/dist/queries/dsl') as typeof import('cozy-client')
import type CozyClient from 'cozy-client'

// Inlined to keep this module free of `@/client/queries` which transitively
// loads cozy-client's full entrypoint and breaks isolated jest runs.
const SHARED_DRIVES_DIR_ID = 'io.cozy.files.shared-drives-dir'

export interface SharedDriveEntry {
  /** Shortcut document _id (the .url file in shared-drives-dir). */
  shortcutId: string
  /** Sharing document _id — used as driveId in /sharings/drives/{driveId}.
   *  May be null when the listing did not surface a referenced_by relationship;
   *  resolve it lazily by re-fetching the shortcut on tap. */
  driveId: string | null
  /** Root folder _id of the drive (entry point for browsing). May be null
   *  for the same reason as driveId. */
  rootFolderId: string | null
  name: string
}

interface FileCollectionV60 {
  get: (id: string) => Promise<{
    data?: { _id?: string; id?: string; name?: string; attributes?: { name?: string } }
    included?: RawShortcut[]
  }>
}

interface MinimalStackClient {
  collection: (doctype: string, options?: { driveId?: string }) => FileCollectionV60
}

interface RawTarget {
  _id?: string
  id?: string
  _type?: string
  doctype?: string
  app?: string
}

interface RawShortcut {
  _id?: string
  id?: string
  _type?: string
  name?: string
  type?: string
  class?: string
  metadata?: { target?: RawTarget }
  attributes?: {
    name?: string
    class?: string
    metadata?: { target?: RawTarget }
    relationships?: {
      referenced_by?: { data?: Array<{ id?: string; type?: string }> }
    }
  }
  relationships?: {
    referenced_by?: { data?: Array<{ id?: string; type?: string }> }
  }
}

const readRelationships = (
  sc: RawShortcut
): { referenced_by?: { data?: Array<{ id?: string; type?: string }> } } | undefined =>
  sc.relationships ?? sc.attributes?.relationships

const readMetadataTarget = (sc: RawShortcut): RawTarget | undefined =>
  sc.metadata?.target ?? sc.attributes?.metadata?.target

const readName = (sc: RawShortcut): string => sc.name ?? sc.attributes?.name ?? ''
const readClass = (sc: RawShortcut): string | undefined => sc.class ?? sc.attributes?.class

/**
 * Build the list of drives shared with the current user.
 *
 * The mobile cozy-stack rejects v60's `GET /sharings/drives` route on this
 * deployment; we instead use the data the recipient already has — each child
 * of `io.cozy.files.shared-drives-dir` is the `.url` shortcut for one drive,
 * and its `relationships.referenced_by` carries the `io.cozy.sharings` _id we
 * need to use as `driveId` when calling the per-drive content routes
 * (`GET /sharings/drives/{driveId}/{folderId}`, mirroring what
 * `Q(...).sharingById(driveId)` does in cozy-client v60).
 */
export const fetchSharedDrives = async (client: CozyClient): Promise<SharedDriveEntry[]> => {
  const result = (await client.query(
    Query('io.cozy.files')
      .where({ dir_id: SHARED_DRIVES_DIR_ID })
      .sortBy([{ type: 'asc' }, { name: 'asc' }]) as never,
    { as: `io.cozy.files/dir/${SHARED_DRIVES_DIR_ID}/drives` } as never
  )) as { data?: RawShortcut[] }
  const shortcuts = result.data ?? []
  return shortcuts
    .map((sc): SharedDriveEntry | null => {
      const shortcutId = sc._id ?? sc.id
      if (!shortcutId) return null
      // Only `.url` shortcuts represent shared drives in this folder — the
      // stack also stores other system documents here (the trash bin, etc.)
      // which mustn't surface as drives.
      const cls = readClass(sc)
      if (cls !== 'shortcut') return null
      const driveId = readRelationships(sc)?.referenced_by?.data?.[0]?.id ?? null
      const target = readMetadataTarget(sc)
      const rootFolderId = target?._id ?? target?.id ?? null
      const rawName = readName(sc)
      const name = rawName.replace(/\.url$/i, '') || rawName
      return { shortcutId, driveId, rootFolderId, name }
    })
    .filter((entry): entry is SharedDriveEntry => entry !== null)
}

/**
 * Re-fetch a single shortcut document via `io.cozy.files.shortcuts/{id}` to
 * recover the drive's rootFolderId / driveId when the listing did not carry
 * them. Mirrors what cozy-client's `useFetchShortcut` does.
 */
export const resolveSharedDriveTarget = async (
  client: CozyClient,
  shortcutId: string
): Promise<{ driveId: string | null; rootFolderId: string | null; url: string | null }> => {
  const resp = (await client.query(
    Query('io.cozy.files.shortcuts').getById(shortcutId) as never,
    {
      as: `io.cozy.files.shortcuts/${shortcutId}`,
      singleDocData: true
    } as never
  )) as { data?: RawShortcut & { url?: string } }
  const data = resp.data ?? {}
  const target = readMetadataTarget(data)
  const driveId = readRelationships(data)?.referenced_by?.data?.[0]?.id ?? null
  const rootFolderId = target?._id ?? target?.id ?? null
  const url = (data.url ?? data.attributes?.['url' as keyof typeof data.attributes]) as
    | string
    | null
    | undefined
  return { driveId, rootFolderId, url: url ?? null }
}

export interface SharedDriveDirContents {
  folder: { _id: string; name: string }
  children: RawShortcut[]
}

/**
 * Fetch the contents of a folder *inside* a shared drive.
 *
 * Uses cozy-stack-client v60's per-drive `FileCollection`: passing
 * `{ driveId }` swaps the request prefix to `/sharings/drives/{driveId}`,
 * so `.get(folderId)` hits `/sharings/drives/{driveId}/{folderId}`. Same
 * route twake-drive-web uses, no manual fetchJSON.
 */
export const fetchSharedDriveFolder = async (
  client: CozyClient,
  driveId: string,
  folderId: string
): Promise<SharedDriveDirContents> => {
  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const collection = stackClient.collection('io.cozy.files', { driveId })
  const resp = await collection.get(folderId)
  const data = resp.data ?? {}
  return {
    folder: {
      _id: data._id ?? data.id ?? folderId,
      name: data.attributes?.name ?? data.name ?? ''
    },
    children: resp.included ?? []
  }
}
