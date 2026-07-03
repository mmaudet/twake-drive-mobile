import React from 'react'
import Svg, { Rect, Path, Defs, LinearGradient, Stop, G } from 'react-native-svg'

export function TwakeLogo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 33 33" fill="none">
      <Rect x={0.618} y={0.718} width={32} height={32} rx={10.568} fill="url(#twakeLogoGrad)" />
      <G fill="#fff">
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M16.61 18.913a5.25 5.25 0 00-.228-1.54 5.455 5.455 0 00-.398-.96 5.25 5.25 0 00-.927-1.25 5.318 5.318 0 00-2.972-1.496 5.484 5.484 0 00-.779-.058 5.25 5.25 0 00-1.54.229 5.358 5.358 0 00-1.406.665 5.288 5.288 0 00-1.953 2.38 5.276 5.276 0 00-.398 2.29 5.306 5.306 0 005.037 5.037c.087.004.174.006.26.006h8.486v-5.303H16.61z"
        />
        <Path d="M19.791 24.216a7.425 7.425 0 100-14.85 7.425 7.425 0 000 14.85z" />
      </G>
      <Defs>
        <LinearGradient
          id="twakeLogoGrad"
          x1={4.126}
          y1={29.682}
          x2={39.046}
          y2={-5.32}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset={0.248} stopColor="#FF4759" />
          <Stop offset={1} stopColor="#FFD600" />
        </LinearGradient>
      </Defs>
    </Svg>
  )
}
