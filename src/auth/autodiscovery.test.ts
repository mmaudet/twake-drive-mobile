import nock from 'nock'

import {
  extractDomain,
  fetchTwakeConfiguration,
  getLoginUri,
  getTwakeWorkplaceLoginUri
} from './autodiscovery'

describe('extractDomain', () => {
  it('returns the domain part of a valid email', () => {
    expect(extractDomain('user@example.com')).toBe('example.com')
  })

  it('handles emails with subdomains', () => {
    expect(extractDomain('user@mail.example.com')).toBe('mail.example.com')
  })

  it('returns null for an empty string', () => {
    expect(extractDomain('')).toBeNull()
  })

  it('returns null for a string without @', () => {
    expect(extractDomain('not-an-email')).toBeNull()
  })

  it('trims whitespace', () => {
    expect(extractDomain('  user@example.com  ')).toBe('example.com')
  })

  it('uses the last @ if multiple are present', () => {
    expect(extractDomain('weird@@example.com')).toBe('example.com')
  })
})

describe('fetchTwakeConfiguration', () => {
  afterEach(() => nock.cleanAll())

  it('returns the parsed configuration on 200', async () => {
    nock('https://example.com')
      .get('/.well-known/twake-configuration')
      .reply(200, { 'twake-flagship-login-uri': 'https://login.example.com/oauth' })

    const result = await fetchTwakeConfiguration('example.com')
    expect(result).toEqual({ 'twake-flagship-login-uri': 'https://login.example.com/oauth' })
  })

  it('returns null on non-200 response', async () => {
    nock('https://example.com').get('/.well-known/twake-configuration').reply(404)
    const result = await fetchTwakeConfiguration('example.com')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    nock('https://example.com').get('/.well-known/twake-configuration').replyWithError('boom')
    const result = await fetchTwakeConfiguration('example.com')
    expect(result).toBeNull()
  })
})

describe('getLoginUri', () => {
  afterEach(() => nock.cleanAll())

  it('returns the login URI with redirect_after_oidc appended', async () => {
    nock('https://example.com')
      .get('/.well-known/twake-configuration')
      .reply(200, { 'twake-flagship-login-uri': 'https://login.example.com/oauth' })

    const result = await getLoginUri('user@example.com')
    expect(result).not.toBeNull()
    expect(result?.origin).toBe('https://login.example.com')
    expect(result?.searchParams.get('redirect_after_oidc')).toBe('cozy://')
  })

  it('returns null for an invalid email', async () => {
    expect(await getLoginUri('not-an-email')).toBeNull()
  })

  it('returns null when twake-configuration has no flagship-login-uri', async () => {
    nock('https://example.com')
      .get('/.well-known/twake-configuration')
      .reply(200, { 'twake-pass-login-uri': 'https://pass.example.com' })
    expect(await getLoginUri('user@example.com')).toBeNull()
  })

  it('preserves existing query params on the login URI', async () => {
    nock('https://example.com').get('/.well-known/twake-configuration').reply(200, {
      'twake-flagship-login-uri': 'https://login.example.com/oauth?client_id=foo'
    })
    const result = await getLoginUri('user@example.com')
    expect(result?.searchParams.get('client_id')).toBe('foo')
    expect(result?.searchParams.get('redirect_after_oidc')).toBe('cozy://')
  })
})

describe('getTwakeWorkplaceLoginUri', () => {
  // The Twake Workplace consumer sign-up / sign-in host is sign-up.twake.app
  // (hyphenated) — NOT signup.twake.app.
  it('targets the sign-up.twake.app host with the cozy redirect (sign-in)', () => {
    const uri = getTwakeWorkplaceLoginUri('signin')
    expect(uri.host).toBe('sign-up.twake.app')
    expect(uri.searchParams.get('redirect_after_oidc')).toBe('cozy://')
    expect(uri.searchParams.get('signup')).toBeNull()
  })

  it('adds signup=true in sign-up mode (same host)', () => {
    const uri = getTwakeWorkplaceLoginUri('signup')
    expect(uri.host).toBe('sign-up.twake.app')
    expect(uri.searchParams.get('signup')).toBe('true')
  })
})
