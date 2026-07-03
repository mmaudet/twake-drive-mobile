jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { renameEntry, RenameConflictError } from './renameEntry'

const buildClient = (updateAttributes: jest.Mock) =>
  ({
    collection: jest.fn(() => ({ updateAttributes }))
  }) as unknown as Parameters<typeof renameEntry>[0]

describe('renameEntry', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls updateAttributes with trimmed name', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({ data: { _id: 'a', name: 'b' } })
    await renameEntry(buildClient(updateAttributes), 'abc', '  new name  ')
    expect(updateAttributes).toHaveBeenCalledWith('abc', { name: 'new name' })
  })

  it('returns the updated doc', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({ data: { _id: 'abc', name: 'new' } })
    const res = await renameEntry(buildClient(updateAttributes), 'abc', 'new')
    expect(res).toEqual({ _id: 'abc', name: 'new' })
  })

  it('throws when the trimmed name is empty', async () => {
    const updateAttributes = jest.fn()
    await expect(renameEntry(buildClient(updateAttributes), 'a', '   ')).rejects.toThrow(
      'Name cannot be empty'
    )
    expect(updateAttributes).not.toHaveBeenCalled()
  })

  it('throws RenameConflictError on HTTP 409', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest.fn().mockRejectedValue(conflict)
    await expect(renameEntry(buildClient(updateAttributes), 'a', 'b')).rejects.toBeInstanceOf(
      RenameConflictError
    )
  })

  it('throws RenameConflictError when error.response.status is 409', async () => {
    const conflict = Object.assign(new Error('conflict'), { response: { status: 409 } })
    const updateAttributes = jest.fn().mockRejectedValue(conflict)
    await expect(renameEntry(buildClient(updateAttributes), 'a', 'b')).rejects.toBeInstanceOf(
      RenameConflictError
    )
  })

  it('triggers a pouch replication on success', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({ data: { _id: 'abc', name: 'new' } })
    const client = buildClient(updateAttributes)
    await renameEntry(client, 'abc', 'new')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('does NOT trigger pouch replication on failure', async () => {
    const updateAttributes = jest.fn().mockRejectedValue(new Error('boom'))
    const client = buildClient(updateAttributes)
    await expect(renameEntry(client, 'abc', 'new')).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})
