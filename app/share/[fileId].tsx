import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Button,
  Divider,
  IconButton,
  SegmentedButtons,
  Snackbar,
  Switch,
  Text,
  TextInput,
  useTheme
} from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'
import * as Clipboard from 'expo-clipboard'

import { useFlag } from '@/client/useFlag'
import {
  ContactQueryResult,
  reachableContactsQuery,
  reachableContactsQueryAs,
  fileByIdQuery,
  fileByIdQueryAs,
  FileQueryResult
} from '@/client/queries'
import { filterContactSuggestions } from '@/files/contactSuggestions'
import {
  LinkEditingRights,
  SharingMember,
  absoluteMemberIndex,
  addRecipient,
  buildPublicLinkUrl,
  createPublicLink,
  createSharingForFile,
  getLinkEditingRights,
  getRecipients,
  revokePublicLink,
  revokeRecipientAtIndex
} from '@/files/sharing'
import { useFileSharing, useRefreshSharings } from '@/sharing/SharingProvider'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FileThumbnail } from '@/ui/FileThumbnail'

interface ShareSheetFile {
  _id: string
  name: string
  type?: 'file' | 'directory'
  mime?: string
  class?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

const truncateMiddle = (s: string, max = 56): string => {
  if (s.length <= max) return s
  const head = Math.ceil((max - 3) / 2)
  const tail = Math.floor((max - 3) / 2)
  return `${s.slice(0, head)}...${s.slice(-tail)}`
}

export default function ShareRoute() {
  const router = useRouter()
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  const refreshSharings = useRefreshSharings()
  const isOnline = useIsOnline()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()

  // Flags mirrored from twake-drive web's ShareFileView / ShareDisplayedFolderView:
  // - sharing.generate-link-button.enabled gates the public link toggle. The web
  //   default is "visible": cozy-sharing's modal only HIDES the button when the
  //   flag is explicitly false. We mirror that — null/undefined/true → show,
  //   false → hide.
  // - sharing.auto-open-settings.enabled is a no-op here for now since the mobile
  //   sheet doesn't have an "advanced settings" panel; recorded for parity.
  const generateLinkFlag = useFlag('sharing.generate-link-button.enabled')
  const generateLinkEnabled = generateLinkFlag !== false
  // TODO: when an advanced-settings panel is added, gate it on this flag too.
  // const autoOpenSettingsEnabled = !!useFlag('sharing.auto-open-settings.enabled')

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const lookupData = fileLookup.data
  const fileFromQuery = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as
    | FileQueryResult
    | null
    | undefined
  const file: ShareSheetFile | null = fileFromQuery
    ? {
        _id: fileFromQuery._id,
        name: fileFromQuery.name,
        type: fileFromQuery.type,
        mime: fileFromQuery.mime,
        class: fileFromQuery.class,
        links: fileFromQuery.links
      }
    : null

  const [mutating, setMutating] = useState(false)
  const [linkMutating, setLinkMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snack, setSnack] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [readOnlyInput, setReadOnlyInput] = useState(true)
  // Editor/Viewer choice for the public link. Mirrors twake-drive web's
  // ShareRestrictionModal/BoxEditingRights. Defaults to readOnly to match the
  // web default; kept in sync with `linkPermission` via the effect below so
  // re-opening the sheet on a file with an existing editor link reflects it.
  const [editingRights, setEditingRights] = useState<LinkEditingRights>('readOnly')

  // Read sharing + link from the global SharingProvider — no local fetch.
  // The provider has already fetched both once at drive layout mount, and
  // refreshSharings() invalidates it after each mutation here.
  const { loaded: contextLoaded, entry } = useFileSharing(file?._id)
  const sharing = entry?.sharing ?? null
  const linkPermission = entry?.linkPermission ?? null
  // Only the very first session-open before the provider has resolved should
  // show a placeholder. Subsequent opens hit the warm context and are instant.
  const initialLoading = !contextLoaded && !entry

  const stackUri = client?.getStackClient()?.uri as string | undefined
  const linkUrl = linkPermission && stackUri ? buildPublicLinkUrl(stackUri, linkPermission) : null

  // Re-sync the segmented control whenever the loaded permission changes:
  // - opening the sheet on a fresh file → resets to 'readOnly'
  // - opening on a file that already has an editor link → starts at 'write'
  // - after a successful swap (revoke+recreate) refreshSharings updates
  //   linkPermission, which lands us back here in the matching state
  useEffect(() => {
    setEditingRights(getLinkEditingRights(linkPermission))
  }, [linkPermission])

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back()
  }, [router])

  const onToggleLink = async (next: boolean): Promise<void> => {
    if (!requireOnline(isOnline, setSnack, t)) return
    if (!client || !file || linkMutating) return
    setLinkMutating(true)
    setMutating(true)
    setError(null)
    try {
      if (next) {
        await createPublicLink(client, file, editingRights)
      } else {
        await revokePublicLink(client, file)
      }
      await refreshSharings()
    } catch (e) {
      console.error('[ShareRoute] toggle link failed', e)
      setError(t('drive.share.errorMutate'))
    } finally {
      setLinkMutating(false)
      setMutating(false)
    }
  }

  const onChangeEditingRights = async (next: LinkEditingRights): Promise<void> => {
    if (next === editingRights) return
    // Always echo the local state immediately so the segmented control feels
    // responsive even when the link doesn't yet exist.
    setEditingRights(next)
    if (!requireOnline(isOnline, setSnack, t)) return
    if (!linkPermission || !client || !file) return // local-only change before link exists
    if (linkMutating) return
    // Existing link: swap rights via revoke + recreate. This changes the
    // public URL — the simplest correct path until cozy-stack exposes a way
    // to mutate `attributes.permissions[*].verbs` in place.
    // TODO: replace with PermissionCollection.add/destroy verbs once available
    //       to avoid invalidating the existing sharecode.
    setLinkMutating(true)
    setMutating(true)
    setError(null)
    try {
      await revokePublicLink(client, file)
      await createPublicLink(client, file, next)
      await refreshSharings()
    } catch (e) {
      console.error('[ShareRoute] swap link rights failed', e)
      setError(t('drive.share.errorMutate'))
      // Revert the local state since the swap failed; the effect on
      // linkPermission will re-confirm but doing it here avoids a flash.
      setEditingRights(getLinkEditingRights(linkPermission))
    } finally {
      setLinkMutating(false)
      setMutating(false)
    }
  }

  const onCopyLink = async (): Promise<void> => {
    if (!linkUrl) return
    try {
      await Clipboard.setStringAsync(linkUrl)
      setSnack(t('drive.share.linkCopied'))
    } catch (e) {
      console.error('[ShareRoute] copy failed', e)
      setError(t('drive.share.errorMutate'))
    }
  }

  const onSubmitRecipient = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnack, t)) return
    const email = emailInput.trim()
    if (!client || !file || !email || mutating) return
    setMutating(true)
    setError(null)
    try {
      if (sharing) {
        await addRecipient(client, sharing, email, readOnlyInput)
      } else {
        await createSharingForFile(client, file, email, readOnlyInput)
      }
      setEmailInput('')
      setShowAddForm(false)
      await refreshSharings()
    } catch (e) {
      console.error('[ShareRoute] add recipient failed', e)
      setError(t('drive.share.errorMutate'))
    } finally {
      setMutating(false)
    }
  }

  const onRemoveRecipient = async (recipientIndex: number): Promise<void> => {
    if (!requireOnline(isOnline, setSnack, t)) return
    if (!client || !file || !sharing || mutating) return
    const memberIndex = absoluteMemberIndex(sharing, recipientIndex)
    if (memberIndex < 0) return
    setMutating(true)
    setError(null)
    try {
      await revokeRecipientAtIndex(client, sharing, memberIndex)
      await refreshSharings()
    } catch (e) {
      console.error('[ShareRoute] revoke recipient failed', e)
      setError(t('drive.share.errorMutate'))
    } finally {
      setMutating(false)
    }
  }

  const recipients = getRecipients(sharing)

  // Contact autocomplete: only fetch when the add form is visible. Mirrors
  // cozy-sharing's web ShareAutosuggest — client-side filtering of the
  // reachable contacts collection.
  const contactsQuery = useQuery(reachableContactsQuery(), {
    as: reachableContactsQueryAs,
    enabled: showAddForm
  })
  const contacts = useMemo(
    () => (contactsQuery.data as ContactQueryResult[] | null | undefined) ?? [],
    [contactsQuery.data]
  )
  const excludeEmails = useMemo(
    () => recipients.map(r => r.email).filter((e): e is string => !!e),
    [recipients]
  )
  const suggestions = useMemo(
    () => filterContactSuggestions(contacts, emailInput, excludeEmails),
    [contacts, emailInput, excludeEmails]
  )

  const statusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
      case 'mail-not-sent':
      case 'seen':
        return t('drive.share.statusPending')
      case 'ready':
        return t('drive.share.statusReady')
      case 'revoked':
        return t('drive.share.statusRevoked')
      default:
        return status
    }
  }

  if (fileLookup.fetchStatus === 'loading' && !file) {
    return (
      <ScreenContainer safeTop>
        <LoadingState />
      </ScreenContainer>
    )
  }
  if (!file) {
    return (
      <ScreenContainer safeTop>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={() => fileLookup.fetch()} />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer safeTop>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <FileThumbnail file={file} size={64} />
          <Text variant="titleMedium" style={styles.name} numberOfLines={2}>
            {file.name}
          </Text>
        </View>
        <Divider />

        {initialLoading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator animating />
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
            <Button mode="text" onPress={() => refreshSharings()}>
              {t('common.retry')}
            </Button>
          </View>
        ) : null}

        {/* Public link section — gated by sharing.generate-link-button.enabled */}
        {generateLinkEnabled ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text variant="titleSmall">{t('drive.share.linkTitle')}</Text>
                <View style={styles.linkSwitchSlot}>
                  {linkMutating ? (
                    <ActivityIndicator animating />
                  ) : (
                    <Switch
                      value={linkPermission !== null}
                      onValueChange={onToggleLink}
                      disabled={initialLoading}
                    />
                  )}
                </View>
              </View>
              <View style={styles.editingRightsRow}>
                <SegmentedButtons
                  value={editingRights}
                  onValueChange={v => void onChangeEditingRights(v as LinkEditingRights)}
                  density="small"
                  buttons={[
                    {
                      value: 'readOnly',
                      label: t('drive.share.linkRightsReader'),
                      icon: 'eye-outline',
                      disabled: linkMutating || initialLoading,
                      accessibilityLabel: t('drive.share.linkRightsReader')
                    },
                    {
                      value: 'write',
                      label: t('drive.share.linkRightsEditor'),
                      icon: 'pencil-outline',
                      disabled: linkMutating || initialLoading,
                      accessibilityLabel: t('drive.share.linkRightsEditor')
                    }
                  ]}
                />
              </View>
              {linkPermission ? (
                <>
                  <Text variant="bodySmall" style={styles.sectionHint}>
                    {t('drive.share.linkOn')}
                  </Text>
                  <View style={styles.linkRow}>
                    <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
                      {linkUrl ? truncateMiddle(linkUrl) : ''}
                    </Text>
                    <IconButton
                      icon="content-copy"
                      onPress={() => void onCopyLink()}
                      disabled={!linkUrl}
                      accessibilityLabel={t('drive.share.linkCopy')}
                    />
                  </View>
                </>
              ) : null}
            </View>

            <Divider />
          </>
        ) : null}

        {/* Recipients section */}
        <View style={styles.section}>
          <Text variant="titleSmall">{t('drive.share.recipientsTitle')}</Text>
          {recipients.length === 0 ? (
            <Text variant="bodySmall" style={styles.sectionHint}>
              —
            </Text>
          ) : (
            recipients.map((m, idx) => (
              <RecipientRow
                key={`${m.email ?? m.name ?? 'r'}-${idx}`}
                member={m}
                statusLabel={statusLabel(m.status)}
                disabled={mutating}
                onRemove={() => void onRemoveRecipient(idx)}
              />
            ))
          )}

          {showAddForm ? (
            <View style={styles.addForm}>
              <TextInput
                mode="outlined"
                label={t('drive.share.emailPlaceholder')}
                value={emailInput}
                onChangeText={setEmailInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.emailInput}
              />
              {contactsQuery.fetchStatus === 'loading' && contacts.length === 0 ? (
                <Text variant="bodySmall" style={styles.suggestionsHint}>
                  {t('drive.share.suggestionsLoading')}
                </Text>
              ) : null}
              {suggestions.length > 0 ? (
                <View style={[styles.suggestionsBox, { borderColor: theme.colors.outlineVariant }]}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={styles.suggestionsScroll}
                  >
                    {suggestions.map(s => (
                      <Pressable
                        key={s._id}
                        onPress={() => setEmailInput(s.email)}
                        style={({ pressed }) => [
                          styles.suggestionRow,
                          pressed && {
                            backgroundColor: theme.colors.surfaceVariant
                          }
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.displayName} ${s.email}`}
                      >
                        <View
                          style={[
                            styles.suggestionAvatar,
                            { backgroundColor: theme.colors.primaryContainer }
                          ]}
                        >
                          <Text
                            style={[
                              styles.suggestionInitial,
                              { color: theme.colors.onPrimaryContainer }
                            ]}
                          >
                            {s.displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.suggestionText}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {s.displayName}
                          </Text>
                          <Text
                            variant="bodySmall"
                            numberOfLines={1}
                            style={styles.suggestionEmail}
                          >
                            {s.email}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <View style={styles.readOnlyRow}>
                <Text>{t('drive.share.readOnly')}</Text>
                <Switch
                  value={readOnlyInput}
                  onValueChange={setReadOnlyInput}
                  disabled={mutating}
                />
              </View>
              <View style={styles.addButtons}>
                <Button
                  mode="text"
                  onPress={() => {
                    setShowAddForm(false)
                    setEmailInput('')
                  }}
                  disabled={mutating}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  mode="contained"
                  onPress={() => void onSubmitRecipient()}
                  loading={mutating}
                  disabled={mutating || !emailInput.trim()}
                >
                  {t('drive.share.send')}
                </Button>
              </View>
            </View>
          ) : (
            <Button
              mode="outlined"
              icon="account-plus"
              onPress={() => setShowAddForm(true)}
              style={styles.addButton}
              disabled={initialLoading}
            >
              {t('drive.share.addRecipient')}
            </Button>
          )}
        </View>

        <View style={styles.footer}>
          <Button mode="outlined" onPress={close}>
            {t('common.close')}
          </Button>
        </View>
      </ScrollView>
      <Snackbar
        visible={snack !== null}
        onDismiss={() => setSnack(null)}
        duration={2500}
        style={styles.snackbar}
      >
        {snack ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

interface RecipientRowProps {
  member: SharingMember
  statusLabel: string
  disabled: boolean
  onRemove: () => void
}

const RecipientRow = ({ member, statusLabel, disabled, onRemove }: RecipientRowProps) => {
  const { t } = useTranslation()
  const label = member.name ?? member.public_name ?? member.email ?? '—'
  return (
    <View style={styles.recipientRow}>
      <View style={styles.recipientText}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.recipientStatus}>
          {statusLabel}
          {member.read_only ? ' · ☓' : ''}
        </Text>
      </View>
      <IconButton
        icon="delete"
        onPress={onRemove}
        disabled={disabled}
        accessibilityLabel={t('a11y.removeRecipient')}
        testID="remove-recipient"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  name: { textAlign: 'center' },
  section: { paddingVertical: 12, gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionHint: { opacity: 0.7 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Slot keeps a fixed width matching Paper's Switch so swapping in the
  // spinner during a mutation doesn't shift the title left.
  linkSwitchSlot: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  linkText: { flex: 1 },
  editingRightsRow: { paddingTop: 4 },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  recipientText: { flex: 1, paddingRight: 8 },
  recipientStatus: { opacity: 0.6 },
  addForm: { gap: 8, paddingTop: 8 },
  emailInput: {},
  suggestionsHint: { opacity: 0.7 },
  suggestionsBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden'
  },
  suggestionsScroll: { maxHeight: 200 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12
  },
  suggestionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  suggestionInitial: { fontWeight: '600' },
  suggestionText: { flex: 1 },
  suggestionEmail: { opacity: 0.7 },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  addButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  addButton: { marginTop: 8 },
  loaderRow: { paddingVertical: 12, alignItems: 'center' },
  errorBox: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  errorText: { textAlign: 'center' },
  footer: { marginTop: 16 },
  snackbar: { marginBottom: 16 }
})
