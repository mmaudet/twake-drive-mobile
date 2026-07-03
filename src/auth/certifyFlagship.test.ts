/**
 * Tests for certifyFlagship — email-code flagship certification flow.
 *
 * Key assertions:
 * - Does NOT call register() (would create a new client_id)
 * - Calls setOAuthOptions with stored credentials (reuses client_id)
 * - Passes scope:* through construction (stackClient.scope = ['*'])
 * - Returns a session with scope:'*' token
 */

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/auth/pkce', () => ({
  generatePkce: jest.fn().mockResolvedValue({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge'
  }),
  normalizeRedirectUrl: jest.fn((url: string) => url)
}))

jest.mock('@/auth/FlagshipAuthModal', () => ({
  openAuthorizeInWebView: jest.fn().mockResolvedValue('cozy://oauth?code=AUTHCODE&state=STATE'),
  FlagshipAuthModal: () => null
}))

const mockSetUri = jest.fn()
const mockSetOAuthOptions = jest.fn()
const mockRegister = jest.fn()
const mockCertifyFlagshipMethod = jest.fn()
const mockAuthorize = jest.fn()

const mockStackClient = {
  setUri: mockSetUri,
  setOAuthOptions: mockSetOAuthOptions,
  register: mockRegister,
  oauthOptions: {
    clientID: 'existing-client-id',
    clientSecret: 'existing-secret',
    clientName: 'Twake Drive Mobile',
    softwareID: 'twake-drive-mobile',
    redirectURI: 'cozy://',
    clientKind: 'mobile',
    clientURI: 'https://twake.app',
    scopes: ['io.cozy.files']
  }
}

jest.mock('cozy-client', () => {
  const MockCozyClient = jest.fn().mockImplementation(() => ({
    getStackClient: () => mockStackClient,
    certifyFlagship: mockCertifyFlagshipMethod,
    authorize: mockAuthorize
  }))
  return { __esModule: true, default: MockCozyClient }
})

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import CozyClient from 'cozy-client'
import { certifyFlagship } from './certifyFlagship'
import type { Session } from './types'

const MockCozyClient = CozyClient as jest.MockedClass<typeof CozyClient>

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockSession: Session = {
  uri: 'https://alice.example.com',
  oauthOptions: {
    clientID: 'existing-client-id',
    clientSecret: 'existing-secret',
    clientName: 'Twake Drive Mobile',
    softwareID: 'twake-drive-mobile',
    redirectURI: 'cozy://',
    clientKind: 'mobile',
    clientURI: 'https://twake.app',
    scopes: ['io.cozy.files']
  },
  token: {
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    tokenType: 'bearer',
    scope: 'io.cozy.files'
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('certifyFlagship', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCertifyFlagshipMethod.mockResolvedValue(undefined)
    mockAuthorize.mockResolvedValue({
      token: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'bearer',
        scope: '*'
      }
    })
  })

  it('does NOT call register() — reuses existing client_id', async () => {
    await certifyFlagship(mockSession)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('calls setOAuthOptions with stored credentials to reuse the client_id', async () => {
    await certifyFlagship(mockSession)
    expect(mockSetOAuthOptions).toHaveBeenCalledWith(
      expect.objectContaining({ clientID: 'existing-client-id' })
    )
  })

  it('constructs CozyClient with scope:["*"] so authorize uses scope:* in the URL', async () => {
    await certifyFlagship(mockSession)
    expect(MockCozyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: ['*']
      })
    )
  })

  it('returns a session with scope:"*" on the token', async () => {
    const result = await certifyFlagship(mockSession)
    expect(result.token.scope).toBe('*')
    expect(result.token.accessToken).toBe('new-access-token')
    expect(result.token.refreshToken).toBe('new-refresh-token')
  })

  it('preserves the original uri and client_id in the returned session', async () => {
    const result = await certifyFlagship(mockSession)
    expect(result.uri).toBe('https://alice.example.com')
    expect(result.oauthOptions.clientID).toBe('existing-client-id')
  })

  it('swallows certifyFlagship() errors (attestation will always fail without native module)', async () => {
    mockCertifyFlagshipMethod.mockRejectedValue(new Error('Attestation failed'))
    // Should not throw — the email-code flow (authorize) continues
    await expect(certifyFlagship(mockSession)).resolves.toBeDefined()
  })
})
