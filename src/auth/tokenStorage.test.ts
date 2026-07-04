import * as SecureStore from 'expo-secure-store'

import { saveSession, getSession, clearSession, SESSION_KEY } from './tokenStorage'

const session = {
  uri: 'https://example.com',
  oauthOptions: {
    clientID: 'cid',
    clientSecret: 'csecret',
    clientName: 'Twake Drive Mobile',
    softwareID: 'twake-drive-mobile',
    redirectURI: 'cozy://',
    clientKind: 'mobile',
    clientURI: 'https://twake.app',
    scopes: ['io.cozy.files']
  },
  token: {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    tokenType: 'bearer',
    scope: '*'
  }
}

// Native extensions read the SAME keychain item, so every call must target the
// shared access group with AFTER_FIRST_UNLOCK accessibility.
const SHARED = {
  accessGroup: 'com.linagora.twakedrive.shared',
  keychainAccessible: 'AFTER_FIRST_UNLOCK'
}

describe('tokenStorage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('saveSession serializes the session under SESSION_KEY', async () => {
    await saveSession(session)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      SESSION_KEY,
      JSON.stringify(session),
      SHARED
    )
  })

  it('getSession returns parsed session when present, read from the shared group', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(session))
    expect(await getSession()).toEqual(session)
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(SESSION_KEY, SHARED)
  })

  it('getSession returns null when nothing stored', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null)
    expect(await getSession()).toBeNull()
  })

  it('getSession returns null on malformed JSON and clears storage', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('not-json')
    expect(await getSession()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY, SHARED)
  })

  it('clearSession deletes the stored item', async () => {
    await clearSession()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY, SHARED)
  })
})
