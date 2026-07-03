import React from 'react'
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import { PinnedBadge } from './PinnedBadge'
import { OfflineFileEntry } from './types'

const wrap = (ui: React.ReactElement): ReturnType<typeof render> =>
  render(<PaperProvider>{ui}</PaperProvider>)

const entry = (state: OfflineFileEntry['state']): OfflineFileEntry => ({
  fileId: 'f1',
  state,
  rev: '1',
  md5sum: 'm',
  size: 1,
  name: 'f1',
  localPath: '/o/f1',
  pinnedAt: 0,
  isDirectPin: true,
  parentFolderPins: []
})

describe('PinnedBadge', () => {
  it('renders nothing when entry is undefined', () => {
    const { queryByTestId, root } = wrap(<PinnedBadge entry={undefined} testID="pinned-badge" />)
    expect(queryByTestId('pinned-badge')).toBeNull()
    expect(root).toBeDefined() // PaperProvider still mounted, but the badge itself is absent
  })
  it('renders for downloaded state', () => {
    const { queryByTestId } = wrap(
      <PinnedBadge entry={entry('downloaded')} testID="pinned-badge" />
    )
    expect(queryByTestId('pinned-badge')).not.toBeNull()
  })
  it('renders for failed state', () => {
    const { queryByTestId } = wrap(<PinnedBadge entry={entry('failed')} testID="pinned-badge" />)
    expect(queryByTestId('pinned-badge')).not.toBeNull()
  })
})
