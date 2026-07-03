import { ContactQueryResult } from '@/client/queries'

import {
  contactDisplayName,
  contactPrimaryEmail,
  filterContactSuggestions,
  toSuggestion
} from './contactSuggestions'

const c = (over: Partial<ContactQueryResult> & { _id: string }): ContactQueryResult => ({
  _type: 'io.cozy.contacts',
  ...over
})

describe('contactDisplayName', () => {
  it('prefers fullname when present', () => {
    expect(
      contactDisplayName(
        c({
          _id: '1',
          fullname: 'Alice Doe',
          name: { givenName: 'Alicia', familyName: 'Smith' }
        })
      )
    ).toBe('Alice Doe')
  })

  it('falls back to givenName + familyName', () => {
    expect(
      contactDisplayName(c({ _id: '1', name: { givenName: 'Bob', familyName: 'Jones' } }))
    ).toBe('Bob Jones')
  })

  it('handles only givenName', () => {
    expect(contactDisplayName(c({ _id: '1', name: { givenName: 'Carol' } }))).toBe('Carol')
  })

  it('returns undefined when no name fields are usable', () => {
    expect(contactDisplayName(c({ _id: '1' }))).toBeUndefined()
    expect(contactDisplayName(c({ _id: '1', fullname: '   ' }))).toBeUndefined()
  })
})

describe('contactPrimaryEmail', () => {
  it('returns the primary email when flagged', () => {
    expect(
      contactPrimaryEmail(
        c({
          _id: '1',
          email: [
            { address: 'a@x.tld' },
            { address: 'b@x.tld', primary: true },
            { address: 'c@x.tld' }
          ]
        })
      )
    ).toBe('b@x.tld')
  })

  it('falls back to the first email when none is primary', () => {
    expect(
      contactPrimaryEmail(
        c({ _id: '1', email: [{ address: 'first@x.tld' }, { address: 'second@x.tld' }] })
      )
    ).toBe('first@x.tld')
  })

  it('returns undefined when no email exists', () => {
    expect(contactPrimaryEmail(c({ _id: '1' }))).toBeUndefined()
    expect(contactPrimaryEmail(c({ _id: '1', email: [] }))).toBeUndefined()
  })
})

describe('toSuggestion', () => {
  it('returns null when contact has no email', () => {
    expect(toSuggestion(c({ _id: '1', fullname: 'No Mail' }))).toBeNull()
  })

  it('falls back displayName to primary email when no name available', () => {
    expect(toSuggestion(c({ _id: '1', email: [{ address: 'only@x.tld' }] }))).toEqual({
      _id: '1',
      displayName: 'only@x.tld',
      email: 'only@x.tld',
      secondaryEmails: []
    })
  })

  it('lists secondary emails distinct from primary', () => {
    const s = toSuggestion(
      c({
        _id: '1',
        fullname: 'Multi',
        email: [
          { address: 'p@x.tld', primary: true },
          { address: 's1@x.tld' },
          { address: 's2@x.tld' }
        ]
      })
    )
    expect(s).toEqual({
      _id: '1',
      displayName: 'Multi',
      email: 'p@x.tld',
      secondaryEmails: ['s1@x.tld', 's2@x.tld']
    })
  })
})

describe('filterContactSuggestions', () => {
  const contacts: ContactQueryResult[] = [
    c({
      _id: '1',
      fullname: 'Alice Doe',
      email: [{ address: 'alice@example.com', primary: true }]
    }),
    c({
      _id: '2',
      name: { givenName: 'Bob', familyName: 'Jones' },
      email: [{ address: 'bob@example.com' }]
    }),
    c({ _id: '3', fullname: 'No Email Person' }),
    c({
      _id: '4',
      fullname: 'Carol Multi',
      email: [
        { address: 'carol@example.com', primary: true },
        { address: 'carol.work@example.com' }
      ]
    }),
    c({
      _id: '5',
      fullname: 'Already Added',
      email: [{ address: 'added@example.com', primary: true }]
    })
  ]

  it('returns reachable contacts (with email) on empty query, capped at 8', () => {
    const many: ContactQueryResult[] = Array.from({ length: 12 }).map((_, i) =>
      c({
        _id: `m${i}`,
        fullname: `Person ${i}`,
        email: [{ address: `p${i}@x.tld`, primary: true }]
      })
    )
    const out = filterContactSuggestions(many, '')
    expect(out).toHaveLength(8)
    expect(out[0].email).toBe('p0@x.tld')
  })

  it('skips contacts with no email at all', () => {
    const out = filterContactSuggestions(contacts, '')
    expect(out.find(s => s._id === '3')).toBeUndefined()
  })

  it('matches displayName case-insensitively', () => {
    const out = filterContactSuggestions(contacts, 'aLiCe')
    expect(out).toHaveLength(1)
    expect(out[0]._id).toBe('1')
  })

  it('matches primary email substring', () => {
    const out = filterContactSuggestions(contacts, 'bob@')
    expect(out).toHaveLength(1)
    expect(out[0]._id).toBe('2')
  })

  it('matches secondary email substring', () => {
    const out = filterContactSuggestions(contacts, 'carol.work')
    expect(out).toHaveLength(1)
    expect(out[0]._id).toBe('4')
  })

  it('excludes recipients already added (case-insensitive)', () => {
    const out = filterContactSuggestions(contacts, '', ['ADDED@example.com'])
    expect(out.find(s => s._id === '5')).toBeUndefined()
  })

  it('excludes recipients already added even on substring match', () => {
    const out = filterContactSuggestions(contacts, 'added', ['added@example.com'])
    expect(out).toHaveLength(0)
  })

  it('caps result list at 8 even on broad substring match', () => {
    const many: ContactQueryResult[] = Array.from({ length: 20 }).map((_, i) =>
      c({
        _id: `q${i}`,
        fullname: `Match ${i}`,
        email: [{ address: `match${i}@x.tld`, primary: true }]
      })
    )
    const out = filterContactSuggestions(many, 'match')
    expect(out).toHaveLength(8)
  })
})
