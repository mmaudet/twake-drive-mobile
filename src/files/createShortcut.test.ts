jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { createShortcut } from './createShortcut'

const makeClient = (createImpl: (...args: unknown[]) => unknown) =>
  ({
    collection: () => ({ create: createImpl })
  }) as unknown as import('cozy-client').default

describe('createShortcut', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls io.cozy.files.shortcuts collection create with name, dir_id, url', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { _id: 'sc-1', attributes: { name: 'My shortcut.url' } }
    })
    await createShortcut(makeClient(create), 'dir-123', 'My shortcut', 'https://example.com')
    expect(create).toHaveBeenCalledWith({
      name: 'My shortcut',
      dir_id: 'dir-123',
      url: 'https://example.com'
    })
  })

  it('returns the created doc _id and name', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { _id: 'sc-42', attributes: { name: 'Link.url' } }
    })
    const result = await createShortcut(
      makeClient(create),
      'dir-123',
      'Link',
      'https://example.com'
    )
    expect(result._id).toBe('sc-42')
    expect(result.name).toBe('Link.url')
  })

  it('falls back to id when _id is absent', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { id: 'sc-99' }
    })
    const result = await createShortcut(makeClient(create), 'dir-123', 'Foo', 'https://example.com')
    expect(result._id).toBe('sc-99')
  })

  it('trims name and url', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { _id: 'sc-1', attributes: { name: 'My link.url' } }
    })
    await createShortcut(makeClient(create), 'dir-123', '  My link  ', '  https://example.com  ')
    expect(create).toHaveBeenCalledWith({
      name: 'My link',
      dir_id: 'dir-123',
      url: 'https://example.com'
    })
  })

  it('throws when name is empty', async () => {
    const create = jest.fn()
    await expect(
      createShortcut(makeClient(create), 'dir-123', '   ', 'https://example.com')
    ).rejects.toThrow(/name/)
    expect(create).not.toHaveBeenCalled()
  })

  it('throws when url is empty', async () => {
    const create = jest.fn()
    await expect(createShortcut(makeClient(create), 'dir-123', 'My link', '   ')).rejects.toThrow(
      /URL/
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('throws when creation returns no id', async () => {
    const create = jest.fn().mockResolvedValue({ data: {} })
    await expect(
      createShortcut(makeClient(create), 'dir-123', 'Foo', 'https://example.com')
    ).rejects.toThrow(/no id/)
  })

  it('triggers pouch replication on success', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { _id: 'sc-1', attributes: { name: 'Test.url' } }
    })
    const client = makeClient(create)
    await createShortcut(client, 'dir-123', 'Test', 'https://example.com')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('does NOT trigger replication on failure', async () => {
    const create = jest.fn().mockRejectedValue(new Error('boom'))
    const client = makeClient(create)
    await expect(createShortcut(client, 'dir-123', 'Foo', 'https://example.com')).rejects.toThrow(
      'boom'
    )
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})
