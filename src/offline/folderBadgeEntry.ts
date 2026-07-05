import type { OfflineFileEntry, OfflineFileState } from './types'

// Synthetic entry just to drive the PinnedBadge visuals for a folder. Folders
// don't have per-folder state in the store; we synthesize one whose `state`
// reflects the aggregated state of the folder's pinned children. Shared by the
// list row (FolderRow) and the grid tile (FileGridItem).
export const folderBadgeEntry = (state: OfflineFileState): OfflineFileEntry => ({
  fileId: '',
  state,
  rev: '',
  md5sum: '',
  size: 0,
  name: '',
  localPath: '',
  pinnedAt: 0,
  isDirectPin: false,
  parentFolderPins: []
})
