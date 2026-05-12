import * as FS from 'expo-file-system/legacy'

// TODO(offline-v1.5): backup exclusion on both platforms.
//   iOS:     set NSURLIsExcludedFromBackupKey on this directory so iCloud
//            Backup doesn't ingest it. Requires a small native module.
//   Android: extend the secure-store-generated backup rules
//            (referenced as @xml/secure_store_backup_rules and
//            @xml/secure_store_data_extraction_rules in AndroidManifest.xml)
//            to exclude `files/offline/`. Requires a custom expo config
//            plugin since android/ is prebuild-generated.
// Both deferred for v1 — users who care can disable app backup in OS settings.
const dir = (): string => {
  if (!FS.documentDirectory) throw new Error('documentDirectory unavailable')
  return `${FS.documentDirectory}offline/`
}

export const FileSystemRepo = {
  dir,
  localPath: (fileId: string): string => `${dir()}${fileId}`,
  async init(): Promise<void> {
    const info = await FS.getInfoAsync(dir())
    if (!info.exists) {
      await FS.makeDirectoryAsync(dir(), { intermediates: true })
    }
  },
  async exists(fileId: string): Promise<boolean> {
    const info = await FS.getInfoAsync(FileSystemRepo.localPath(fileId))
    return Boolean(info.exists)
  },
  async delete(fileId: string): Promise<void> {
    await FS.deleteAsync(FileSystemRepo.localPath(fileId), { idempotent: true })
  },
  async totalBytes(): Promise<number> {
    const names = await FS.readDirectoryAsync(dir())
    let total = 0
    for (const name of names) {
      const info = await FS.getInfoAsync(`${dir()}${name}`)
      if (info.exists && 'size' in info && typeof info.size === 'number') total += info.size
    }
    return total
  }
}
