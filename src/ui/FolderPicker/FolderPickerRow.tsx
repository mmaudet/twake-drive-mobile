import React from 'react'
import { StyleSheet, View } from 'react-native'
import { List, useTheme } from 'react-native-paper'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'

export interface FolderPickerRowItem {
  _id: string
  name: string
  type: 'file' | 'directory'
}

interface Props {
  item: FolderPickerRowItem
  disabled: boolean
  onPress: (item: FolderPickerRowItem) => void
}

export const FolderPickerRow = ({ item, disabled, onPress }: Props) => {
  const theme = useTheme()
  const isFolder = item.type === 'directory'
  return (
    <List.Item
      title={item.name}
      titleStyle={disabled ? { color: theme.colors.outline } : undefined}
      left={props => (
        <View style={[props.style, styles.leftSlot]}>
          <FileTypeIcon icon={isFolder ? 'folder' : 'files'} size={32} />
        </View>
      )}
      right={props =>
        isFolder && !disabled ? (
          <List.Icon
            {...props}
            icon={p => <CozyIcon name="chevronRight" size={p?.size ?? 24} color={p?.color} />}
          />
        ) : null
      }
      onPress={disabled ? undefined : () => onPress(item)}
      style={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  leftSlot: { justifyContent: 'center', alignItems: 'center', width: 32, height: 32 }
})
