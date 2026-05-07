// Deep import to skip cozy-client's mobile.native authentication module which
// pulls in `react-native-inappbrowser-reborn` (we stub that in the bundler but
// jest does not resolve it). The dsl module is self-contained.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Q } = require('cozy-client/dist/queries/dsl') as typeof import('cozy-client')
import type CozyClient from 'cozy-client'

interface ShortcutDoc {
  url?: string
  attributes?: { url?: string }
  metadata?: {
    target?: { _id?: string; _type?: string; doctype?: string; app?: string }
  }
}

const fetchShortcutDoc = async (client: CozyClient, fileId: string): Promise<ShortcutDoc> => {
  const result = (await client.query(Q('io.cozy.files.shortcuts').getById(fileId), {
    as: `io.cozy.files.shortcuts/${fileId}`,
    singleDocData: true
  } as unknown as Parameters<CozyClient['query']>[1])) as { data?: ShortcutDoc }
  return result.data ?? {}
}

/**
 * Mirror of `useFetchShortcut` from cozy-client (used by twake-drive web's
 * `ExternalRedirect`): we resolve a `.url` file by querying the
 * `io.cozy.files.shortcuts` doctype which exposes the embedded URL.
 *
 * Returns the resolved target URL, or `null` when the document does not
 * carry one.
 */
export const fetchShortcutUrl = async (
  client: CozyClient,
  fileId: string
): Promise<string | null> => {
  const data = await fetchShortcutDoc(client, fileId)
  return data.url ?? data.attributes?.url ?? null
}

/**
 * Resolve a `.url` shortcut into the file/folder it points at on the same
 * Cozy instance. Returns `{ _id, _type }` of the target document — or
 * `null` when the shortcut points elsewhere (external URL, different
 * instance) or has no `metadata.target` attribute.
 *
 * Used to turn the shared-drive shortcuts living inside
 * `io.cozy.files.shared-drives-dir` into navigable folders without hitting
 * the v60-only `/sharings/drives` route.
 */
export const fetchShortcutTarget = async (
  client: CozyClient,
  fileId: string
): Promise<{ _id: string; _type?: string } | null> => {
  const data = await fetchShortcutDoc(client, fileId)
  const target = data.metadata?.target
  if (!target?._id) return null
  return { _id: target._id, _type: target._type ?? target.doctype }
}
