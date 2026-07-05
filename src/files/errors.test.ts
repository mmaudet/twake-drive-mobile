import type { TFunction } from 'i18next'

import { NoCompatibleAppError, openErrorMessageKey, surfaceOpenError } from './errors'

const t = ((k: string) => k) as unknown as TFunction

describe('openErrorMessageKey', () => {
  it('maps NoCompatibleAppError to the friendly "no app" key', () => {
    expect(openErrorMessageKey(new NoCompatibleAppError())).toBe('drive.open.noApp')
  })

  it('maps any other error to the generic load-failed key', () => {
    expect(openErrorMessageKey(new Error('boom'))).toBe('drive.preview.loadFailed')
    expect(openErrorMessageKey(undefined)).toBe('drive.preview.loadFailed')
  })
})

describe('surfaceOpenError', () => {
  it('surfaces the translated no-app message WITHOUT logging (expected user condition)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const onMessage = jest.fn()
    surfaceOpenError(new NoCompatibleAppError(), onMessage, t, 'Test')
    expect(onMessage).toHaveBeenCalledWith('drive.open.noApp')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('logs unexpected errors and surfaces the generic message', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const onMessage = jest.fn()
    const err = new Error('kaboom')
    surfaceOpenError(err, onMessage, t, 'Test')
    expect(onMessage).toHaveBeenCalledWith('drive.preview.loadFailed')
    expect(spy).toHaveBeenCalledWith('[Test] openFileFromList failed', err)
    spy.mockRestore()
  })
})
