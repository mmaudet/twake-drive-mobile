/**
 * OAuth scopes requested by Twake Drive Mobile.
 *
 * We deliberately do NOT ask for `*` (full access). Each entry below maps to
 * a feature the mobile app actually consumes — when a new feature touches a
 * new doctype, extend this list.
 *
 * Format reference (cozy-stack permissions):
 *   "<doctype>"                                   ALL verbs on the doctype
 *   "<doctype>:<verbs>"                           verbs = comma-separated
 *                                                 HTTP methods (GET, POST,
 *                                                 PUT, PATCH, DELETE) or ALL
 *   "<doctype>:<verbs>:<selector>:<values>"       restrict by attribute
 *
 * Compared with twake-drive-web's manifest.webapp, the mobile subset omits
 * permissions tied to features not yet on mobile: io.cozy.photos.albums,
 * io.cozy.konnectors, io.cozy.accounts, io.cozy.jobs, io.cozy.triggers,
 * io.cozy.ai.chat.*, cc.cozycloud.dacc_v2, eu.mycozy.dacc_v2,
 * cc.cozycloud.errors. Add them when the corresponding mobile feature
 * lands.
 */
export const APP_SCOPES: readonly string[] = [
  // Core file system: list, read, move, rename, delete, upload — all verbs.
  'io.cozy.files',
  // Files sub-doctypes (versions, qualifications). cozy-client touches these
  // when reading file history or applying labels.
  'io.cozy.files.*',
  // Cozy bar fetches the installed apps list (icons, badges).
  'io.cozy.apps:GET',
  // Share sheet: read existing sharings + create/revoke (needs all verbs).
  'io.cozy.sharings',
  // Contact autocomplete in the share sheet.
  'io.cozy.contacts:GET',
  'io.cozy.contacts.groups:GET',
  // Cozy bar reads instance settings (locale, public name, etc.).
  'io.cozy.settings:GET',
  // OAuth client revocation listener (checks whether our own client is still
  // active; if revoked from web, we sign the user out).
  'io.cozy.oauth.clients:GET',
  // Drive-specific settings (e.g. offline storage quota, feature flags
  // scoped to the drive app).
  'io.cozy.drive.settings'
] as const

/**
 * Space-separated form for endpoints (e.g. /oidc/access_token) that expect a
 * single string rather than an array.
 */
export const APP_SCOPE_STRING: string = APP_SCOPES.join(' ')

/** Scope requested during flagship certification: full access so the stack
 *  grants the `flagship` flag and session_code requests succeed. */
export const FLAGSHIP_SCOPES: readonly string[] = ['*'] as const
