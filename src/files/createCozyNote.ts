import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export interface CreatedNote {
  _id: string
  name?: string
}

interface CreateNoteResultData {
  _id?: string
  id?: string
  attributes?: { name?: string }
}

interface NotesCollection {
  create: (attrs: { dir_id: string }) => Promise<{ data: CreateNoteResultData }>
}

/**
 * Mirrors twake-drive web's CreateNoteItem flow: ask the cozy stack to
 * create a new `io.cozy.notes` document inside `dirId`. The stack is the
 * one that fills in defaults (title, schema...). Returns the new note id.
 */
export const createCozyNote = async (client: CozyClient, dirId: string): Promise<CreatedNote> => {
  const collection = client.collection('io.cozy.notes') as unknown as NotesCollection
  const result = await collection.create({ dir_id: dirId })
  triggerPouchReplication(client, 'io.cozy.files')
  triggerPouchReplication(client, 'io.cozy.notes')
  const data = result.data
  const id = data._id ?? data.id
  if (!id) throw new Error('Note creation returned no id')
  return { _id: id, name: data.attributes?.name }
}
