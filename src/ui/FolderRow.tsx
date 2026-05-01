import React from 'react'
import { StyleSheet } from 'react-native'
import { List, useTheme } from 'react-native-paper'

export interface FolderItem {
  _id: string
  name: string
}

interface Props {
  folder: FolderItem
  onPress: (folder: FolderItem) => void
}

export const FolderRow = ({ folder, onPress }: Props) => {
  const theme = useTheme()
  return (
    <List.Item
      title={folder.name}
      left={props => <List.Icon {...props} icon="folder" color={theme.colors.primary} />}
      right={props => <List.Icon {...props} icon="chevron-right" />}
      onPress={() => onPress(folder)}
      style={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 }
})
