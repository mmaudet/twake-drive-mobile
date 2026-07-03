import React from 'react'
import Svg, { Path } from 'react-native-svg'
import { ICONS } from './registry'

type Props = { name: string; size?: number; color?: string }

export function CozyIcon({ name, size = 24, color = '#000000' }: Props) {
  const def = ICONS[name]
  if (!def) return null
  return (
    <Svg width={size} height={size} viewBox={def.viewBox}>
      {def.paths.map((p, i) => (
        <Path
          key={i}
          d={p.d}
          fill={p.fill ?? color}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
        />
      ))}
    </Svg>
  )
}
