import React, { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FolderPicker } from '@/ui/FolderPicker'

import { useMoveContext } from './_layout'

interface Props {
  pathSegments: string[]
}

export const MoveScreen = ({ pathSegments }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const router = useRouter()
  const ctx = useMoveContext()

  const onDrillIn = useCallback(
    (item: { _id: string }) => {
      const segments = [...pathSegments, item._id].filter(Boolean)
      const ids = ctx.idList.join(',')
      router.push(`/move/${ids}/${segments.join('/')}`)
    },
    [pathSegments, ctx.idList, router]
  )

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back()
  }, [router])

  if (ctx.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState />
      </ScreenContainer>
    )
  }
  if (ctx.hasError || !ctx.firstDoc) {
    return (
      <ScreenContainer>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={ctx.retry} />
      </ScreenContainer>
    )
  }

  const sourceDirId = ctx.firstDoc.dir_id ?? ''
  const currentFolderId =
    pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : sourceDirId
  const excludeIds = new Set<string>([...ctx.idList, sourceDirId].filter(Boolean))

  return (
    <FolderPicker
      currentFolderId={currentFolderId}
      excludeIds={excludeIds}
      confirmLabel={t('drive.move.action')}
      isBusy={ctx.isBusy}
      isAtRoot={pathSegments.length === 0}
      onDrillIn={onDrillIn}
      onBack={onBack}
      onConfirm={ctx.onConfirm}
      onCancel={ctx.onCancel}
    />
  )
}
