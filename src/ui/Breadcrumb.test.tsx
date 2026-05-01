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

  it('renders all segment names', () => {
    render(wrap(<Breadcrumb segments={segments} onSegmentPress={() => {}} />))
    expect(screen.getByText('Mes fichiers')).toBeOnTheScreen()
    expect(screen.getByText('Documents')).toBeOnTheScreen()
    expect(screen.getByText('Travail')).toBeOnTheScreen()
  })

  it('calls onSegmentPress with the index when a non-last segment is tapped', () => {
    const handler = jest.fn()
    render(wrap(<Breadcrumb segments={segments} onSegmentPress={handler} />))
    fireEvent.press(screen.getByText('Mes fichiers'))
    expect(handler).toHaveBeenCalledWith(0)
  })

  it('does not fire onSegmentPress when the last segment is tapped', () => {
    const handler = jest.fn()
    render(wrap(<Breadcrumb segments={segments} onSegmentPress={handler} />))
    fireEvent.press(screen.getByText('Travail'))
    expect(handler).not.toHaveBeenCalled()
  })
})
