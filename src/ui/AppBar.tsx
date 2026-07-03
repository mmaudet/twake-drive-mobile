import React, { useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { Appbar, Avatar, Menu, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'

import { SyncIndicator } from './SyncIndicator'
import { TwakeLogo } from '@/ui/icons/TwakeLogo'
import { CozyIcon } from '@/ui/icons/CozyIcon'

export interface AppBarSelectionAction {
  icon: string
  onPress: () => void
  accessibilityLabel?: string
  /** Render this action in the error/destructive tint. */
  destructive?: boolean
  /** Hide the action without removing it from the array (so layout is stable). */
  hidden?: boolean
}

interface AppBarSelection {
  count: number
  onCancel: () => void
  actions: AppBarSelectionAction[]
}

interface Props {
  title: string
  onBack?: () => void
  onLogout?: () => void
  /** When set, a magnify action is shown (outside selection mode) → opens search. */
  onSearch?: () => void
  /**
   * When true, a magnifier icon button is rendered to the left of the avatar
   * menu. Tapping it navigates to the file-name search screen.
   */
  showSearch?: boolean
  /**
   * When set, the AppBar swaps to selection mode: the title shows the
   * count, the back/menu controls are replaced with a close action, and
   * the provided actions are rendered on the right.
   */
  selection?: AppBarSelection
}

// `showSearch` renders the search loupe (→ /search, the server-side search screen)
// plus a help button. `onSearch` is the legacy magnify Action from the web-search
// track — no screen wires it anymore, kept only for backward compatibility.
export const AppBar = ({ title, onBack, onLogout, onSearch, showSearch, selection }: Props) => {
  const { t } = useTranslation()
  const [menuVisible, setMenuVisible] = useState(false)
  const theme = useTheme()
  const router = useRouter()
  const initials = 'MM'

  if (selection) {
    return (
      <Appbar.Header>
        <Appbar.Action
          icon={p => <CozyIcon name="cross" size={p?.size ?? 24} color={p?.color} />}
          onPress={selection.onCancel}
          accessibilityLabel={t('common.cancel')}
        />
        <Appbar.Content title={t('drive.selection.count', { count: selection.count })} />
        {selection.actions
          .filter(a => !a.hidden)
          .map((a, idx) => (
            <Appbar.Action
              key={`${a.icon}-${idx}`}
              icon={a.icon}
              onPress={a.onPress}
              accessibilityLabel={a.accessibilityLabel}
              color={a.destructive ? '#c0392b' : undefined}
            />
          ))}
      </Appbar.Header>
    )
  }

  return (
    <Appbar.Header>
      {onBack ? <Appbar.BackAction onPress={onBack} /> : null}
      <View style={styles.logo}>
        <TwakeLogo size={28} />
      </View>
      <Appbar.Content title={title} />
      {onSearch ? (
        <Appbar.Action
          icon="magnify"
          onPress={onSearch}
          accessibilityLabel={t('drive.search.action')}
        />
      ) : null}
      <SyncIndicator />
      {showSearch ? (
        <Pressable
          onPress={() => router.push('/search')}
          accessibilityLabel={t('drive.search.action')}
          style={styles.searchButton}
        >
          <CozyIcon name="magnifier" size={24} color={theme.colors.onSurface} />
        </Pressable>
      ) : null}
      {showSearch ? (
        <Pressable
          onPress={() => Linking.openURL('https://twake.app')}
          accessibilityLabel={t('common.help')}
          style={styles.searchButton}
          testID="appbar-help-button"
        >
          <CozyIcon name="info" size={24} color={theme.colors.onSurface} />
        </Pressable>
      ) : null}
      {onLogout ? (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <Pressable onPress={() => setMenuVisible(true)}>
              <Avatar.Text size={32} label={initials} />
            </Pressable>
          }
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              router.push('/(drive)/settings')
            }}
            title={t('settings.title')}
            leadingIcon={() => <CozyIcon name="cog" size={24} color={theme.colors.onSurface} />}
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              router.push('/(drive)/shareddrives')
            }}
            title={t('drive.sharedDrives')}
            leadingIcon={() => (
              <CozyIcon name="folderMultiple" size={24} color={theme.colors.onSurface} />
            )}
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              onLogout()
            }}
            title={t('common.logout')}
            leadingIcon={() => <CozyIcon name="logout" size={24} color={theme.colors.onSurface} />}
          />
        </Menu>
      ) : null}
    </Appbar.Header>
  )
}

const styles = StyleSheet.create({
  logo: {
    marginLeft: 4,
    marginRight: 4,
    justifyContent: 'center'
  },
  searchButton: {
    marginHorizontal: 4,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center'
  }
})
