import React from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { ViewSwitcher } from './ViewSwitcher'
import { useViewMode, setViewMode } from './useViewMode'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

beforeEach(() => {
  // Reset to default 'list' mode between tests so they don't contaminate each other.
  act(() => {
    setViewMode('list')
  })
})

describe('ViewSwitcher', () => {
  it('renders both list and grid icon buttons', () => {
    render(wrap(<ViewSwitcher />))
    expect(screen.getByLabelText('list view')).toBeTruthy()
    expect(screen.getByLabelText('grid view')).toBeTruthy()
  })

  it('defaults to list mode: list icon is selected, grid is not', () => {
    render(wrap(<ViewSwitcher />))
    const listBtn = screen.getByLabelText('list view')
    const gridBtn = screen.getByLabelText('grid view')
    expect(listBtn).toBeSelected()
    expect(gridBtn).not.toBeSelected()
  })

  it('tapping grid icon changes mode to grid', () => {
    const { result } = renderHook(() => useViewMode())
    render(wrap(<ViewSwitcher />))

    fireEvent.press(screen.getByLabelText('grid view'))

    expect(result.current.mode).toBe('grid')
  })

  it('after tapping grid, grid icon is selected and list is not', () => {
    render(wrap(<ViewSwitcher />))

    fireEvent.press(screen.getByLabelText('grid view'))

    expect(screen.getByLabelText('grid view')).toBeSelected()
    expect(screen.getByLabelText('list view')).not.toBeSelected()
  })

  it('tapping list icon after grid reverts mode to list', () => {
    const { result } = renderHook(() => useViewMode())
    render(wrap(<ViewSwitcher />))

    fireEvent.press(screen.getByLabelText('grid view'))
    expect(result.current.mode).toBe('grid')

    fireEvent.press(screen.getByLabelText('list view'))
    expect(result.current.mode).toBe('list')
  })
})
