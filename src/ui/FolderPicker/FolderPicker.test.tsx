import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockUseQuery = jest.fn()

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({
    getById: () => ({}),
    where: () => ({
      partialIndex: () => ({
        indexFields: () => ({
          sortBy: () => ({ limitBy: () => ({}) })
        })
      })
    })
  })
}))

jest.mock('@/files/createFolder', () => ({
  createFolder: jest.fn().mockResolvedValue({ _id: 'new-id', name: 'New', type: 'directory' })
}))

import { createFolder } from '@/files/createFolder'
import { FolderPicker } from './FolderPicker'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const subfolder = (id: string, name: string) => ({
  _id: id,
  name,
  type: 'directory' as const
})

const file = (id: string, name: string) => ({
  _id: id,
  name,
  type: 'file' as const
})

const setupQueries = (folderName: string, children: ReadonlyArray<unknown>): void => {
  // 1st call: fileByIdQuery (the folder doc itself)
  // 2nd call: folderSubfoldersQuery
  // 3rd call: folderFilesQuery (we still show them disabled)
  const sequence = [
    {
      data: { _id: 'src', name: folderName, type: 'directory', path: '/' + folderName },
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    {
      data: (children as any[]).filter((c: any) => c.type === 'directory'),
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    {
      data: (children as any[]).filter((c: any) => c.type === 'file'),
      fetchStatus: 'loaded',
      fetch: jest.fn()
    }
  ]
  let i = 0
  mockUseQuery.mockImplementation(() => sequence[Math.min(i++, sequence.length - 1)])
}

const defaultProps = {
  currentFolderId: 'src',
  excludeIds: new Set<string>(),
  confirmLabel: 'Move here',
  isBusy: false,
  isAtRoot: true,
  onDrillIn: jest.fn(),
  onBack: jest.fn(),
  onConfirm: jest.fn(),
  onCancel: jest.fn()
}

describe('FolderPicker', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    ;(createFolder as jest.Mock).mockClear()
    defaultProps.onDrillIn.mockReset()
    defaultProps.onBack.mockReset()
    defaultProps.onConfirm.mockReset()
    defaultProps.onCancel.mockReset()
  })

  it('renders the current folder name and its subfolders', () => {
    setupQueries('Work', [subfolder('a', 'Q1'), subfolder('b', 'Q2')])
    render(wrap(<FolderPicker {...defaultProps} currentFolderId="src" />))
    expect(screen.getByText('Work')).toBeOnTheScreen()
    expect(screen.getByText('Q1')).toBeOnTheScreen()
    expect(screen.getByText('Q2')).toBeOnTheScreen()
  })

  it('disables "Move here" when current folder is in excludeIds', () => {
    setupQueries('Work', [])
    render(
      wrap(<FolderPicker {...defaultProps} currentFolderId="src" excludeIds={new Set(['src'])} />)
    )
    const button = screen.getByRole('button', { name: 'Move here' })
    expect(button.props.accessibilityState?.disabled).toBe(true)
  })

  it('calls onConfirm with the current folder on tap', () => {
    setupQueries('Work', [])
    const onConfirm = jest.fn()
    render(wrap(<FolderPicker {...defaultProps} currentFolderId="src" onConfirm={onConfirm} />))
    fireEvent.press(screen.getByText('Move here'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ _id: 'src', name: 'Work' }))
  })

  it('calls onCancel when the Cancel button is tapped', () => {
    setupQueries('Work', [])
    const onCancel = jest.fn()
    render(wrap(<FolderPicker {...defaultProps} onCancel={onCancel} />))
    fireEvent.press(screen.getByText('common.cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders disabled files in the list', () => {
    setupQueries('Work', [subfolder('a', 'Q1'), file('f', 'budget.xlsx')])
    render(wrap(<FolderPicker {...defaultProps} currentFolderId="src" />))
    expect(screen.getByText('budget.xlsx')).toBeOnTheScreen()
  })

  it('calls onDrillIn when a folder row is tapped', () => {
    setupQueries('Work', [subfolder('a', 'Q1')])
    const onDrillIn = jest.fn()
    render(wrap(<FolderPicker {...defaultProps} currentFolderId="src" onDrillIn={onDrillIn} />))
    fireEvent.press(screen.getByText('Q1'))
    expect(onDrillIn).toHaveBeenCalledWith({ _id: 'a', name: 'Q1', type: 'directory' })
  })

  it('does not render the back arrow when isAtRoot=true', () => {
    setupQueries('Work', [])
    render(wrap(<FolderPicker {...defaultProps} isAtRoot={true} />))
    expect(screen.queryByLabelText('common.back')).toBeNull()
  })

  it('calls onBack when the back arrow is tapped (isAtRoot=false)', () => {
    setupQueries('Work', [])
    const onBack = jest.fn()
    render(wrap(<FolderPicker {...defaultProps} isAtRoot={false} onBack={onBack} />))
    fireEvent.press(screen.getByLabelText('common.back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('opens the create-folder dialog when the "+ New folder" button is tapped', () => {
    setupQueries('Work', [])
    render(wrap(<FolderPicker {...defaultProps} />))
    fireEvent.press(screen.getByLabelText('drive.move.newFolder'))
    // CreateFolderDialog renders a title whose translation key is returned as-is.
    expect(screen.getByText('drive.createFolder.title')).toBeOnTheScreen()
  })
})
