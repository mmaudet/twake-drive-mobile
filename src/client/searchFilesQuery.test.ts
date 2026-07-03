// queries.ts imports the real cozy-client `Q`, whose module entry eagerly
// requires RN native modules absent under jest (inappbrowser, ios11-devicecheck…).
// Mock cozy-client with a recording chainable so we assert the query is BUILT
// correctly, without importing the real client.
const mockCalls: Record<string, unknown> = {}
jest.mock('cozy-client', () => {
  const mkChain = () => {
    const qd = {
      where: (s: unknown) => {
        mockCalls.where = s
        return qd
      },
      partialIndex: (p: unknown) => {
        mockCalls.partialIndex = p
        return qd
      },
      indexFields: (f: unknown) => {
        mockCalls.indexFields = f
        return qd
      },
      sortBy: (s: unknown) => {
        mockCalls.sort = s
        return qd
      },
      limitBy: (n: unknown) => {
        mockCalls.limit = n
        return qd
      }
    }
    return qd
  }
  return {
    Q: (doctype: string) => {
      mockCalls.doctype = doctype
      return mkChain()
    }
  }
})

import { searchFilesQuery, searchFilesQueryAs, HIDDEN_ROOT_DIR_IDS } from './queries'

describe('searchFilesQuery', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockCalls)) delete mockCalls[k]
  })

  it('construit un $regex insensible à la casse sur name, hors corbeille', () => {
    searchFilesQuery('report')
    const sel = mockCalls.where as { name: { $regex: RegExp }; trashed: unknown }
    expect(mockCalls.doctype).toBe('io.cozy.files')
    expect(sel.name.$regex).toBeInstanceOf(RegExp)
    expect(sel.name.$regex.flags).toContain('i')
    expect(sel.name.$regex.test('Q3 REPORT.pdf')).toBe(true)
    expect(sel.trashed).toEqual({ $ne: true })
    expect(mockCalls.partialIndex).toEqual({ _id: { $nin: HIDDEN_ROOT_DIR_IDS } })
    expect(mockCalls.indexFields).toEqual(['name'])
    expect(mockCalls.sort).toEqual([{ name: 'asc' }])
    expect(mockCalls.limit).toBe(50)
  })

  it('échappe les métacaractères de la saisie', () => {
    searchFilesQuery('a.b')
    const sel = mockCalls.where as { name: { $regex: RegExp } }
    expect(sel.name.$regex.test('axb')).toBe(false)
    expect(sel.name.$regex.test('a.b')).toBe(true)
  })

  it('namespace la clé de cache par terme', () => {
    expect(searchFilesQueryAs('report')).toBe('io.cozy.files/search/report')
  })
})
