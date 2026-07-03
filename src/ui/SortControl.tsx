import React, { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Menu, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useFolderSort } from './useFolderSort'

/**
 * A pressable label (A-Z / Z-A) that opens a Paper Menu to select the folder
 * sort direction. Sort state is persisted via MMKV and shared across all
 * consumers of `useFolderSort`.
 */
export function SortControl() {
  const { sort, setSort } = useFolderSort()
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [menuVisible, setMenuVisible] = useState(false)

  const label = sort.dir === 'asc' ? t('drive.sortAZ') : t('drive.sortZA')

  return (
    <Menu
      visible={menuVisible}
      onDismiss={() => setMenuVisible(false)}
      anchor={
        <Pressable
          onPress={() => setMenuVisible(true)}
          accessibilityLabel={label}
          accessibilityRole="button"
          style={styles.anchor}
        >
          <Text style={[styles.label, { color: colors.onSurface }]}>{label}</Text>
        </Pressable>
      }
    >
      <Menu.Item
        onPress={() => {
          setSort({ attr: 'name', dir: 'asc' })
          setMenuVisible(false)
        }}
        title={t('drive.sortAZ')}
      />
      <Menu.Item
        onPress={() => {
          setSort({ attr: 'name', dir: 'desc' })
          setMenuVisible(false)
        }}
        title={t('drive.sortZA')}
      />
    </Menu>
  )
}

const styles = StyleSheet.create({
  anchor: {
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  label: {
    fontSize: 14
  }
})
