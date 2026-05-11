jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn().mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue(undefined),
      localUri: 'file:///mock/template.docx'
    })
  }
}))

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0))
  }))
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { buildFinalName, createOfficeFile } from './createOfficeFile'

describe('buildFinalName', () => {
  it('appends ext when missing', () => {
    expect(buildFinalName('Notes', 'docx')).toBe('Notes.docx')
  })

  it('keeps ext when already present (case-insensitive)', () => {
    expect(buildFinalName('Notes.docx', 'docx')).toBe('Notes.docx')
    expect(buildFinalName('Notes.DOCX', 'docx')).toBe('Notes.DOCX')
  })

  it('falls back to Untitled when name is empty', () => {
    expect(buildFinalName('   ', 'xlsx')).toBe('Untitled.xlsx')
    expect(buildFinalName('', 'pptx')).toBe('Untitled.pptx')
  })

  it('trims surrounding whitespace', () => {
    expect(buildFinalName('  Hello  ', 'docx')).toBe('Hello.docx')
  })
})

describe('createOfficeFile', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls createFile with built name + dirId + contentType, returns id/name', async () => {
    const createFile = jest.fn().mockResolvedValue({
      data: { _id: 'new-id', attributes: { name: 'Notes.docx' } }
    })
    const client = {
      collection: () => ({ createFile })
    } as unknown as import('cozy-client').default

    const result = await createOfficeFile(client, 'text', 'Notes', 'parent-id')

    expect(createFile).toHaveBeenCalledWith(expect.anything(), {
      name: 'Notes.docx',
      dirId: 'parent-id',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    expect(result).toEqual({ _id: 'new-id', name: 'Notes.docx' })
  })

  it('falls back to data.id when _id missing', async () => {
    const createFile = jest.fn().mockResolvedValue({
      data: { id: 'fallback-id', attributes: { name: 'X.xlsx' } }
    })
    const client = { collection: () => ({ createFile }) } as unknown as import('cozy-client').default

    const result = await createOfficeFile(client, 'sheet', 'X', 'p')
    expect(result._id).toBe('fallback-id')
  })

  it('throws when no id is returned', async () => {
    const createFile = jest.fn().mockResolvedValue({ data: {} })
    const client = { collection: () => ({ createFile }) } as unknown as import('cozy-client').default

    await expect(createOfficeFile(client, 'slide', 'X', 'p')).rejects.toThrow(/no id/)
  })

  it('triggers a pouch replication on success', async () => {
    const createFile = jest.fn().mockResolvedValue({
      data: { _id: 'new-id', attributes: { name: 'Notes.docx' } }
    })
    const client = {
      collection: () => ({ createFile })
    } as unknown as import('cozy-client').default

    await createOfficeFile(client, 'text', 'Notes', 'parent-id')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('does NOT trigger pouch replication when the stack call fails', async () => {
    const createFile = jest.fn().mockRejectedValue(new Error('boom'))
    const client = {
      collection: () => ({ createFile })
    } as unknown as import('cozy-client').default

    await expect(createOfficeFile(client, 'text', 'Notes', 'parent-id')).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})
