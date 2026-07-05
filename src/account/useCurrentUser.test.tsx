import { deriveInitials } from './useCurrentUser'

describe('deriveInitials', () => {
  it('takes the first letters of the first two words of the name', () => {
    expect(deriveInitials('Michel Maudet', 'x@y.z')).toBe('MM')
    expect(deriveInitials('Alice', undefined)).toBe('A')
  })
  it('falls back to the email local-part when there is no name', () => {
    expect(deriveInitials(undefined, 'mmaudet@linagora.com')).toBe('M')
  })
  it('returns U when nothing is available', () => {
    expect(deriveInitials(undefined, undefined)).toBe('U')
  })
})
