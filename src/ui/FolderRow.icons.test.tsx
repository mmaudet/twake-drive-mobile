/**
 * Task 10 TDD — FolderRow icons re-skin
 *
 * Verifies that FolderRow uses CozyIcon (Svg from react-native-svg) for its
 * navigation glyphs (check, chevron-right, dots-vertical) instead of raw
 * Material icon strings.
 *
 * Red phase: run BEFORE implementing Task 10 (all asserts fail).
 * Green phase: run AFTER implementing (all asserts pass).
 */
import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { render } from '@testing-library/react-native'

jest.mock('@/sharing/SharingProvider', () => ({
  useFileSharingStatus: () => null
}))

jest.mock('@/offline/useOfflineState', () => ({
  useOfflineFolderState: jest.fn().mockReturnValue({
    pinned: false,
    aggregate: null,
    total: 0,
    downloaded: 0,
    downloading: 0,
    pending: 0,
    failed: 0
  })
}))

jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => true
}))

// FolderRow now calls useClient() (favorite toggle, added in Lot C Task R);
// mock cozy-client so this render test doesn't load its native deps.
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({})
}))

import { FolderRow, FolderItem } from './FolderRow'

const folder: FolderItem = { _id: 'd1', name: 'TestFolder' }
const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FolderRow icons (CozyIcon re-skin)', () => {
  /**
   * PRIMARY TDD TEST
   *
   * When `selected={true}` the FileTypeIcon is NOT rendered (the left slot
   * shows the checkmark instead), and SharedBadge returns null (no sharing).
   * Therefore the only Svgs in the tree come from our CozyIcon replacements
   * (check + chevron-right). Before Task 10: zero Svgs → test FAILS.
   * After Task 10: at least two Svgs → test PASSES.
   */
  it('renders CozyIcon Svgs for check and chevron-right when selected (TDD red→green)', () => {
    const Svg = require('react-native-svg').default
    const { UNSAFE_getAllByType } = render(
      wrap(<FolderRow folder={folder} onPress={() => {}} selected />)
    )
    // Asserts at least one CozyIcon Svg is present in the selected-state tree.
    expect(UNSAFE_getAllByType(Svg).length).toBeGreaterThan(0)
  })

  /**
   * SECONDARY TEST — chevron-right and dots-vertical use CozyIcon
   *
   * In non-selected mode the right slot is either a chevron (no menu props)
   * or a dots-vertical button (menu props provided). Both are re-skinned to
   * CozyIcon in Task 10, adding one extra Svg on top of the FileTypeIcon Svg
   * already in the left slot.
   *
   * Before Task 10: only FileTypeIcon → 1 Svg → test FAILS (`> 1` false).
   * After Task 10: FileTypeIcon + right-slot CozyIcon → 2 Svgs → test PASSES.
   */
  it('renders a CozyIcon Svg for the chevron-right (non-selected, no menu)', () => {
    const Svg = require('react-native-svg').default
    const { UNSAFE_getAllByType } = render(wrap(<FolderRow folder={folder} onPress={() => {}} />))
    // After Task 10: ≥ 2 Svgs (FileTypeIcon + chevron CozyIcon)
    expect(UNSAFE_getAllByType(Svg).length).toBeGreaterThan(1)
  })

  it('renders a CozyIcon Svg for the dots-vertical trigger (non-selected, with menu)', () => {
    const Svg = require('react-native-svg').default
    const { UNSAFE_getAllByType } = render(
      wrap(<FolderRow folder={folder} onPress={() => {}} onRename={() => {}} />)
    )
    // After Task 10: ≥ 2 Svgs (FileTypeIcon + dots-vertical CozyIcon)
    expect(UNSAFE_getAllByType(Svg).length).toBeGreaterThan(1)
  })
})
