import { renderHook, act } from '@testing-library/react-native'

import { useWebViewSettleReveal } from './useWebViewSettleReveal'

describe('useWebViewSettleReveal', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('reveals after a page loads and settles for settleMs', () => {
    const { result } = renderHook(() => useWebViewSettleReveal({ settleMs: 1200, maxWaitMs: 8000 }))
    expect(result.current.ready).toBe(false)

    act(() => result.current.onLoadStart())
    act(() => result.current.onLoadEnd())

    act(() => jest.advanceTimersByTime(1100))
    expect(result.current.ready).toBe(false)

    act(() => jest.advanceTimersByTime(200))
    expect(result.current.ready).toBe(true)
  })

  it('does not reveal mid-redirect — a new load cancels the pending settle', () => {
    const { result } = renderHook(() => useWebViewSettleReveal({ settleMs: 1200, maxWaitMs: 8000 }))

    act(() => result.current.onLoadStart())
    act(() => result.current.onLoadEnd())
    act(() => jest.advanceTimersByTime(600))
    act(() => result.current.onLoadStart()) // redirect — cancels the settle timer
    act(() => result.current.onLoadEnd())
    act(() => jest.advanceTimersByTime(600)) // 600 < 1200, still mid-chain
    expect(result.current.ready).toBe(false)

    act(() => result.current.onLoadStart())
    act(() => result.current.onLoadEnd())
    act(() => jest.advanceTimersByTime(1200))
    expect(result.current.ready).toBe(true)
  })

  it('reveals via onNavigationStateChange settling (loading:false)', () => {
    const { result } = renderHook(() => useWebViewSettleReveal({ settleMs: 1200, maxWaitMs: 8000 }))

    act(() => result.current.onNavigationStateChange({ loading: true }))
    act(() => jest.advanceTimersByTime(2000))
    expect(result.current.ready).toBe(false) // still loading

    act(() => result.current.onNavigationStateChange({ loading: false }))
    act(() => jest.advanceTimersByTime(1200))
    expect(result.current.ready).toBe(true)
  })

  it('BACKSTOP: reveals after maxWaitMs even if the WebView never fires a callback', () => {
    const { result } = renderHook(() => useWebViewSettleReveal({ settleMs: 1200, maxWaitMs: 3000 }))
    // No onLoadStart / onLoadEnd / onNavigationStateChange at all.
    act(() => jest.advanceTimersByTime(2999))
    expect(result.current.ready).toBe(false)
    act(() => jest.advanceTimersByTime(2))
    expect(result.current.ready).toBe(true)
  })

  it('reveals immediately on a WebView error (never traps the user)', () => {
    const { result } = renderHook(() => useWebViewSettleReveal({ settleMs: 1200, maxWaitMs: 8000 }))
    act(() => result.current.onError())
    expect(result.current.ready).toBe(true)
  })
})
