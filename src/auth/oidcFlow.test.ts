import { openAuthorizeInWebView } from './FlagshipAuthModal'
import { parseCallbackUrl, startOidcFlow } from './oidcFlow'
import { UserCancelledError } from './types'

jest.mock('./FlagshipAuthModal', () => ({
  openAuthorizeInWebView: jest.fn()
}))

describe('parseCallbackUrl', () => {
  it('extracts fqdn, code, and defaultRedirection from a callback URL', () => {
    const url = 'cozy://?fqdn=alice.example.com&code=abc123&default_redirection=files/'
    expect(parseCallbackUrl(url)).toEqual({
      fqdn: 'alice.example.com',
      code: 'abc123',
      defaultRedirection: 'files/'
    })
  })

  it('returns defaultRedirection as null when missing', () => {
    expect(parseCallbackUrl('cozy://?fqdn=alice.example.com&code=abc')).toEqual({
      fqdn: 'alice.example.com',
      code: 'abc',
      defaultRedirection: null
    })
  })

  it('throws when fqdn is missing', () => {
    expect(() => parseCallbackUrl('cozy://?code=abc')).toThrow(/fqdn/)
  })

  it('throws when code is missing', () => {
    expect(() => parseCallbackUrl('cozy://?fqdn=alice.example.com')).toThrow(/code/)
  })

  it('throws on a malformed URL', () => {
    expect(() => parseCallbackUrl('not a url')).toThrow()
  })
})

describe('startOidcFlow', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns the parsed callback when the WebView captures a cozy:// redirect', async () => {
    ;(openAuthorizeInWebView as jest.Mock).mockResolvedValueOnce(
      'cozy://?fqdn=alice.example.com&code=tok'
    )
    const result = await startOidcFlow(new URL('https://login.example.com/oauth'))
    expect(result).toEqual({ fqdn: 'alice.example.com', code: 'tok', defaultRedirection: null })
    expect(openAuthorizeInWebView).toHaveBeenCalledWith('https://login.example.com/oauth')
  })

  it('throws UserCancelledError when the user closes the WebView', async () => {
    ;(openAuthorizeInWebView as jest.Mock).mockRejectedValueOnce(
      new Error('User cancelled OIDC flow')
    )
    await expect(startOidcFlow(new URL('https://login.example.com/oauth'))).rejects.toBeInstanceOf(
      UserCancelledError
    )
  })
})
