jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

import { PublicLinkPermission, SharingDoc } from '@/files/sharing'
import { buildByIdMap, entryToStatus } from './SharingProvider'

const sharing = (overrides: Partial<SharingDoc['attributes']>, id = 's1'): SharingDoc => ({
  _id: id,
  attributes: {
    active: true,
    rules: [],
    members: [],
    owner: false,
    ...overrides
  }
})

const link = (values: string[], id = 'p1', key = 'rule0'): PublicLinkPermission => ({
  _id: id,
  attributes: {
    permissions: { [key]: { type: 'io.cozy.files', values } }
  }
})

describe('buildByIdMap', () => {
  it('returns an empty map when there are no sharings or permissions', () => {
    expect(buildByIdMap([], []).size).toBe(0)
  })

  it('skips sharings flagged as inactive', () => {
    const s = sharing({
      active: false,
      rules: [{ doctype: 'io.cozy.files', values: ['file-a'] }]
    })
    expect(buildByIdMap([s], []).size).toBe(0)
  })

  it('maps a file to a sharing entry with owner and recipients', () => {
    const s = sharing({
      owner: true,
      rules: [{ doctype: 'io.cozy.files', values: ['file-a', 'file-b'] }],
      members: [
        { status: 'owner', email: 'me@cozy' },
        { status: 'ready', email: 'alice@x' },
        { status: 'pending', email: 'bob@x' }
      ]
    })
    const map = buildByIdMap([s], [])
    expect(map.size).toBe(2)

    const entryA = map.get('file-a')!
    expect(entryA.isOwner).toBe(true)
    expect(entryA.hasLink).toBe(false)
    expect(entryA.recipients.map(r => r.email)).toEqual(['alice@x', 'bob@x'])
    expect(entryA.sharing?._id).toBe('s1')
  })

  it('also reads rules/members from the flattened (non-attributes) shape', () => {
    const s: SharingDoc = {
      _id: 's-flat',
      rules: [{ doctype: 'io.cozy.files', values: ['file-flat'] }],
      members: [{ status: 'owner' }, { status: 'ready', email: 'flat@x' }],
      owner: false
    }
    const entry = buildByIdMap([s], []).get('file-flat')!
    expect(entry.recipients).toHaveLength(1)
    expect(entry.recipients[0].email).toBe('flat@x')
  })

  it('flags hasLink=true when a file appears in a public-link permission', () => {
    const p = link(['file-c'])
    const entry = buildByIdMap([], [p]).get('file-c')!
    expect(entry.hasLink).toBe(true)
    expect(entry.sharing).toBeUndefined()
    expect(entry.isOwner).toBe(false)
  })

  it('combines sharing and link entries for the same file', () => {
    const s = sharing({
      rules: [{ doctype: 'io.cozy.files', values: ['file-d'] }],
      owner: true,
      members: [{ status: 'owner' }, { status: 'ready', email: 'r@x' }]
    })
    const p = link(['file-d'])
    const entry = buildByIdMap([s], [p]).get('file-d')!
    expect(entry.isOwner).toBe(true)
    expect(entry.hasLink).toBe(true)
    expect(entry.recipients).toHaveLength(1)
  })

  it('promotes isOwner if any active sharing for the file owns it', () => {
    const a = sharing(
      { rules: [{ doctype: 'io.cozy.files', values: ['file-e'] }], owner: false },
      's-a'
    )
    const b = sharing(
      { rules: [{ doctype: 'io.cozy.files', values: ['file-e'] }], owner: true },
      's-b'
    )
    const entry = buildByIdMap([a, b], []).get('file-e')!
    expect(entry.isOwner).toBe(true)
  })

  it('ignores rules whose doctype is not io.cozy.files', () => {
    const s = sharing({
      rules: [
        { doctype: 'io.cozy.contacts', values: ['contact-x'] },
        { doctype: 'io.cozy.files', values: ['file-f'] }
      ]
    })
    const map = buildByIdMap([s], [])
    expect(map.has('contact-x')).toBe(false)
    expect(map.has('file-f')).toBe(true)
  })
})

describe('entryToStatus', () => {
  it('returns null for an undefined entry', () => {
    expect(entryToStatus(undefined)).toBeNull()
  })

  it('returns null for an entry that has neither a sharing nor a link', () => {
    expect(entryToStatus({ isOwner: false, hasLink: false, recipients: [] })).toBeNull()
  })

  it('projects a sharing-only entry into a status object', () => {
    const s = sharing({ rules: [{ doctype: 'io.cozy.files', values: ['x'] }] })
    const entry = buildByIdMap([s], []).get('x')!
    expect(entryToStatus(entry)).toEqual({
      isShared: true,
      isOwner: false,
      hasLink: false,
      recipientCount: 0
    })
  })

  it('projects a link-only entry into a status object', () => {
    const entry = buildByIdMap([], [link(['y'])]).get('y')!
    expect(entryToStatus(entry)).toEqual({
      isShared: true,
      isOwner: false,
      hasLink: true,
      recipientCount: 0
    })
  })
})
