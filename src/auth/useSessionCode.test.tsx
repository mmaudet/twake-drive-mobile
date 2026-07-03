import { renderHook } from '@testing-library/react-native'
import { useSessionCode } from './useSessionCode'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/files/cozyAppLink', () => ({
  getSessionCode: jest.fn()
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: jest.fn()
}))

jest.mock('@/auth/useAuth', () => ({
  useAuth: jest.fn()
}))

// ---------------------------------------------------------------------------
// Typed imports AFTER mocks are registered
// ---------------------------------------------------------------------------

import * as cozyAppLink from '@/files/cozyAppLink'
import { useClient } from 'cozy-client'
import { useAuth } from '@/auth/useAuth'

const mockGetSessionCode = cozyAppLink.getSessionCode as jest.MockedFunction<
  typeof cozyAppLink.getSessionCode
>
const mockUseClient = useClient as jest.MockedFunction<typeof useClient>
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeClient = {} as import('cozy-client').default
const fakeNewClient = {} as import('cozy-client').default

const fakeCertifyFlagship = jest.fn()

const makeAuthContext = () => ({
  status: 'authenticated' as const,
  client: fakeClient,
  login: jest.fn(),
  logout: jest.fn(),
  certifyFlagship: fakeCertifyFlagship
})

const setup = () => {
  mockUseClient.mockReturnValue(fakeClient)
  mockUseAuth.mockReturnValue(makeAuthContext())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionCode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the session code on first success without calling certifyFlagship', async () => {
    setup()
    mockGetSessionCode.mockResolvedValue('code-abc')

    const { result } = renderHook(() => useSessionCode())
    const code = await result.current()

    expect(code).toBe('code-abc')
    expect(mockGetSessionCode).toHaveBeenCalledTimes(1)
    expect(mockGetSessionCode).toHaveBeenCalledWith(fakeClient)
    expect(fakeCertifyFlagship).not.toHaveBeenCalled()
  })

  it('calls certifyFlagship once and retries on "Not authorized" error', async () => {
    setup()
    fakeCertifyFlagship.mockResolvedValue(fakeNewClient)

    mockGetSessionCode
      .mockRejectedValueOnce(new Error('Not authorized'))
      .mockResolvedValueOnce('code-refreshed')

    const { result } = renderHook(() => useSessionCode())
    const code = await result.current()

    expect(fakeCertifyFlagship).toHaveBeenCalledTimes(1)
    expect(mockGetSessionCode).toHaveBeenCalledTimes(2)
    expect(mockGetSessionCode).toHaveBeenNthCalledWith(1, fakeClient)
    expect(mockGetSessionCode).toHaveBeenNthCalledWith(2, fakeNewClient)
    expect(code).toBe('code-refreshed')
  })

  it('does NOT call certifyFlagship a second time if already attempted (loop guard)', async () => {
    setup()
    fakeCertifyFlagship.mockResolvedValue(fakeNewClient)

    // Both calls throw Not authorized — second should rethrow without calling certify again
    mockGetSessionCode.mockRejectedValue(new Error('Not authorized'))

    const { result } = renderHook(() => useSessionCode())

    // First invocation: certifies once, retry also fails
    await expect(result.current()).rejects.toThrow('Not authorized')
    expect(fakeCertifyFlagship).toHaveBeenCalledTimes(1)

    // Second invocation: guard is set, should NOT call certify again
    await expect(result.current()).rejects.toThrow('Not authorized')
    expect(fakeCertifyFlagship).toHaveBeenCalledTimes(1) // still 1, not 2
  })

  it('rethrows non-authorization errors without calling certifyFlagship', async () => {
    setup()

    const networkErr = new Error('Network request failed')
    mockGetSessionCode.mockRejectedValue(networkErr)

    const { result } = renderHook(() => useSessionCode())
    await expect(result.current()).rejects.toThrow('Network request failed')

    expect(fakeCertifyFlagship).not.toHaveBeenCalled()
    expect(mockGetSessionCode).toHaveBeenCalledTimes(1)
  })
})
