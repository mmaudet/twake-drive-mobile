jest.mock('cozy-pouch-link', () => {
  return jest.fn().mockImplementation(function (this: any, opts: unknown) {
    this.options = opts
    this.name = 'pouch'
  })
})

jest.mock('@/pouchdb/platformReactNative', () => ({
  platformReactNative: { pouchAdapter: 'POUCH_ADAPTER_SENTINEL' }
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn(function (this: any, opts: unknown) {
    this.options = opts
    this.registerPlugin = jest.fn().mockResolvedValue(undefined)
    this.login = jest.fn().mockResolvedValue(undefined)
  }),
  StackLink: jest.fn().mockImplementation(function (this: any) {
    this.name = 'stack'
  })
}))

jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: { plugin: 'flag-plugin' }
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import CozyClient from 'cozy-client'
import PouchLink from 'cozy-pouch-link'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { createClient } from './createClient'

const mockCozyClient = CozyClient as unknown as jest.Mock

const session = {
  uri: 'https://alice.example.com',
  oauthOptions: { clientID: 'cid', clientName: 'twake' },
  token: { accessToken: 'tok' }
} as never

describe('createClient', () => {
  beforeEach(() => {
    mockCozyClient.mockClear()
    ;(PouchLink as unknown as jest.Mock).mockClear()
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('instantiates CozyClient with the session uri + oauth opts', async () => {
    await createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    expect(opts.uri).toBe('https://alice.example.com')
    expect(opts.oauth).toMatchObject({ clientID: 'cid', token: { accessToken: 'tok' } })
  })

  it('passes a links array containing PouchLink + StackLink', async () => {
    await createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    const links = opts.links as unknown[]
    expect(Array.isArray(links)).toBe(true)
    expect(links).toHaveLength(2)
    expect(PouchLink as unknown as jest.Mock).toHaveBeenCalledTimes(1)
  })

  it('registers the cozy-flags plugin', async () => {
    const client = (await createClient(session)) as unknown as { registerPlugin: jest.Mock }
    expect(client.registerPlugin).toHaveBeenCalledWith('flag-plugin', null)
  })

  it('calls client.login() after construction so PouchManager initializes', async () => {
    const client = (await createClient(session)) as unknown as { login: jest.Mock }
    expect(client.login).toHaveBeenCalledTimes(1)
    expect(client.login).toHaveBeenCalledWith({
      uri: 'https://alice.example.com',
      token: { accessToken: 'tok' }
    })
  })

  it('triggers an immediate pouch replication after login', async () => {
    await createClient(session)
    expect(triggerPouchReplication).toHaveBeenCalledWith(expect.anything(), undefined, {
      immediate: true
    })
  })
})
