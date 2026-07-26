import React, { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useAuth } from '@/auth/useAuth'

export const DevResetButton = (): React.ReactElement | null => {
  const { devResetAndResync } = useAuth()
  const [busy, setBusy] = useState(false)

  if (!__DEV__) return null

  const handlePress = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await devResetAndResync()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Pressable style={styles.button} onPress={handlePress}>
      <Text style={styles.label}>{busy ? '…' : 'RESYNC'}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 12,
    bottom: 110,
    zIndex: 9999,
    backgroundColor: '#d32f2f',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    opacity: 0.85
  },
  label: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  }
})
