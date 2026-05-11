import { requireOnline } from './requireOnline'

describe('requireOnline', () => {
  const t = ((key: string) => key) as unknown as Parameters<typeof requireOnline>[2]

  it('returns true and does NOT call onOffline when online', () => {
    const onOffline = jest.fn()
    expect(requireOnline(true, onOffline, t)).toBe(true)
    expect(onOffline).not.toHaveBeenCalled()
  })

  it('returns false and calls onOffline with translated key when offline', () => {
    const onOffline = jest.fn()
    expect(requireOnline(false, onOffline, t)).toBe(false)
    expect(onOffline).toHaveBeenCalledWith('drive.offline.requiresOnline')
  })
})
