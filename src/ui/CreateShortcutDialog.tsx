import React, { useState, useEffect } from 'react'
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  onDismiss: () => void
  onSubmit: (name: string, url: string) => Promise<void>
}

export const CreateShortcutDialog = ({ visible, onDismiss, onSubmit }: Props) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setName('')
      setUrl('')
      setError(null)
      setSubmitting(false)
    }
  }, [visible])

  const canSubmit = name.trim().length > 0 && url.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(name.trim(), url.trim())
    } catch {
      setError(t('drive.createShortcut.errorGeneric'))
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={submitting ? undefined : onDismiss}>
        <Dialog.Title>{t('drive.createShortcut.title')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t('drive.createShortcut.nameLabel')}
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="sentences"
            disabled={submitting}
            returnKeyType="next"
          />
          <TextInput
            mode="outlined"
            label={t('drive.createShortcut.urlLabel')}
            value={url}
            onChangeText={setUrl}
            disabled={submitting}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
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
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit || submitting}
          >
            {t('drive.createShortcut.submit')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
