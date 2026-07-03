import React, { useEffect, useRef, useState } from 'react'
import { Modal, View, StyleSheet } from 'react-native'
import { WebView, WebViewNavigation } from 'react-native-webview'
import { normalizeRedirectUrl } from './pkce'

type Resolver = { resolve: (url: string) => void; reject: (e: Error) => void }
let controller: ((url: string) => Promise<string>) | null = null

/** Opens `url` in an in-app WebView and resolves with the `cozy://...` redirect
 *  the WebView is navigated to (captured via onShouldStartLoadWithRequest, so no
 *  Android intent / "Open app?" dialog fires). Rejects if the user closes it. */
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
      console.log('[auth] webview captured redirect', captured)
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
            incognito={false}
            originWhitelist={['https://*', 'cozy://*', 'cozy:*']}
          />
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({ container: { flex: 1 } })
