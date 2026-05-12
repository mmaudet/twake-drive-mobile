import { renderHook, act } from '@testing-library/react-native'

import { useIsOnline } from './useIsOnline'

let mockMonitorValue = true
const mockMonitorListeners = new Set<(v: boolean) => void>()

jest.mock('./OnlineMonitor', () => ({
  getOnlineMonitor: () => ({
    getCurrent: () => mockMonitorValue,
    getNetType: () => 'wifi',
    subscribe: (l: (v: boolean) => void) => {
      mockMonitorListeners.add(l)
      return () => mockMonitorListeners.delete(l)
    },
    dispose: () => undefined
  })
}))

jest.mock('cozy-client', () => ({
  useClient: () => ({ getStackClient: () => ({ uri: 'https://stack.example.com' }) })
}))

const setMonitor = (v: boolean): void => {
  mockMonitorValue = v
  mockMonitorListeners.forEach(l => l(v))
}

describe('useIsOnline', () => {
  beforeEach(() => {
    mockMonitorValue = true
    mockMonitorListeners.clear()
  })

  it('returns the monitor current value on mount', () => {
    mockMonitorValue = false
    const { result } = renderHook(() => useIsOnline())
    expect(result.current).toBe(false)
  })

  it('updates when the monitor emits a change', () => {
    const { result } = renderHook(() => useIsOnline())
    expect(result.current).toBe(true)
    act(() => setMonitor(false))
    expect(result.current).toBe(false)
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useIsOnline())
    expect(mockMonitorListeners.size).toBe(1)
    unmount()
    expect(mockMonitorListeners.size).toBe(0)
  })
})
