import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

jest.mock('@react-native-community/netinfo', () => {
  let listener: ((s: Partial<NetInfoState>) => void) | undefined
  return {
    addEventListener: jest.fn((cb: (s: Partial<NetInfoState>) => void) => {
      listener = cb
      return () => {
        listener = undefined
      }
    }),
    fetch: jest
      .fn()
      .mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
    __emit: (s: Partial<NetInfoState>) => listener?.(s)
  }
})

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

const fetchMock = jest.fn()
;(global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch

import { createOnlineMonitor } from './OnlineMonitor'

describe('OnlineMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ status: 200 } as unknown as Response)
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('reports online from initial NetInfo state', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    expect(mon.getCurrent()).toBe(true)
    expect(mon.getNetType()).toBe('wifi')
  })

  it('probe override: NetInfo offline + probe online keeps current() = true', async () => {
    // The OR-merge is intentional: if the probe says the stack is reachable,
    // we trust it over NetInfo (which is unreliable on iOS sim).
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush() // initial probe succeeds (mock returns status 200)
    const listener = jest.fn()
    mon.subscribe(listener)
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    expect(mon.getCurrent()).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('current() is false only when both signals say offline; subscribers notified', async () => {
    // Both NetInfo offline AND probe failure required to flip to offline.
    fetchMock.mockResolvedValue({ status: 0 } as unknown as Response) // make probe also fail
    const mon = createOnlineMonitor({
      probeUri: 'https://stack.example.com',
      probeIntervalMs: 1000
    })
    await flush()
    const listener = jest.fn()
    mon.subscribe(listener)
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    // NetInfo offline + initial probe also reports offline (status 0 < 200) → current() = false
    await flush()
    expect(mon.getCurrent()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
  })

  it('unsubscribe stops notifications', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    const listener = jest.fn()
    const off = mon.subscribe(listener)
    off()
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    expect(listener).not.toHaveBeenCalled()
  })
})
