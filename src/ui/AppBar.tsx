import React, { useState } from 'react'
import { Appbar, Menu } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { SyncIndicator } from './SyncIndicator'

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
   * When set, the AppBar swaps to selection mode: the title shows the
   * count, the back/menu controls are replaced with a close action, and
   * the provided actions are rendered on the right.
   */
  selection?: AppBarSelection
}

export const AppBar = ({ title, onBack, onLogout, onSearch, selection }: Props) => {
  const { t } = useTranslation()
  const [menuVisible, setMenuVisible] = useState(false)

  if (selection) {
    return (
      <Appbar.Header>
        <Appbar.Action
          icon="close"
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
      <Appbar.Content title={title} />
      {onSearch ? (
        <Appbar.Action
          icon="magnify"
          onPress={onSearch}
          accessibilityLabel={t('drive.search.action')}
        />
      ) : null}
      <SyncIndicator />
      {onLogout ? (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={<Appbar.Action icon="dots-vertical" onPress={() => setMenuVisible(true)} />}
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              onLogout()
            }}
            title={t('common.logout')}
          />
        </Menu>
      ) : null}
    </Appbar.Header>
  )
}
