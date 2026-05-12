# Offline blob cache

Pin files / folders for guaranteed offline access. Blobs are stored under
`documentDirectory/offline/{fileId}`. The MMKV-backed `OfflineFilesStore`
indexes pins; the `Downloader` queue handles fetches with backoff and
network gating; the `pinReactor` listens on the local PouchDB changes
feed and re-downloads on `md5sum` change. See
`docs/superpowers/specs/2026-05-12-offline-blob-cache-design.md` for the
design rationale.
