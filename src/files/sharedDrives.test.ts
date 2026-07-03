import { fetchSharedDriveFolder, fetchSharedDrives } from './sharedDrives'

const buildClient = (
  queryResponse: unknown,
  collectionGetResponse?: unknown
): {
  client: never
  query: jest.Mock
  collectionGet: jest.Mock
  collection: jest.Mock
} => {
  const query = jest.fn().mockResolvedValue(queryResponse)
  const collectionGet = jest.fn().mockResolvedValue(collectionGetResponse)
  const collection = jest.fn(() => ({ get: collectionGet }))
  return {
    client: { query, getStackClient: () => ({ collection }) } as never,
    query,
    collectionGet,
    collection
  }
}

describe('fetchSharedDrives', () => {
  it('queries io.cozy.files inside shared-drives-dir and maps shortcuts to drives', async () => {
    const { client, query } = buildClient({
      data: [
        {
          _id: 'shortcut-1',
          _type: 'io.cozy.files',
          name: 'Marketing.url',
          type: 'file',
          class: 'shortcut',
          metadata: { target: { _id: 'root-folder-A' } },
          relationships: {
            referenced_by: { data: [{ id: 'sharing-A', type: 'io.cozy.sharings' }] }
          }
        }
      ]
    })
    const drives = await fetchSharedDrives(client)
    expect(drives).toEqual([
      {
        shortcutId: 'shortcut-1',
        driveId: 'sharing-A',
        rootFolderId: 'root-folder-A',
        name: 'Marketing'
      }
    ])
    const definition = query.mock.calls[0][0]
    expect(definition.doctype).toBe('io.cozy.files')
    expect(definition.selector).toMatchObject({ dir_id: 'io.cozy.files.shared-drives-dir' })
  })

  it('keeps every shortcut even when driveId/rootFolderId are missing (resolved lazily on tap)', async () => {
    const { client } = buildClient({
      data: [
        // not a shortcut — must be filtered out (e.g. system trash entry)
        { _id: 'a', name: 'plain.txt', class: 'text', type: 'file' },
        {
          _id: 'b',
          name: 'Orphan.url',
          class: 'shortcut',
          metadata: { target: { _id: 'root-b' } }
        },
        {
          _id: 'c',
          name: 'NoTarget.url',
          class: 'shortcut',
          relationships: { referenced_by: { data: [{ id: 'sh-c' }] } }
        },
        {
          _id: 'd',
          name: 'Engineering.url',
          class: 'shortcut',
          metadata: { target: { _id: 'root-d' } },
          relationships: { referenced_by: { data: [{ id: 'sh-d' }] } }
        }
      ]
    })
    const drives = await fetchSharedDrives(client)
    expect(drives.map(d => d.shortcutId)).toEqual(['b', 'c', 'd'])
    expect(drives[0]).toMatchObject({ driveId: null, rootFolderId: 'root-b' })
    expect(drives[1]).toMatchObject({ driveId: 'sh-c', rootFolderId: null })
    expect(drives[2]).toMatchObject({
      driveId: 'sh-d',
      rootFolderId: 'root-d',
      name: 'Engineering'
    })
  })

  it('reads metadata.target / relationships from JSON-API attributes when not normalized', async () => {
    const { client } = buildClient({
      data: [
        {
          _id: 'jsonapi-1',
          attributes: {
            name: 'Marketing.url',
            class: 'shortcut',
            metadata: { target: { _id: 'root-Z' } },
            relationships: { referenced_by: { data: [{ id: 'sh-Z' }] } }
          }
        }
      ]
    })
    const drives = await fetchSharedDrives(client)
    expect(drives[0]).toMatchObject({
      shortcutId: 'jsonapi-1',
      driveId: 'sh-Z',
      rootFolderId: 'root-Z',
      name: 'Marketing'
    })
  })

  it('keeps the original name when stripping .url leaves it empty', async () => {
    const { client } = buildClient({
      data: [
        {
          _id: 'a',
          name: '.url',
          class: 'shortcut',
          metadata: { target: { _id: 'root' } },
          relationships: { referenced_by: { data: [{ id: 'sh' }] } }
        }
      ]
    })
    const drives = await fetchSharedDrives(client)
    expect(drives[0].name).toBe('.url')
  })
})

describe('fetchSharedDriveFolder', () => {
  it('opens FileCollection with driveId and calls .get(folderId)', async () => {
    const { client, collection, collectionGet } = buildClient(undefined, {
      data: { _id: 'folder-1', attributes: { name: 'Shared Folder' } },
      included: [
        { _id: 'child-a', name: 'a.txt', type: 'file', class: 'text' },
        { _id: 'child-b', name: 'sub', type: 'directory' }
      ]
    })
    const result = await fetchSharedDriveFolder(client, 'sharing-A', 'folder-1')
    expect(collection).toHaveBeenCalledWith('io.cozy.files', { driveId: 'sharing-A' })
    expect(collectionGet).toHaveBeenCalledWith('folder-1')
    expect(result.folder).toEqual({ _id: 'folder-1', name: 'Shared Folder' })
    expect(result.children).toHaveLength(2)
    expect(result.children[0]._id).toBe('child-a')
  })

  it('returns empty children array when included is missing', async () => {
    const { client } = buildClient(undefined, { data: { _id: 'f', name: 'F' } })
    const result = await fetchSharedDriveFolder(client, 'sh', 'f')
    expect(result.children).toEqual([])
    expect(result.folder).toEqual({ _id: 'f', name: 'F' })
  })
})
