import { softDeleteEntry } from './deleteFile'

const mockSyncImmediately = jest.fn()
jest.mock('@/client/createClient', () => ({
  pouchLink: { syncImmediately: (...args: unknown[]) => mockSyncImmediately(...args) }
}))

describe('softDeleteEntry', () => {
  it('calls client.destroy with the entry doc', async () => {
    const destroy = jest.fn().mockResolvedValue({})
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await softDeleteEntry(client, { _id: 'abc', _rev: '1-xyz', name: 'doc.pdf' })
    expect(destroy).toHaveBeenCalledWith({
      _id: 'abc',
      _rev: '1-xyz',
      _type: 'io.cozy.files'
    })
  })

  it('defaults _type to io.cozy.files when missing', async () => {
    const destroy = jest.fn().mockResolvedValue({})
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await softDeleteEntry(client, { _id: 'abc' })
    expect(destroy).toHaveBeenCalledWith({
      _id: 'abc',
      _rev: undefined,
      _type: 'io.cozy.files'
    })
  })

  it('honours an explicit _type', async () => {
    const destroy = jest.fn().mockResolvedValue({})
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await softDeleteEntry(client, { _id: 'abc', _type: 'io.cozy.contacts' })
    expect(destroy).toHaveBeenCalledWith({
      _id: 'abc',
      _rev: undefined,
      _type: 'io.cozy.contacts'
    })
  })

  it('propagates client errors', async () => {
    const destroy = jest.fn().mockRejectedValue(new Error('boom'))
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await expect(softDeleteEntry(client, { _id: 'abc' })).rejects.toThrow('boom')
  })
})

describe('softDeleteEntry — pouch sync', () => {
  beforeEach(() => {
    mockSyncImmediately.mockReset()
  })

  it('schedules an immediate pouch sync after a successful destroy', async () => {
    const destroy = jest.fn().mockResolvedValue({})
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await softDeleteEntry(client, { _id: 'abc' })
    expect(mockSyncImmediately).toHaveBeenCalledTimes(1)
  })

  it('does not call syncImmediately when destroy throws', async () => {
    const destroy = jest.fn().mockRejectedValue(new Error('boom'))
    const client = { destroy } as unknown as Parameters<typeof softDeleteEntry>[0]
    await expect(softDeleteEntry(client, { _id: 'abc' })).rejects.toThrow()
    expect(mockSyncImmediately).not.toHaveBeenCalled()
  })
})
