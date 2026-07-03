import React from 'react'
import { Button, Dialog, Portal, Text } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from '@/utils/formatters'

interface Props {
  visible: boolean
  count: number
  bytes: number
  onConfirm: () => void
  onCancel: () => void
}

export const BigFolderConfirmDialog = ({
  visible,
  count,
  bytes,
  onConfirm,
  onCancel
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>{t('drive.offline.bigFolderTitle')}</Dialog.Title>
        <Dialog.Content>
          <Text>{t('drive.offline.folderConfirm', { count, size: formatFileSize(bytes) })}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>{t('common.cancel')}</Button>
          <Button onPress={onConfirm} mode="contained">
            {t('common.confirm')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
