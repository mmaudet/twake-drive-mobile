import React from 'react'
import { useLocalSearchParams } from 'expo-router'

import { MoveScreen } from './_MoveScreen'

export default function MoveDrillScreen() {
  const { path } = useLocalSearchParams<{ path: string | string[] }>()
  const pathSegments = Array.isArray(path) ? path.filter(Boolean) : path ? [path] : []
  return <MoveScreen pathSegments={pathSegments} />
}
