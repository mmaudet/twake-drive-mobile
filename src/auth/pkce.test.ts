import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

import { openLoginUrl, openAuthorizeUrl } from './pkce'
import { UserCancelledError } from './types'

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  openAuthSessionAsync: jest.fn(),
  dismissBrowser: jest.fn(() => Promise.resolve()),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' }
}))
jest.mock('expo-linking', () => ({ addEventListener: jest.fn() }))
jest.mock('expo-crypto', () => ({}))

const wb = WebBrowser as unknown as {
  openBrowserAsync: jest.Mock
  openAuthSessionAsync: jest.Mock
  dismissBrowser: jest.Mock
}
const linking = Linking as unknown as { addEventListener: jest.Mock }

describe('openLoginUrl (shared-jar Custom Tab)', () => {
  let urlHandler: (e: { url: string }) => void
  let remove: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    remove = jest.fn()
    linking.addEventListener.mockImplementation(
      (_evt: string, cb: (e: { url: string }) => void) => {
        urlHandler = cb
        return { remove }
      }
    )
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  it('opens openBrowserAsync (SFVC jar), never an auth session', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    openLoginUrl('https://login.example.com/oauth').catch(() => undefined)
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://login.example.com/oauth', {
      showInRecents: true
    })
    expect(wb.openAuthSessionAsync).not.toHaveBeenCalled()
  })

  it('resolves with the twakedrive:// redirect captured via the deep-link listener', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openLoginUrl('https://x/oauth')
    urlHandler({ url: 'twakedrive://?code=abc123' })
    await expect(p).resolves.toBe('twakedrive://?code=abc123')
    expect(remove).toHaveBeenCalled()
  })

  it('lets a redirect win over a racing tab-close', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    const p = openLoginUrl('https://x/oauth')
    urlHandler({ url: 'twakedrive://?code=win' })
    await expect(p).resolves.toBe('twakedrive://?code=win')
  })

  it('rejects fast (short grace) when the user closes the browser (cancel)', async () => {
    jest.useFakeTimers()
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    const p = openLoginUrl('https://x/oauth')
    const assertion = expect(p).rejects.toBeInstanceOf(UserCancelledError)
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(500)
    await assertion
    jest.useRealTimers()
  })

  it('aborts a previous in-flight flow when a new attempt starts', async () => {
    // Flow 1 never settles on its own (browser stays open, no redirect): only
    // starting a new attempt may resolve it — by aborting it.
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p1 = openLoginUrl('https://x/oauth1')
    const flow1Aborted = expect(p1).rejects.toBeInstanceOf(UserCancelledError)

    const p2 = openLoginUrl('https://x/oauth2')
    await flow1Aborted

    urlHandler({ url: 'twakedrive://?code=flow2' })
    await expect(p2).resolves.toBe('twakedrive://?code=flow2')
  })

  it('keeps the long grace on a non-cancel close (dismiss refocus race)', async () => {
    jest.useFakeTimers()
    wb.openBrowserAsync.mockResolvedValue({ type: 'dismiss' })
    const p = openLoginUrl('https://x/oauth')
    let settled = false
    void p.catch(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(500)
    await Promise.resolve()
    expect(settled).toBe(false)
    jest.advanceTimersByTime(4000)
    await expect(p).rejects.toBeInstanceOf(UserCancelledError)
    jest.useRealTimers()
  })
})

describe('openAuthorizeUrl (fast native redirect + email-code fallback)', () => {
  let urlHandler: (e: { url: string }) => void
  let remove: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    remove = jest.fn()
    linking.addEventListener.mockImplementation(
      (_evt: string, cb: (e: { url: string }) => void) => {
        urlHandler = cb
        return { remove }
      }
    )
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  // The stack's /auth/authorize redirects to twakedrive:// instantly with no UI.
  // openAuthSessionAsync captures that native redirect reliably; the
  // openBrowserAsync + deep-link path misses the instant custom-scheme redirect.
  it('captures the instant redirect via openAuthSessionAsync (fast path)', async () => {
    wb.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'twakedrive://?code=fast' })
    await expect(openAuthorizeUrl('https://x/auth/authorize')).resolves.toBe(
      'twakedrive://?code=fast'
    )
    expect(wb.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://x/auth/authorize',
      'twakedrive://',
      {
        showInRecents: false
      }
    )
    expect(wb.openBrowserAsync).not.toHaveBeenCalled()
  })

  // An uncertified client shows the email-code form instead of redirecting; the
  // user leaves to read the 6-digit code, which aborts openAuthSessionAsync on
  // refocus. Fall back to the system browser + deep-link listener, which survives
  // the mail excursion (the flagship certification path).
  it('falls back to the system browser when the auth session is dismissed', async () => {
    wb.openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' })
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openAuthorizeUrl('https://x/auth/authorize')
    await Promise.resolve()
    await Promise.resolve()
    urlHandler({ url: 'twakedrive://?code=viacustomtab' })
    await expect(p).resolves.toBe('twakedrive://?code=viacustomtab')
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://x/auth/authorize', {
      showInRecents: true
    })
  })
})
