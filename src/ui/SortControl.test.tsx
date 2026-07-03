import '@/i18n'
import React from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { SortControl } from './SortControl'
import { useFolderSort, setFolderSort } from './useFolderSort'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

beforeEach(() => {
  // Reset to default asc between tests to avoid contamination.
  act(() => {
    setFolderSort({ attr: 'name', dir: 'asc' })
  })
})

describe('SortControl', () => {
  it('renders with A-Z label when sort is asc', () => {
    render(wrap(<SortControl />))
    expect(screen.getByLabelText('A-Z')).toBeTruthy()
  })

  it('renders with Z-A label when sort is desc', () => {
    act(() => {
      setFolderSort({ attr: 'name', dir: 'desc' })
    })
    render(wrap(<SortControl />))
    expect(screen.getByLabelText('Z-A')).toBeTruthy()
  })

  it('tapping Z-A menu item changes dir to desc and hook reflects new state', () => {
    const { result } = renderHook(() => useFolderSort())
    render(wrap(<SortControl />))

    // Open the menu by pressing the anchor button
    fireEvent.press(screen.getByLabelText('A-Z'))
    // Select Z-A
    fireEvent.press(screen.getByText('Z-A'))

    expect(result.current.sort.dir).toBe('desc')
  })

  it('after selecting Z-A the anchor label updates to Z-A', () => {
    render(wrap(<SortControl />))

    fireEvent.press(screen.getByLabelText('A-Z'))
    fireEvent.press(screen.getByText('Z-A'))

    expect(screen.getByLabelText('Z-A')).toBeTruthy()
  })

  it('selecting A-Z from Z-A state reverts dir to asc', () => {
    const { result } = renderHook(() => useFolderSort())
    act(() => {
      setFolderSort({ attr: 'name', dir: 'desc' })
    })
    render(wrap(<SortControl />))

    fireEvent.press(screen.getByLabelText('Z-A'))
    fireEvent.press(screen.getByText('A-Z'))

    expect(result.current.sort.dir).toBe('asc')
  })
})
