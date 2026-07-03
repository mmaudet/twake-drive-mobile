import CozyClient from 'cozy-client'
import PouchLink from 'cozy-pouch-link'
import { triggerPouchReplication } from './triggerReplication'

jest.mock('cozy-pouch-link', () => jest.fn())

const makeClient = (link: unknown): CozyClient => ({ links: [link] }) as unknown as CozyClient

describe('triggerPouchReplication', () => {
  it('calls startReplication on the PouchLink in the chain', () => {
    const link = Object.create((PouchLink as unknown as jest.Mock).prototype)
    link.startReplication = jest.fn()
    triggerPouchReplication(makeClient(link))
    expect(link.startReplication).toHaveBeenCalled()
  })

  it('accepts a doctype hint as 2nd arg (used by mutation sites)', () => {
    const link = Object.create((PouchLink as unknown as jest.Mock).prototype)
    link.startReplication = jest.fn()
    triggerPouchReplication(makeClient(link), 'io.cozy.files')
    expect(link.startReplication).toHaveBeenCalled()
  })

  it('ignores the immediate opt (kept for backward-compat) and still calls startReplication', () => {
    const link = Object.create((PouchLink as unknown as jest.Mock).prototype)
    link.startReplication = jest.fn()
    triggerPouchReplication(makeClient(link), undefined, { immediate: true })
    expect(link.startReplication).toHaveBeenCalled()
  })

  it('is a no-op when no PouchLink in the chain', () => {
    expect(() => triggerPouchReplication(makeClient({}))).not.toThrow()
  })

  it('is a no-op when client is undefined', () => {
    expect(() => triggerPouchReplication(undefined)).not.toThrow()
  })
})
