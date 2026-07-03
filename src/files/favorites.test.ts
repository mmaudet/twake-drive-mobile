import { isFavorite, toggleFavorite } from './favorites'
import type { FileQueryResult } from '@/client/queries'

// Minimal fake file used across tests
const makeFile = (favorite?: boolean): FileQueryResult => ({
  _id: 'file-1',
  _type: 'io.cozy.files',
  name: 'test.pdf',
  type: 'file',
  cozyMetadata: favorite !== undefined ? { favorite } : undefined
})

// Fake cozy-client with a tracked `save` method
const makeMockClient = () => {
  const save = jest.fn().mockResolvedValue({ data: {} })
  return { save } as unknown as import('cozy-client').default & { save: jest.Mock }
}

describe('isFavorite', () => {
  it('returns true when cozyMetadata.favorite is true', () => {
    expect(isFavorite(makeFile(true))).toBe(true)
  })

  it('returns false when cozyMetadata.favorite is false', () => {
    expect(isFavorite(makeFile(false))).toBe(false)
  })

  it('returns false when cozyMetadata is absent', () => {
    expect(isFavorite(makeFile())).toBe(false)
  })

  it('returns false when the file has no cozyMetadata at all', () => {
    const f = { _id: 'f', _type: 'io.cozy.files', name: 'x', type: 'file' } as FileQueryResult
    expect(isFavorite(f)).toBe(false)
  })
})

describe('toggleFavorite', () => {
  it('calls client.save with cozyMetadata.favorite = true when next is true', async () => {
    const client = makeMockClient()
    const file = makeFile(false)
    await toggleFavorite(client, file, true)
    expect(client.save).toHaveBeenCalledTimes(1)
    const arg = client.save.mock.calls[0][0] as FileQueryResult & {
      cozyMetadata: { favorite: boolean }
    }
    expect(arg.cozyMetadata.favorite).toBe(true)
    // Other fields preserved
    expect(arg._id).toBe('file-1')
    expect(arg.name).toBe('test.pdf')
  })

  it('calls client.save with cozyMetadata.favorite = false when next is false', async () => {
    const client = makeMockClient()
    const file = makeFile(true)
    await toggleFavorite(client, file, false)
    const arg = client.save.mock.calls[0][0] as FileQueryResult & {
      cozyMetadata: { favorite: boolean }
    }
    expect(arg.cozyMetadata.favorite).toBe(false)
  })

  it('merges into existing cozyMetadata without losing other fields', async () => {
    const client = makeMockClient()
    const file: FileQueryResult = {
      _id: 'f',
      _type: 'io.cozy.files',
      name: 'doc.txt',
      type: 'file',
      cozyMetadata: { createdBy: { account: 'acct-1' }, favorite: false }
    }
    await toggleFavorite(client, file, true)
    const arg = client.save.mock.calls[0][0] as { cozyMetadata: Record<string, unknown> }
    expect(arg.cozyMetadata.createdBy).toEqual({ account: 'acct-1' })
    expect(arg.cozyMetadata.favorite).toBe(true)
  })

  it('returns the promise from client.save', async () => {
    const client = makeMockClient()
    client.save.mockResolvedValue({ data: { _id: 'file-1' } })
    const file = makeFile(false)
    await expect(toggleFavorite(client, file, true)).resolves.toBeUndefined()
  })
})
