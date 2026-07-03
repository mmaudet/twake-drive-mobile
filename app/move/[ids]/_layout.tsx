import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { moveEntry, MoveEntryTarget } from '@/files/moveEntry'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'

const SNACKBAR_DISMISS_DELAY_MS = 600

interface MoveContextValue {
  idList: string[]
  firstDoc: FileQueryResult | null
  isLoading: boolean
  hasError: boolean
  isBusy: boolean
  onConfirm: (dest: { _id: string; name: string }) => Promise<void>
  onCancel: () => void
  retry: () => void
}

const MoveContext = createContext<MoveContextValue | null>(null)

export const useMoveContext = (): MoveContextValue => {
  const ctx = useContext(MoveContext)
  if (!ctx) throw new Error('useMoveContext must be used inside MoveLayout')
  return ctx
}

export default function MoveLayout() {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const { ids } = useLocalSearchParams<{ ids: string }>()
  const idList = useMemo(() => (ids ? ids.split(',').filter(Boolean) : []), [ids])
  const firstId = idList[0] ?? ''

  const firstLookup = useQuery(fileByIdQuery(firstId), {
    as: fileByIdQueryAs(firstId),
    enabled: !!firstId
  })
  // Preserve the first doc across re-renders triggered by setIsBusy /
  // setSnackbar — cozy-client caches in production but our test mocks
  // would otherwise drop it. See app/move/[ids].tsx (previous impl) for
  // the same pattern.
  const firstDocRef = useRef<FileQueryResult | null>(null)
  const raw = Array.isArray(firstLookup.data) ? firstLookup.data[0] : firstLookup.data
  if (raw) firstDocRef.current = raw as FileQueryResult
  const firstDoc = firstDocRef.current

  const [isBusy, setIsBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  // Cancel/close: dismiss closes the pageSheet modal from any depth in the
  // nested stack. Falls back to back() if dismiss isn't available.
  const close = useCallback((): void => {
    type MaybeDismiss = { dismiss?: () => void; canDismiss?: () => boolean }
    const r = router as unknown as MaybeDismiss
    if (typeof r.dismiss === 'function' && r.canDismiss?.() !== false) {
      r.dismiss()
      return
    }
    if (router.canGoBack()) router.back()
  }, [router])

  const onConfirm = useCallback(
    async (dest: { _id: string; name: string }): Promise<void> => {
      if (!client || !firstDoc) return
      setIsBusy(true)
      setSnackbar(null)
      try {
        for (const id of idList) {
          const target: MoveEntryTarget = {
            _id: id,
            name: id === firstDoc._id ? firstDoc.name : '',
            type: id === firstDoc._id ? (firstDoc.type ?? 'file') : 'file',
            dir_id: firstDoc.dir_id ?? ''
          }
          await moveEntry(client, target, dest._id, { force: true })
        }
        const key =
          idList.length > 1
            ? 'drive.move.successBulk'
            : firstDoc.type === 'directory'
              ? 'drive.move.successFolder'
              : 'drive.move.successFile'
        setSnackbar(t(key, { count: idList.length }))
        setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
      } catch (e) {
        console.error('[MoveLayout] move failed', e)
        setSnackbar(t('drive.move.errorGeneric'))
      } finally {
        setIsBusy(false)
      }
    },
    [client, firstDoc, idList, t, close]
  )

  const value = useMemo<MoveContextValue>(
    () => ({
      idList,
      firstDoc,
      isLoading: firstLookup.fetchStatus === 'loading' && !firstDoc,
      hasError: !firstDoc && firstLookup.fetchStatus !== 'loading',
      isBusy,
      onConfirm,
      onCancel: close,
      retry: () => firstLookup.fetch()
    }),
    [idList, firstDoc, firstLookup.fetchStatus, isBusy, onConfirm, close, firstLookup]
  )

  return (
    <MoveContext.Provider value={value}>
      <Stack
        screenOptions={{
          headerShown: false,
          // Mirror the file-screen drill UX: enable the iOS native swipe-back
          // gesture. gestureEnabled is on by default but defaults to a small
          // edge-only zone; fullScreenGestureEnabled extends it to the whole
          // screen so it stays discoverable inside the page-sheet modal.
          gestureEnabled: true,
          fullScreenGestureEnabled: true
        }}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </MoveContext.Provider>
  )
}
