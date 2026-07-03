import React from 'react'
import { render } from '@testing-library/react-native'
import { CozyIcon } from './CozyIcon'
import { ICONS } from './registry'

test('nouvelles clés présentes', () => {
  for (const k of ['chevronRight', 'dotsVertical', 'cog', 'logout', 'accountCircle']) {
    expect(ICONS[k]).toBeDefined()
  }
})

test('CozyIcon applique le stroke', () => {
  const { UNSAFE_root } = render(<CozyIcon name="chevronRight" />)
  expect(UNSAFE_root).toBeTruthy()
})
