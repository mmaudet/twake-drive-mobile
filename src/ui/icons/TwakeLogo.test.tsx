import React from 'react'
import { render } from '@testing-library/react-native'
import { TwakeLogo } from './TwakeLogo'

test('TwakeLogo rend sans planter', () => {
  const { UNSAFE_root } = render(<TwakeLogo size={40} />)
  expect(UNSAFE_root).toBeTruthy()
})
