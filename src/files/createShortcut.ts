import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export interface CreatedShortcut {
  _id: string
  name: string
}

interface ShortcutCreateResult {
  _id?: string
  id?: string
  name?: string
  attributes?: { name?: string }
}

interface ShortcutsCollection {
  create: (attrs: {
    name: string
    dir_id: string
    url: string
  }) => Promise<{ data: ShortcutCreateResult }>
}

/**
 * Creates a `.url` shortcut inside `dirId` using the `io.cozy.files.shortcuts`
 * collection. Mirrors how twake-drive-web's `ShortcutCreationModal` works:
 * the cozy-stack `/files/shortcuts` endpoint accepts `{ name, dir_id, url }`
 * and returns an `io.cozy.files` document with `class: 'shortcut'`.
 */
export const createShortcut = async (
  client: CozyClient,
  dirId: string,
  name: string,
  url: string
): Promise<CreatedShortcut> => {
  const trimmedName = name.trim()
  const trimmedUrl = url.trim()
  if (!trimmedName) throw new Error('Shortcut name cannot be empty')
  if (!trimmedUrl) throw new Error('Shortcut URL cannot be empty')

  const collection = client.collection('io.cozy.files.shortcuts') as unknown as ShortcutsCollection

  const result = await collection.create({
    name: trimmedName,
    dir_id: dirId,
    url: trimmedUrl
  })

  const data = result.data
  const id = data._id ?? data.id
  if (!id) throw new Error('Shortcut creation returned no id')

  triggerPouchReplication(client, 'io.cozy.files')
  return {
    _id: id,
    name: data.attributes?.name ?? data.name ?? trimmedName
  }
}
