import '@testing-library/react-native/extend-expect'

// Node 16 does not ship FormData globally; jest-expo's winter runtime requires it.
if (typeof FormData === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).FormData = class FormData {
    private data: Record<string, string> = {}
    append(key: string, value: string) {
      this.data[key] = value
    }
    get(key: string) {
      return this.data[key] ?? null
    }
  }
}

// Use node-fetch (http-based) so nock can intercept HTTP requests in tests.
// Node 18+'s built-in fetch uses undici, which nock cannot intercept by default.
const nodeFetch = require('node-fetch')
;(global as unknown as { fetch: unknown }).fetch = nodeFetch

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK'
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: {
    SUCCESS: 'success',
    CANCEL: 'cancel',
    DISMISS: 'dismiss'
  }
}))

// react-native-webview's WebView.<platform>.js calls TurboModuleRegistry
// .getEnforcing('RNCWebView') at require() time, which throws in the node test
// env. Any file that imports it — the editor screens, FlagshipAuthModal, and now
// oidcFlow transitively — would crash on load. Stub it with a host component so
// those imports resolve; tests asserting on WebView behaviour override locally.
jest.mock('react-native-webview', () => {
  const React = require('react')
  const Stub = (props: Record<string, unknown>) => React.createElement('WebView', props)
  return { __esModule: true, WebView: Stub, default: Stub }
})

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr', languageTag: 'fr-FR' }]
}))

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue('')
}))

// --- Pouch chain mocks (offline-cache infrastructure) ---
//
// Every file that transitively imports `@/pouchdb/*` or the underlying native
// pouch packages would crash at require() in jsdom/node. These mocks short-circuit
// every entry point so the surrounding tests can import their files cleanly.

jest.mock('@/pouchdb/pouchdb', () => ({ __esModule: true, default: {} }))

jest.mock('@op-engineering/op-sqlite', () => ({}))
jest.mock('react-native-quick-crypto', () => ({}))
jest.mock('@craftzdog/react-native-buffer', () => ({}))
jest.mock('@craftzdog/pouchdb-collate-react-native', () => ({}))
jest.mock('readable-stream', () => ({}))

jest.mock('react-native-mmkv', () => ({
  createMMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn()
  }))
}))

jest.mock('@react-native-community/netinfo', () => {
  const netInfo = {
    configure: jest.fn(),
    addEventListener: jest.fn(() => () => undefined),
    fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true })
  }
  // Expose both the default import (NetInfo.configure) and named exports.
  return { __esModule: true, default: netInfo, ...netInfo }
})

// react-native-file-viewer builds a NativeEventEmitter at require() time, which
// crashes in node. Any component transitively importing it (FileRow → download →
// openFile) needs this. Local mocks in openFile.test/FileRow.test still override.
jest.mock('react-native-file-viewer', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue(undefined) }
}))

class MockPouchLink {
  options: unknown
  constructor(options: unknown) {
    this.options = options
  }
  startReplication = jest.fn()
  startReplicationWithDebounce = jest.fn()
  reset = jest.fn().mockResolvedValue(undefined)
  on = jest.fn()
  off = jest.fn()
}
jest.mock('cozy-pouch-link', () => {
  const ctor = jest.fn().mockImplementation((opts: unknown) => new MockPouchLink(opts))
  return Object.assign(ctor, { default: ctor, __esModule: true })
})
