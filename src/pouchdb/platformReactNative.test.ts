// Unmock so we see the real platformReactNative export with the real pouchAdapter.
jest.unmock('@/pouchdb/pouchdb')

// Mock the native sqlite adapter to register an adapter name on the PouchDB instance.
jest.mock('pouchdb-adapter-react-native-sqlite', () => ({
  __esModule: true,
  default: (PouchDB: { adapter: (name: string, impl: () => void, immediate: boolean) => void }) => {
    PouchDB.adapter('react-native-sqlite', () => undefined, true)
  }
}))

// Mock pouchdb-core to be a chainable plugin host that records registered adapters.
jest.mock('pouchdb-core', () => {
  const adapters: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    plugin: jest.fn(function (this: unknown, p: unknown) {
      // Cast to `any` rather than a function type: naming a type param (`db`)
      // inside a jest.mock factory trips babel-plugin-jest-hoist's out-of-scope
      // variable check (it inspects the source before TS types are stripped).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof p === 'function') (p as any)(mock)
      return mock
    }),
    adapter: jest.fn((name: string, impl: unknown) => {
      adapters[name] = impl
    }),
    __adapters: adapters
  }
  return { __esModule: true, default: mock }
})

// Also stub these to make their default exports plugin-shaped no-ops.
jest.mock('pouchdb-adapter-http', () => ({ __esModule: true, default: () => undefined }))
jest.mock('pouchdb-find', () => ({ __esModule: true, default: () => undefined }))
jest.mock('pouchdb-mapreduce', () => ({ __esModule: true, default: () => undefined }))
jest.mock('pouchdb-replication', () => ({ __esModule: true, default: () => undefined }))

import { platformReactNative } from './platformReactNative'

describe('platformReactNative', () => {
  it('has pouchAdapter wired (not undefined → would fall back to pouchdb-browser)', () => {
    expect(platformReactNative.pouchAdapter).toBeDefined()
  })

  it('pouchAdapter is the SQLite-enabled PouchDB, not pouchdb-browser', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapters = (platformReactNative.pouchAdapter as any).__adapters
    expect(adapters['react-native-sqlite']).toBeDefined()
  })
})
