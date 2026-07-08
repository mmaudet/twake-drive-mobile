import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import CozyClient from 'cozy-client'

import { createClient } from '@/client/createClient'
import { mirrorSessionToNative } from '@/native/twakeAuthBridge'
import { clearSession, getSession, saveSession } from './tokenStorage'
import { startOidcFlow } from './oidcFlow'
import { registerSession } from './registerSession'
import { getLoginUri } from './autodiscovery'
import { certifyFlagship as certifyFlagshipModule } from './certifyFlagship'

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  client: CozyClient | null
}

interface AuthContextValue extends AuthState {
  login: (email: string) => Promise<void>
  logout: () => Promise<void>
  certifyFlagship: () => Promise<CozyClient>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({ status: 'loading', client: null })

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

  const login = useCallback(async (email: string): Promise<void> => {
    console.log('[useAuth] login start')
    const loginUri = await getLoginUri(email)
    if (!loginUri) throw new Error('DOMAIN_UNSUPPORTED')

    const callback = await startOidcFlow(loginUri)
    console.log('[useAuth] oidc callback received for', callback.fqdn)
    // Pass existing oauthOptions so registerSession reuses the stored client_id
    // instead of calling register() (which would create a new client_id and
    // lose any flagship certification on the previous one).
    const existing = (await getSession())?.oauthOptions
    const session = await registerSession(callback, existing)
    console.log('[useAuth] session built for', session.uri)
    await saveSession(session)
    console.log('[useAuth] session saved, transitioning to authenticated')

    const client = await createClient(session)
    setState({ status: 'authenticated', client })
  }, [])

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
    () => ({ ...state, login, logout, certifyFlagship }),
    [state, login, logout, certifyFlagship]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
