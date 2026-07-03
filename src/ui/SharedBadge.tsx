import React from 'react'
import { StyleSheet, View } from 'react-native'
import { CozyIcon } from '@/ui/icons/CozyIcon'

import { FileSharingStatus } from '@/sharing/SharingProvider'

interface Props {
  status: FileSharingStatus | null
  /** Diameter of the inner glyph. The pill itself is `size + 8`. */
  size?: number
}

/**
 * Small circular badge overlay rendered over a file/folder thumbnail when
 * the file has any active sharing or public link. Mirrors the visual cue
 * used by twake-drive web's `SharedBadge`.
 *
 * Returns null when `status` is null or the file isn't shared — callers
 * can unconditionally render it inside a thumbnail wrapper without an
 * extra branch.
 */
export const SharedBadge = ({ status, size = 14 }: Props) => {
  if (!status?.isShared) return null
  const pill = size + 8
  return (
    <View style={[styles.badge, { width: pill, height: pill, borderRadius: pill / 2 }]}>
      <CozyIcon name="shareExternal" size={size} color="#fff" />
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#0072B2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    bottom: -4,
    borderWidth: 2,
    borderColor: '#fff'
  }
})
