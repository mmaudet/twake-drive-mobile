import type { TFunction } from 'i18next'

/**
 * Raised when the OS reports that no installed application can handle a file's
 * MIME type. On Android `react-native-file-viewer` rejects with the literal
 * message "No app associated with this mime type"; on iOS the viewer silently
 * no-ops instead. This is a normal user condition (they simply don't have a
 * compatible app), NOT a crash — surface it as a friendly message rather than
 * red-boxing it in dev / swallowing it in prod.
 */
export class NoCompatibleAppError extends Error {
  constructor() {
    super('No installed app can open this file type')
    this.name = 'NoCompatibleAppError'
  }
}

/** Maps an "open file" failure to a user-facing i18n key. */
export const openErrorMessageKey = (e: unknown): string =>
  e instanceof NoCompatibleAppError ? 'drive.open.noApp' : 'drive.preview.loadFailed'

/**
 * Standard handling when opening a file from a list row fails. Logs unexpected
 * errors (but not the expected {@link NoCompatibleAppError}, which would
 * otherwise show a red LogBox in dev), then surfaces a translated message via
 * the caller's snackbar setter.
 */
export const surfaceOpenError = (
  e: unknown,
  onMessage: (message: string) => void,
  t: TFunction,
  tag: string
): void => {
  if (!(e instanceof NoCompatibleAppError)) {
    console.error(`[${tag}] openFileFromList failed`, e)
  }
  onMessage(t(openErrorMessageKey(e)))
}
