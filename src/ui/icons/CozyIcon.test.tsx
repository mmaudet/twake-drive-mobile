import React from 'react'
import { render } from '@testing-library/react-native'
import { CozyIcon } from './CozyIcon'
import { ICONS } from './registry'

test('le registre contient les icônes de base', () => {
  expect(ICONS.star).toBeDefined()
  expect(ICONS.cloud2.viewBox).toBe('0 0 16 16')
})

test('CozyIcon rend une icône connue sans planter', () => {
  const { UNSAFE_root } = render(<CozyIcon name="star" size={24} color="#3b82f7" />)
  expect(UNSAFE_root).toBeTruthy()
})

test('CozyIcon renvoie null pour une icône inconnue', () => {
  const { toJSON } = render(<CozyIcon name="__nope__" />)
  expect(toJSON()).toBeNull()
})
