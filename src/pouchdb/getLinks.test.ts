jest.mock('cozy-pouch-link', () => {
  return jest.fn().mockImplementation(function (this: any, opts: unknown) {
    this.options = opts
  })
})
jest.mock('@/pouchdb/platformReactNative', () => ({
  platformReactNative: { pouchAdapter: 'POUCH_ADAPTER_SENTINEL' }
}))
// getLinks is the only suite that imports the real cozy-client, whose index.node
// entry eagerly requires RN native modules absent here (inappbrowser,
// ios11-devicecheck, …). Mock it — the test only needs StackLink (constructed once)
// and Q (referenced lazily inside warmup thunks). Mirrors how the sibling
// client/auth suites already mock cozy-client.
jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn(),
  StackLink: jest.fn(),
  Q: jest.fn()
}))

import PouchLink from 'cozy-pouch-link'
import { getLinks, offlineDoctypes } from './getLinks'

describe('getLinks', () => {
  beforeEach(() => (PouchLink as unknown as jest.Mock).mockClear())

  it('returns [PouchLink, StackLink] in that order', () => {
    const links = getLinks()
    expect(links).toHaveLength(2)
    expect((PouchLink as unknown as jest.Mock)).toHaveBeenCalledTimes(1)
  })

  it('passes platformReactNative.pouchAdapter to PouchLink (not pouchdb-browser)', () => {
    getLinks()
    const opts = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
    expect(opts.platform.pouchAdapter).toBe('POUCH_ADAPTER_SENTINEL')
  })

  it('replicates every offlineDoctype with strategy=fromRemote', () => {
    getLinks()
    const opts = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
    for (const dt of offlineDoctypes) {
      expect(opts.doctypesReplicationOptions[dt]).toMatchObject({ strategy: 'fromRemote' })
    }
  })

  it('targets exactly the offline doctypes (files + contacts)', () => {
    expect(offlineDoctypes).toEqual(['io.cozy.files', 'io.cozy.contacts'])
  })

  it('enables periodic sync with a 30 second interval', () => {
    getLinks()
    const opts = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
    expect(opts.periodicSync).toBe(true)
    expect(opts.replicationInterval).toBe(30_000)
  })
})
