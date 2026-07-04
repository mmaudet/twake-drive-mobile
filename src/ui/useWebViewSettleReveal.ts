import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** How long a page must stay put (no new load) before it counts as settled. */
  settleMs?: number
  /** Backstop: reveal unconditionally this long after mount, whatever happens. */
  maxWaitMs?: number
}

interface SettleReveal {
  ready: boolean
  onLoadStart: () => void
  onLoadEnd: () => void
  onNavigationStateChange: (nav: { loading: boolean }) => void
  onError: () => void
}

/**
 * Reveals an auth-gated WebView once its navigation has *settled*, while
 * guaranteeing it can never stay hidden.
 *
 * An editor WebView (La Suite Docs) reaches its page through a chain of OIDC
 * redirects — docs app → LemonLDAP → back — which we don't want flashing before
 * the editor renders. Callers keep an opaque overlay up while `ready` is false.
 *
 * Reveal happens on the FIRST of:
 *  - settle: a page finished loading (onLoadEnd, or onNavigationStateChange with
 *    loading=false) and nothing navigated again within `settleMs`. The normal,
 *    adaptive path — it fires on the final editor page, and also on a real login
 *    form (so the user is never trapped if the SSO cookie is gone).
 *  - error: the WebView reports a load error → reveal so the failure is visible.
 *  - backstop: `maxWaitMs` after MOUNT, unconditionally. Armed on mount (not on a
 *    load callback) so the overlay reveals even if the WebView never fires a
 *    single navigation event — the failure mode that once trapped it forever.
 */
export const useWebViewSettleReveal = (options?: Options): SettleReveal => {
  const settleMs = options?.settleMs ?? 1200
  const maxWaitMs = options?.maxWaitMs ?? 8000
  const [ready, setReady] = useState(false)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)

  const reveal = useCallback((): void => {
    if (doneRef.current) return
    doneRef.current = true
    if (settleTimer.current) clearTimeout(settleTimer.current)
    if (capTimer.current) clearTimeout(capTimer.current)
    settleTimer.current = null
    capTimer.current = null
    setReady(true)
  }, [])

  // Backstop armed on mount: a reveal is guaranteed regardless of whether the
  // WebView ever fires a load callback.
  useEffect(() => {
    capTimer.current = setTimeout(reveal, maxWaitMs)
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
      if (capTimer.current) clearTimeout(capTimer.current)
    }
  }, [reveal, maxWaitMs])

  const cancelSettle = useCallback((): void => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
  }, [])

  const armSettle = useCallback((): void => {
    if (doneRef.current) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(reveal, settleMs)
  }, [reveal, settleMs])

  const onLoadStart = useCallback((): void => {
    if (doneRef.current) return
    // A (new) navigation began → the page is not settled; cancel any pending reveal.
    cancelSettle()
  }, [cancelSettle])

  const onNavigationStateChange = useCallback(
    (nav: { loading: boolean }): void => {
      if (doneRef.current) return
      if (nav.loading) cancelSettle()
      else armSettle()
    },
    [cancelSettle, armSettle]
  )

  return { ready, onLoadStart, onLoadEnd: armSettle, onNavigationStateChange, onError: reveal }
}
