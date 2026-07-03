import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useQuery: () => ({ data: null, fetchStatus: 'loaded' }),
  Q: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    sortBy: jest.fn().mockReturnThis(),
    limitBy: jest.fn().mockReturnThis(),
    getById: jest.fn().mockReturnThis()
  }))
}))

import { Breadcrumb } from './Breadcrumb'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('Breadcrumb', () => {
  const segments = [
    { id: 'root', name: 'Mes fichiers' },
    { id: 'docs', name: 'Documents' },
    { id: 'work', name: 'Travail' }
  ]

  it('renders the current folder name', () => {
    render(wrap(<Breadcrumb segments={segments} onSegmentPress={() => {}} />))
    expect(screen.getByText('Travail')).toBeOnTheScreen()
  })

  it('does nothing when the title is tapped with a single root segment', () => {
    const handler = jest.fn()
    render(
      wrap(
        <Breadcrumb segments={[{ id: 'root', name: 'Mes fichiers' }]} onSegmentPress={handler} />
      )
    )
    fireEvent.press(screen.getByText('Mes fichiers'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('opens a dropdown listing parent segments when there are >= 2 segments', () => {
    render(wrap(<Breadcrumb segments={segments} onSegmentPress={() => {}} />))
    fireEvent.press(screen.getByText('Travail'))
    expect(screen.getByText('Mes fichiers')).toBeOnTheScreen()
    expect(screen.getByText('Documents')).toBeOnTheScreen()
  })

  it('calls onSegmentPress with the parent index when a parent is tapped', () => {
    const handler = jest.fn()
    render(wrap(<Breadcrumb segments={segments} onSegmentPress={handler} />))
    fireEvent.press(screen.getByText('Travail'))
    fireEvent.press(screen.getByText('Documents'))
    expect(handler).toHaveBeenCalledWith(1)
  })
})
