import React from 'react'
import { Text, Pressable } from 'react-native'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native'

jest.mock('./certifyFlagship', () => ({
  certifyFlagship: jest.fn()
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getStackClient: () => ({
      register: jest.fn(),
      fetchJSON: jest.fn().mockResolvedValue({
        access_token: 'a',
        refresh_token: 'r',
        token_type: 'bearer',
        scope: '*'
      }),
      oauthOptions: {
        clientID: 'cid',
        clientSecret: 'csecret',
        clientName: 'Twake Drive Mobile',
        softwareID: 'twake-drive-mobile',
        redirectURI: 'cozy://',
        clientKind: 'mobile',
        clientURI: 'https://twake.app',
        scopes: ['io.cozy.files']
      }
    }),
    registerPlugin: jest.fn(),
    login: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn(),
    // createClient() runs triggerPouchReplication, which does
    // client.links.find(...); an empty array lets it no-op gracefully here.
    links: []
  })),
  StackLink: jest.fn()
}))

jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { plugin: jest.fn() })
}))

import * as tokenStorage from './tokenStorage'
import * as oidcFlow from './oidcFlow'
import * as autodiscovery from './autodiscovery'
import * as registerSessionMod from './registerSession'
import * as certifyFlagshipMod from './certifyFlagship'
import { useAuth, AuthProvider } from './useAuth'

const mockSession = {
  uri: 'https://alice.example.com',
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
  token: { accessToken: 'a', refreshToken: 'r', tokenType: 'bearer', scope: '*' }
}

const Probe = () => {
  const { status, login, logout } = useAuth()
  return (
    <>
      <Text testID="status">{status}</Text>
      <Pressable testID="login" onPress={() => login('user@example.com').catch(() => {})} />
      <Pressable testID="logout" onPress={() => logout()} />
    </>
  )
}

const CertifyProbe = ({ onResult }: { onResult: (c: import('cozy-client').default) => void }) => {
  const { certifyFlagship } = useAuth()
  return (
    <Pressable
      testID="certify"
      onPress={() =>
        certifyFlagship()
          .then(onResult)
          .catch(() => {})
      }
    />
  )
}

describe('useAuth', () => {
  beforeEach(() => jest.restoreAllMocks())

  it('starts loading then transitions to unauthenticated when no session', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })

  it('falls back to unauthenticated when the initial session read fails (no permanent loading)', async () => {
    // Regression: on iOS Simulator (unsigned build) SecureStore/keychain can
    // reject; the bootstrap must not leave the app stuck on the loading spinner.
    jest.spyOn(tokenStorage, 'getSession').mockRejectedValue(new Error('keychain unavailable'))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })

  it('transitions to authenticated when a session exists', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
  })

  it('login flow fetches loginUri, runs OIDC, registers, saves, transitions to authenticated', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)
    jest.spyOn(autodiscovery, 'getLoginUri').mockResolvedValue(new URL('https://login.example.com'))
    jest
      .spyOn(oidcFlow, 'startOidcFlow')
      .mockResolvedValue({ fqdn: 'alice.example.com', code: 'tok', defaultRedirection: null })
    jest.spyOn(registerSessionMod, 'registerSession').mockResolvedValue(mockSession)
    const saveSpy = jest.spyOn(tokenStorage, 'saveSession').mockResolvedValue()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('login'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(saveSpy).toHaveBeenCalledWith(mockSession)
  })

  it('logout clears session and transitions to unauthenticated', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    const clearSpy = jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(clearSpy).toHaveBeenCalled()
  })

  it('certifyFlagship calls the certifyFlagship module and saves the new session', async () => {
    const newSession = {
      ...mockSession,
      token: { accessToken: 'new-a', refreshToken: 'new-r', tokenType: 'bearer', scope: '*' }
    }
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    const certifySpy = jest
      .spyOn(certifyFlagshipMod, 'certifyFlagship')
      .mockResolvedValue(newSession)
    const saveSpy = jest.spyOn(tokenStorage, 'saveSession').mockResolvedValue()

    const onResult = jest.fn()
    render(
      <AuthProvider>
        <Probe />
        <CertifyProbe onResult={onResult} />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('certify'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(certifySpy).toHaveBeenCalledWith(mockSession)
    expect(saveSpy).toHaveBeenCalledWith(newSession)
    expect(onResult).toHaveBeenCalled()
  })
})
