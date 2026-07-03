import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

export type OnlineListener = (online: boolean) => void

export interface OnlineMonitor {
  getCurrent(): boolean
  getNetType(): string | undefined
  subscribe(listener: OnlineListener): () => void
  /** For tests. */
  dispose(): void
}

interface CreateOptions {
  probeUri?: string
  probeIntervalMs?: number
  probeTimeoutMs?: number
}

const computeOnline = (s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(s.isConnected) && s.isInternetReachable !== false

export const createOnlineMonitor = (opts: CreateOptions = {}): OnlineMonitor => {
  const probeIntervalMs = opts.probeIntervalMs ?? 15 * 1000
  const probeTimeoutMs = opts.probeTimeoutMs ?? 8 * 1000

  let netInfoOnline = true
  let probeOnline: boolean | null = null
  let netType: string | undefined
  const listeners = new Set<OnlineListener>()

  const current = (): boolean =>
    probeOnline === null ? netInfoOnline : netInfoOnline || probeOnline
  let lastEmitted = current()
  const emit = (): void => {
    const v = current()
    if (v === lastEmitted) return
    lastEmitted = v
    listeners.forEach(l => l(v))
  }

  const probe = async (): Promise<void> => {
    if (!opts.probeUri) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), probeTimeoutMs)
    try {
      const r = await fetch(`${opts.probeUri}/status`, {
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal
      })
      probeOnline = r.status >= 200 && r.status < 400
    } catch {
      probeOnline = false
    } finally {
      clearTimeout(timeout)
      emit()
    }
  }

  void NetInfo.fetch().then(s => {
    netInfoOnline = computeOnline(s)
    netType = s.type
    emit()
  })

  const unsubNetInfo = NetInfo.addEventListener(s => {
    netInfoOnline = computeOnline(s)
    netType = s.type
    emit()
  })

  const probeTimer = setInterval(() => void probe(), probeIntervalMs)
  // Initial probe — necessary because iOS simulator and some physical devices
  // can report `isConnected: false, type: 'none'` at app start even when the
  // network actually works. The probe is the authoritative override.
  void probe()

  return {
    getCurrent: () => current(),
    getNetType: () => netType,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      unsubNetInfo()
      clearInterval(probeTimer)
      listeners.clear()
    }
  }
}

let singleton: OnlineMonitor | null = null

export const getOnlineMonitor = (probeUri?: string): OnlineMonitor => {
  if (!singleton) singleton = createOnlineMonitor({ probeUri })
  return singleton
}

/** Test only. */
export const _resetOnlineMonitor = (): void => {
  singleton?.dispose()
  singleton = null
}
