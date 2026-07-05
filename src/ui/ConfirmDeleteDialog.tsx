import React from 'react'
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  /** Single item being deleted; the dialog interpolates its name. Mutually
   * exclusive with `bulkCount`. */
  target?: { name?: string; type?: 'file' | 'directory' } | null
  /** Number of items being deleted in bulk mode. When > 0, the dialog
   * renders the bulk title/body instead of the single-item one. */
  bulkCount?: number
  loading?: boolean
  onConfirm: () => void
  onDismiss: () => void
}

export const ConfirmDeleteDialog = ({
  visible,
  target,
  bulkCount,
  loading,
  onConfirm,
  onDismiss
}: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isBulk = !!bulkCount && bulkCount > 0
  const isFolder = target?.type === 'directory'
  const titleKey = isBulk
    ? 'drive.delete.confirmBulkTitle'
    : isFolder
      ? 'drive.delete.confirmFolderTitle'
      : 'drive.delete.confirmFileTitle'
  const bodyKey = isBulk ? 'drive.delete.confirmBulkBody' : 'drive.delete.confirmBody'
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} dismissable={!loading}>
        <Dialog.Title>{t(titleKey, { count: bulkCount ?? 0 })}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            {t(bodyKey, { name: target?.name ?? '', count: bulkCount ?? 0 })}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading} testID="confirm-delete-cancel">
            {t('common.cancel')}
          </Button>
          <Button
            onPress={onConfirm}
            loading={loading}
            disabled={loading}
            textColor={theme.colors.error}
            testID="confirm-delete-submit"
          >
            {t('drive.delete.confirm')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
