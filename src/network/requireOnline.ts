import type { TFunction } from 'i18next'

/**
 * Guard for mutation entry points. Call at the top of every UI handler that
 * triggers a write to the stack. Returns `false` and surfaces a snackbar when
 * the device is offline; the caller should `return` immediately on `false`.
 *
 * There is intentionally NO offline queue — mutations are blocked outright,
 * per the project's "no queue" rule (see plan Amendments).
 */
export const requireOnline = (
  isOnline: boolean,
  onOffline: (message: string) => void,
  t: TFunction
): boolean => {
  if (isOnline) return true
  onOffline(t('drive.offline.requiresOnline'))
  return false
}
