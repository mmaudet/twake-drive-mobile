import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from 'react-native-paper'
import { CozyIcon } from './icons/CozyIcon'
import { useViewMode } from './useViewMode'

const ICON_SIZE = 24

/**
 * Two-button toggle that switches between list and grid view modes.
 * The active button's icon is tinted `theme.colors.primary`;
 * the inactive button uses `theme.colors.onSurfaceVariant`.
 * View mode state is persisted via MMKV and shared across all consumers of
 * `useViewMode`.
 */
export function ViewSwitcher() {
  const { mode, setMode } = useViewMode()
  const { colors } = useTheme()

  const activeColor = colors.primary
  const inactiveColor = colors.onSurfaceVariant

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setMode('list')}
        accessibilityLabel="list view"
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'list' }}
        style={styles.button}
      >
        <CozyIcon
          name="listMin"
          size={ICON_SIZE}
          color={mode === 'list' ? activeColor : inactiveColor}
        />
      </Pressable>

      <Pressable
        onPress={() => setMode('grid')}
        accessibilityLabel="grid view"
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'grid' }}
        style={styles.button}
      >
        <CozyIcon
          name="mosaicMin"
          size={ICON_SIZE}
          color={mode === 'grid' ? activeColor : inactiveColor}
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  button: {
    padding: 8
  }
})
