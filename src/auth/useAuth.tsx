import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import CozyClient from 'cozy-client'

import { createClient } from '@/client/createClient'
import i18n, { resolveDeviceLanguage } from '@/i18n'
import { mirrorSessionToNative } from '@/native/twakeAuthBridge'
import { clearSession, getSession, saveSession } from './tokenStorage'
import { startOidcFlow } from './oidcFlow'
import { registerSession } from './registerSession'
import { getLoginUri, getTwakeWorkplaceLoginUri } from './autodiscovery'
import { certifyFlagship as certifyFlagshipModule } from './certifyFlagship'

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  client: CozyClient | null
}

interface AuthContextValue extends AuthState {
  authenticating: boolean
  login: (email: string) => Promise<void>
  loginWithTwakeWorkplace: (mode: 'signin' | 'signup') => Promise<void>
  logout: () => Promise<void>
  certifyFlagship: () => Promise<CozyClient>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({ status: 'loading', client: null })
  const [authenticating, setAuthenticating] = useState(false)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const session = await getSession()
        if (!session) {
          setState({ status: 'unauthenticated', client: null })
          return
        }
        const client = await createClient(session)
        // A user already logged in when they update to a build with the Android
        // DocumentsProvider never runs the interactive login path again, so mirror
        // the stored session here too — otherwise the provider's root never appears.
        await mirrorSessionToNative(session)
        setState({ status: 'authenticated', client })
      } catch (err) {
        // Any bootstrap failure — including a rejecting SecureStore/keychain read
        // on the iOS Simulator (unsigned build) — must fall back to the login
        // screen, never leave the app hung on the loading spinner. Observed:
        // index.tsx renders LoadingState while status==='loading'; a swallowed
        // getSession() rejection kept it there forever.
        console.warn('[useAuth] bootstrap failed', err)
        setState({ status: 'unauthenticated', client: null })
      }
    }
    void bootstrap()
  }, [])

  const completeOidc = useCallback(async (loginUri: URL): Promise<void> => {
    const callback = await startOidcFlow(loginUri)
    console.log('[useAuth] oidc callback received for', callback.fqdn)
    setAuthenticating(true)
    try {
      // Pass existing oauthOptions so registerSession reuses the stored client_id
      // instead of calling register() (which would create a new client_id and
      // lose any flagship certification on the previous one).
      const existing = (await getSession())?.oauthOptions
      const session = await registerSession(callback, existing, {
        onAuthorizeBrowserOpen: () => setAuthenticating(false),
        onAuthorizeRedirect: () => setAuthenticating(true)
      })
      await saveSession(session)
      const client = await createClient(session)
      setState({ status: 'authenticated', client })
    } finally {
      setAuthenticating(false)
    }
  }, [])

  const login = useCallback(
    async (email: string): Promise<void> => {
      const loginUri = await getLoginUri(email)
      if (!loginUri) throw new Error('DOMAIN_UNSUPPORTED')
      await completeOidc(loginUri)
    },
    [completeOidc]
  )

  const loginWithTwakeWorkplace = useCallback(
    async (mode: 'signin' | 'signup'): Promise<void> => {
      await completeOidc(getTwakeWorkplaceLoginUri(mode))
    },
    [completeOidc]
  )

  const logout = useCallback(async (): Promise<void> => {
    setState(prev => {
      if (prev.client) {
        Promise.resolve(prev.client.logout()).catch(() => {
          // ignore — server may be unreachable
        })
      }
      return prev
    })
    await clearSession()
    setState({ status: 'unauthenticated', client: null })
    // Drop the instance locale that synced during the session; the login screen
    // returns to the device language, like a cold launch.
    void i18n.changeLanguage(resolveDeviceLanguage())
  }, [])

  const certifyFlagship = useCallback(async (): Promise<CozyClient> => {
    const session = await getSession()
    if (!session) throw new Error('certifyFlagship: no session stored')
    const newSession = await certifyFlagshipModule(session)
    await saveSession(newSession)
    const client = await createClient(newSession)
    setState({ status: 'authenticated', client })
    return client
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, authenticating, login, loginWithTwakeWorkplace, logout, certifyFlagship }),
    [state, authenticating, login, loginWithTwakeWorkplace, logout, certifyFlagship]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
