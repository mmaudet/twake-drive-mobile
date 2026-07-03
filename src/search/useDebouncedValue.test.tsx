import React from 'react'
import { Text } from 'react-native'
import { render, screen, act } from '@testing-library/react-native'
import { useDebouncedValue } from './useDebouncedValue'

jest.useFakeTimers()

const Probe = ({ value }: { value: string }) => {
  const debounced = useDebouncedValue(value, 300)
  return <Text testID="out">{debounced}</Text>
}

describe('useDebouncedValue', () => {
  it('renvoie la valeur initiale immédiatement', () => {
    render(<Probe value="apple" />)
    expect(screen.getByTestId('out')).toHaveTextContent('apple')
  })

  it("ne met à jour qu'après le délai", () => {
    const { rerender } = render(<Probe value="apple" />)
    rerender(<Probe value="banana" />)
    expect(screen.getByTestId('out')).toHaveTextContent('apple')
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(screen.getByTestId('out')).toHaveTextContent('banana')
  })
})
