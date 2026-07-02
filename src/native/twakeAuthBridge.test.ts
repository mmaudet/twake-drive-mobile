jest.mock('react-native', () => ({
  NativeModules: {
    TwakeAuthBridge: {
      syncSession: jest.fn(async () => true),
      clearSession: jest.fn(async () => true)
    }
  },
  Platform: { OS: 'android' }
}))

import { NativeModules } from 'react-native'

import { mirrorSessionToNative, clearNativeSession } from './twakeAuthBridge'
import type { Session } from '@/auth/types'

const { syncSession, clearSession } = NativeModules.TwakeAuthBridge as {
  syncSession: jest.Mock
  clearSession: jest.Mock
}

const session: Session = {
  uri: 'https://alice.mycozy.cloud',
  oauthOptions: {
    clientID: 'cid',
    clientSecret: 'secret',
    clientName: 'x',
    softwareID: 'y',
    redirectURI: 'z',
    clientKind: 'mobile',
    clientURI: 'u',
    scopes: []
  },
  token: { accessToken: 'at', refreshToken: 'rt', tokenType: 'bearer', scope: '' }
}

beforeEach(() => jest.clearAllMocks())

test('mirrors the durable creds as JSON', async () => {
  await mirrorSessionToNative(session)
  expect(syncSession).toHaveBeenCalledWith(
    JSON.stringify({
      uri: 'https://alice.mycozy.cloud',
      clientId: 'cid',
      clientSecret: 'secret',
      refreshToken: 'rt'
    })
  )
})

test('clear delegates to native', async () => {
  await clearNativeSession()
  expect(clearSession).toHaveBeenCalledTimes(1)
})
