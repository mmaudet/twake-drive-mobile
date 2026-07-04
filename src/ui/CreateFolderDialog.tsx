import React, { useState, useEffect } from 'react'
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  onDismiss: () => void
  onSubmit: (name: string) => Promise<void>
}

export const CreateFolderDialog = ({ visible, onDismiss, onSubmit }: Props) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setName('')
      setError(null)
      setSubmitting(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(name.trim())
    } catch (e) {
      const err = e as Error
      if (err.name === 'FolderConflictError') {
        setError(t('drive.createFolder.errorConflict'))
      } else {
        setError(t('drive.createFolder.errorGeneric'))
      }
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={submitting ? undefined : onDismiss}>
        <Dialog.Title>{t('drive.createFolder.title')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            testID="create-folder-name-input"
            mode="outlined"
            label={t('drive.createFolder.nameLabel')}
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="sentences"
            disabled={submitting}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          <HelperText type="error" visible={!!error}>
            {error ?? ''}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            mode="contained"
            testID="create-folder-submit"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!name.trim() || submitting}
          >
            {t('drive.createFolder.submit')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
