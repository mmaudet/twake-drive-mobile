import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'
import { Button, Divider, Text, useTheme } from 'react-native-paper'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'
import { useRouter } from 'expo-router'

import { formatFileSize } from '@/utils/formatters'
import { openFileNatively } from '@/files/openFile'
import { isCozyNoteFile, isOfficeFile } from '@/files/fileTypes'
import { FileThumbnail } from './FileThumbnail'

export interface FileMetadata {
  _id: string
  name: string
  type?: 'file' | 'directory'
  size: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  cozyMetadata?: {
    createdBy?: { account?: string }
  }
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

export interface FileMetadataSheetHandle {
  present: (file: FileMetadata) => void
  dismiss: () => void
}

export const FileMetadataSheet = forwardRef<FileMetadataSheetHandle>((_, ref) => {
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  const router = useRouter()
  const bottomSheetRef = useRef<BottomSheet>(null)
  const [file, setFile] = React.useState<FileMetadata | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    present: (f: FileMetadata) => {
      setFile(f)
      setOpenError(null)
      bottomSheetRef.current?.expand()
    },
    dismiss: () => bottomSheetRef.current?.close()
  }))

  const onOpen = async (): Promise<void> => {
    if (!client || !file) return
    if (isCozyNoteFile(file.name)) {
      bottomSheetRef.current?.close()
      router.push(`/(drive)/note/${file._id}`)
      return
    }
    if (isOfficeFile(file.mime)) {
      bottomSheetRef.current?.close()
      router.push(`/(drive)/onlyoffice/${file._id}`)
      return
    }
    setOpening(true)
    setOpenError(null)
    try {
      await openFileNatively(client, {
        _id: file._id,
        name: file.name,
        mime: file.mime
      })
    } catch (e) {
      console.error('[FileMetadataSheet] open failed', e)
      setOpenError((e as Error).message ?? 'open failed')
    } finally {
      setOpening(false)
    }
  }

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['40%', '90%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <BottomSheetView style={styles.container}>
        {file ? (
          <>
            <View style={styles.header}>
              <FileThumbnail file={file} size={120} />
              <Text variant="titleMedium" style={styles.name}>
                {file.name}
              </Text>
            </View>
            <Divider />
            <Row label={t('drive.fileMeta.type')} value={file.mime ?? '—'} />
            <Row label={t('drive.fileMeta.size')} value={formatFileSize(file.size)} />
            <Row
              label={t('drive.fileMeta.modified')}
              value={file.updated_at ? format(new Date(file.updated_at), 'PPp') : '—'}
            />
            <Row label={t('drive.fileMeta.path')} value={file.path ?? '—'} />
            <Row
              label={t('drive.fileMeta.owner')}
              value={file.cozyMetadata?.createdBy?.account ?? '—'}
            />
            <View style={styles.footer}>
              <Button
                mode="contained"
                onPress={onOpen}
                loading={opening}
                disabled={opening}
                icon="open-in-new"
              >
                {t('drive.fileMeta.open')}
              </Button>
              {openError ? (
                <Text
                  variant="bodySmall"
                  style={[styles.errorText, { color: theme.colors.error }]}
                >
                  {openError}
                </Text>
              ) : null}
              <Button mode="outlined" onPress={() => bottomSheetRef.current?.close()}>
                {t('common.close')}
              </Button>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  )
})

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text variant="labelMedium" style={styles.label}>
      {label}
    </Text>
    <Text variant="bodyMedium" style={styles.value}>
      {value}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  name: { textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  label: { flex: 1 },
  value: { flex: 2, textAlign: 'right' },
  footer: { marginTop: 24, gap: 8 },
  errorText: { textAlign: 'center' }
})

FileMetadataSheet.displayName = 'FileMetadataSheet'
