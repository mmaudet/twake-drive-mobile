import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

// Doctype constants used throughout this module.
const FILES_DOCTYPE = 'io.cozy.files'
const SHARINGS_DOCTYPE = 'io.cozy.sharings'
const PERMISSIONS_DOCTYPE = 'io.cozy.permissions'
const CONTACTS_DOCTYPE = 'io.cozy.contacts'

// Verb sets for public links. Mirrors twake-drive web's
// `packages/cozy-sharing/src/components/ShareRestrictionModal/helpers.js`:
// readers get GET only, editors get GET/POST/PUT/PATCH (DELETE is intentionally
// excluded — same shape as the web ShareRestrictionModal/BoxEditingRights).
export const READ_ONLY_PERMS = ['GET'] as const
export const WRITE_PERMS = ['GET', 'POST', 'PUT', 'PATCH'] as const

export type LinkEditingRights = 'readOnly' | 'write'

// Sharing rule from `io.cozy.sharings`. The Cozy stack normalizer flattens
// `attributes` to the top level of the doc, so callers may see fields in
// either place — we read from `attributes` defensively.
export interface SharingRule {
  values?: string[]
  doctype?: string
  title?: string
}

export interface SharingMember {
  status: 'owner' | 'pending' | 'ready' | 'revoked' | 'mail-not-sent' | 'seen' | string
  email?: string
  name?: string
  read_only?: boolean
  instance?: string
  public_name?: string
}

export interface SharingDoc {
  _id: string
  attributes?: {
    rules?: SharingRule[]
    members?: SharingMember[]
    active?: boolean
    owner?: boolean
    description?: string
  }
  // Sometimes the normalizer flattens these to top-level too.
  rules?: SharingRule[]
  members?: SharingMember[]
  owner?: boolean
}

export interface PublicLinkPermission {
  _id: string
  id?: string
  attributes?: {
    codes?: Record<string, string>
    shortcodes?: Record<string, string>
    permissions?: Record<string, { type?: string; values?: string[]; verbs?: string[] }>
  }
  // Normalizer also flattens these to top-level.
  codes?: Record<string, string>
  shortcodes?: Record<string, string>
  permissions?: Record<string, { type?: string; values?: string[]; verbs?: string[] }>
}

interface SharingsCollectionApi {
  findByDoctype: (doctype: string) => Promise<{ data: SharingDoc[] }>
  get: (id: string) => Promise<{ data: SharingDoc }>
  create: (params: {
    document: { _id: string; _type: string; name?: string }
    description?: string
    recipients?: { _id: string; _type: string }[]
    readOnlyRecipients?: { _id: string; _type: string }[]
    openSharing?: boolean
  }) => Promise<{ data: SharingDoc }>
  addRecipients: (params: {
    document: { _id: string }
    recipients?: { _id: string; _type: string }[]
    readOnlyRecipients?: { _id: string; _type: string }[]
  }) => Promise<{ data: SharingDoc }>
  revokeRecipient: (sharing: { _id: string }, index: number) => Promise<unknown>
  revokeSelf: (sharing: { _id: string }) => Promise<unknown>
  revokeAllRecipients: (sharing: { _id: string }) => Promise<unknown>
}

interface PermissionsCollectionApi {
  findLinksByDoctype: (doctype: string) => Promise<{ data: PublicLinkPermission[] }>
  createSharingLink: (
    document: { _id: string; _type: string },
    options?: { ttl?: string; password?: string; verbs?: string[]; tiny?: boolean }
  ) => Promise<{ data: PublicLinkPermission }>
  revokeSharingLink: (document: { _id: string; _type: string }) => Promise<unknown>
  fetchAllLinks: (document: {
    _id: string
    _type: string
  }) => Promise<{ data: PublicLinkPermission[] }>
}

interface ContactDoc {
  _id: string
  _type: string
  email?: { address: string; primary?: boolean }[]
}

interface ContactsCollectionApi {
  create: (doc: Partial<ContactDoc> & Record<string, unknown>) => Promise<{ data: ContactDoc }>
}

const getSharings = (client: CozyClient): SharingsCollectionApi =>
  client.collection(SHARINGS_DOCTYPE) as unknown as SharingsCollectionApi

const getPermissions = (client: CozyClient): PermissionsCollectionApi =>
  client.collection(PERMISSIONS_DOCTYPE) as unknown as PermissionsCollectionApi

const getContacts = (client: CozyClient): ContactsCollectionApi =>
  client.collection(CONTACTS_DOCTYPE) as unknown as ContactsCollectionApi

const sharingRules = (sharing: SharingDoc): SharingRule[] =>
  sharing.attributes?.rules ?? sharing.rules ?? []

const sharingMembers = (sharing: SharingDoc): SharingMember[] =>
  sharing.attributes?.members ?? sharing.members ?? []

const sharingOwnerFlag = (sharing: SharingDoc): boolean | undefined =>
  sharing.attributes?.owner ?? sharing.owner

const linkPermissionsMap = (
  permission: PublicLinkPermission
): Record<string, { type?: string; values?: string[]; verbs?: string[] }> =>
  permission.attributes?.permissions ?? permission.permissions ?? {}

const linkCodesMap = (permission: PublicLinkPermission): Record<string, string> =>
  permission.attributes?.codes ?? permission.codes ?? {}

const linkShortcodesMap = (permission: PublicLinkPermission): Record<string, string> =>
  permission.attributes?.shortcodes ?? permission.shortcodes ?? {}

const filesContains = (sharing: SharingDoc, fileId: string): boolean => {
  const rules = sharingRules(sharing)
  return rules.some(
    rule =>
      (rule.doctype === FILES_DOCTYPE || !rule.doctype) && (rule.values ?? []).includes(fileId)
  )
}

const linkContainsFile = (perm: PublicLinkPermission, fileId: string): boolean => {
  const perms = linkPermissionsMap(perm)
  return Object.values(perms).some(p => (p.values ?? []).includes(fileId))
}

/**
 * Find the sharing that includes a given file/folder for the current user.
 * Prefers a sharing where the user is the owner.
 */
export const findSharingForFile = async (
  client: CozyClient,
  fileId: string
): Promise<SharingDoc | null> => {
  const resp = await getSharings(client).findByDoctype(FILES_DOCTYPE)
  const list = resp?.data ?? []
  const matching = list.filter(s => filesContains(s, fileId))
  if (matching.length === 0) return null
  const owned = matching.find(s => sharingOwnerFlag(s) === true)
  return owned ?? matching[0]
}

/**
 * Find the public link (io.cozy.permissions) that grants access to a file.
 */
export const findPublicLinkForFile = async (
  client: CozyClient,
  fileId: string
): Promise<PublicLinkPermission | null> => {
  const resp = await getPermissions(client).findLinksByDoctype(FILES_DOCTYPE)
  const list = resp?.data ?? []
  return list.find(p => linkContainsFile(p, fileId)) ?? null
}

/**
 * Build the public URL the recipient must visit for a public link.
 *
 * Mirrors the cozy-drive web pattern: the drive web app at
 * `<instance>-drive.<domain>/public?sharecode=<code>&id=<perm-id>`.
 *
 * Returns null if the permission has no usable code or the stack URI is
 * malformed.
 */
export const buildPublicLinkUrl = (
  stackUri: string,
  permission: PublicLinkPermission
): string | null => {
  // Mirror cozy-sharing's getShortcode() lookup order so we pick the same
  // value the web modal would: prefer shortcodes.email > shortcodes.code,
  // then fall back to codes.email > codes.code. The "email" key dates back
  // to share-by-link, the "code" key is what cozy-client uses by default.
  const shortcodes = linkShortcodesMap(permission)
  const codes = linkCodesMap(permission)
  const code = shortcodes.email ?? shortcodes.code ?? codes.email ?? codes.code ?? null
  if (!code) return null
  let url: URL
  try {
    url = new URL(stackUri)
  } catch {
    return null
  }
  const [instance, ...rest] = url.host.split('.')
  if (!instance || rest.length === 0) return null
  return `${url.protocol}//${instance}-drive.${rest.join('.')}/public?sharecode=${encodeURIComponent(code)}`
}

/**
 * Create a public link for a file or folder.
 *
 * `editingRights` controls the verb set granted by the link permission. The
 * default mirrors cozy-sharing web (`'readOnly'`) — callers that want an
 * editor link must opt in.
 */
export const createPublicLink = async (
  client: CozyClient,
  file: { _id: string; type?: 'file' | 'directory' },
  editingRights: LinkEditingRights = 'readOnly'
): Promise<PublicLinkPermission> => {
  const document = { _id: file._id, _type: FILES_DOCTYPE, type: file.type }
  const verbs = editingRights === 'write' ? [...WRITE_PERMS] : [...READ_ONLY_PERMS]
  // tiny: true asks the cozy-stack to also generate a shortcode alongside the
  // long sharecode. buildPublicLinkUrl prefers the shortcode when available.
  const result = await getPermissions(client).createSharingLink(document, {
    tiny: true,
    verbs
  })
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
  return result.data
}

/**
 * Derive the current editing rights from an existing public link permission.
 *
 * Mirrors cozy-sharing's `getSharingType`/`isReadOnly` heuristic: any verb
 * other than `'GET'` (POST/PUT/PATCH/DELETE/ALL) → editor; otherwise reader.
 * Missing permission, missing entries, or empty verb arrays default to
 * `'readOnly'` so we don't accidentally surface "Editor" for a half-loaded
 * permission doc.
 */
export const getLinkEditingRights = (
  permission: PublicLinkPermission | null | undefined
): LinkEditingRights => {
  if (!permission) return 'readOnly'
  const perms = permission.attributes?.permissions ?? permission.permissions ?? {}
  for (const entry of Object.values(perms)) {
    const verbs = entry.verbs ?? []
    if (verbs.some(v => v !== 'GET')) return 'write'
  }
  return 'readOnly'
}

/**
 * Revoke a public link for a file or folder.
 */
export const revokePublicLink = async (
  client: CozyClient,
  file: { _id: string; type?: 'file' | 'directory' }
): Promise<void> => {
  const document = { _id: file._id, _type: FILES_DOCTYPE, type: file.type }
  await getPermissions(client).revokeSharingLink(document)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Recipients of a sharing, owner excluded.
 */
export const getRecipients = (sharing: SharingDoc | null): SharingMember[] => {
  if (!sharing) return []
  return sharingMembers(sharing).filter(m => m.status !== 'owner')
}

/**
 * Create or fetch a contact-shaped object referencing an email.
 *
 * The cozy-stack-client's `addRecipients` and `create` only forward
 * `{ id, type }` (the `_id`/`_type`) of each recipient: it does NOT pass
 * the email through. Real-world usage therefore requires a contact doc
 * (io.cozy.contacts) with that email. We create a minimal one here. This
 * mirrors what cozy-sharing's web modal does internally.
 *
 * TODO: try to find an existing contact by email first to avoid creating
 *  duplicates. Doing so requires an index on `email.address` which the
 *  app does not currently configure.
 */
const createContactForEmail = async (
  client: CozyClient,
  email: string
): Promise<{ _id: string; _type: string }> => {
  const resp = await getContacts(client).create({
    email: [{ address: email, primary: true }]
  })
  const data = resp.data
  return { _id: data._id, _type: CONTACTS_DOCTYPE }
}

/**
 * Add a recipient (by email) to an existing sharing.
 */
export const addRecipient = async (
  client: CozyClient,
  sharing: SharingDoc,
  email: string,
  readOnly: boolean
): Promise<void> => {
  const recipient = await createContactForEmail(client, email)
  const args: Parameters<SharingsCollectionApi['addRecipients']>[0] = {
    document: { _id: sharing._id },
    recipients: readOnly ? [] : [recipient],
    readOnlyRecipients: readOnly ? [recipient] : []
  }
  await getSharings(client).addRecipients(args)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Revoke one recipient from a sharing by their index in the members array.
 *
 * Note: `members` includes the owner at index 0, so callers must pass the
 * absolute index (NOT a filtered-list index). `getRecipients` filters owners
 * out for display — translate back before calling this.
 */
export const revokeRecipientAtIndex = async (
  client: CozyClient,
  sharing: SharingDoc,
  index: number
): Promise<void> => {
  await getSharings(client).revokeRecipient({ _id: sharing._id }, index)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Compute the absolute index in `members` for a recipient given its position
 * in the recipients-only array (what the UI displays).
 */
export const absoluteMemberIndex = (sharing: SharingDoc, recipientIndex: number): number => {
  const members = sharingMembers(sharing)
  let seen = -1
  for (let i = 0; i < members.length; i++) {
    if (members[i].status !== 'owner') {
      seen += 1
      if (seen === recipientIndex) return i
    }
  }
  return -1
}

/**
 * Create a new sharing for a file or folder with one initial recipient.
 */
export const createSharingForFile = async (
  client: CozyClient,
  file: { _id: string; type?: 'file' | 'directory'; name?: string },
  email: string,
  readOnly: boolean
): Promise<SharingDoc> => {
  const recipient = await createContactForEmail(client, email)
  const document = {
    _id: file._id,
    _type: FILES_DOCTYPE,
    name: file.name,
    type: file.type
  }
  const args: Parameters<SharingsCollectionApi['create']>[0] = {
    document,
    description: file.name ?? 'Shared',
    recipients: readOnly ? [] : [recipient],
    readOnlyRecipients: readOnly ? [recipient] : []
  }
  const resp = await getSharings(client).create(args)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
  return resp.data
}
