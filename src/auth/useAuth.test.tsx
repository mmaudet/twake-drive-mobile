import React from 'react'
import { Text, Pressable } from 'react-native'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getStackClient: () => ({
      register: jest.fn(),
      fetchAccessToken: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' })
    }),
    logout: jest.fn()
  }))
}))

import * as tokenStorage from './tokenStorage'
import * as oidcFlow from './oidcFlow'
import * as autodiscovery from './autodiscovery'
import * as registerSessionMod from './registerSession'
import { useAuth, AuthProvider } from './useAuth'

const mockSession = { uri: 'https://alice.example.com', accessToken: 'a', refreshToken: 'r' }

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
      .mockResolvedValue({ fqdn: 'alice.example.com', registerToken: 'tok', code: null })
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
})
