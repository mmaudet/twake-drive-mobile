import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { ErrorState } from './ErrorState'

test('ErrorState rend son message sans vector-icons', () => {
  const { getByText } = render(
    <PaperProvider>
      <ErrorState message="Boom" />
    </PaperProvider>
  )
  expect(getByText('Boom')).toBeTruthy()
})
