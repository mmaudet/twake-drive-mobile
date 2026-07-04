import React, { useEffect, useRef, useState } from 'react'
import { Modal, View, StyleSheet } from 'react-native'
import { WebView, WebViewNavigation } from 'react-native-webview'
import { normalizeRedirectUrl } from './pkce'

type Resolver = { resolve: (url: string) => void; reject: (e: Error) => void }
let controller: ((url: string) => Promise<string>) | null = null

/** Loads `url` in the in-app WebView and resolves with the `cozy://…` redirect it
 *  is navigated to (captured via onShouldStartLoadWithRequest, so no Android intent
 *  / "Open app?" dialog fires). Used for both the OIDC login and flagship
 *  certification: running them here rather than the system browser keeps the
 *  LemonLDAP session cookie in the shared WebView jar, so the editor WebViews
 *  (Docs, OnlyOffice, Notes) reuse it instead of prompting a second SSO login.
 *  Rejects if the user closes the modal before a redirect is captured. */
export const openAuthorizeInWebView = (url: string): Promise<string> => {
  if (!controller) throw new Error('FlagshipAuthModal is not mounted')
  return controller(url)
}

export const FlagshipAuthModal = (): React.ReactElement => {
  const [url, setUrl] = useState<string | null>(null)
  const resolverRef = useRef<Resolver | null>(null)

  useEffect(() => {
    controller = (u: string) =>
      new Promise<string>((resolve, reject) => {
        resolverRef.current = { resolve, reject }
        setUrl(u)
      })
    return () => {
      controller = null
    }
  }, [])

  const settle = (fn: (r: Resolver) => void): void => {
    const r = resolverRef.current
    resolverRef.current = null
    setUrl(null)
    if (r) fn(r)
  }

  const onShouldStart = (req: WebViewNavigation): boolean => {
    if (req.url.startsWith('cozy:')) {
      const captured = normalizeRedirectUrl(req.url)
      // Do not log `captured` — it carries the single-use OIDC auth code.
      console.log('[auth] webview captured cozy:// redirect')
      settle(r => r.resolve(captured))
      return false
    }
    return true
  }

  return (
    <Modal
      visible={url !== null}
      animationType="slide"
      onRequestClose={() => settle(r => r.reject(new Error('User cancelled OIDC flow')))}
    >
      <View style={styles.container}>
        {url ? (
          <WebView
            source={{ uri: url }}
            onShouldStartLoadWithRequest={onShouldStart}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            incognito={false}
            originWhitelist={['https://*', 'cozy://*', 'cozy:*']}
          />
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({ container: { flex: 1 } })
