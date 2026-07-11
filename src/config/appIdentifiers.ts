// App-identifier constants shared across the JS layer. The native side (iOS
// entitlements, Swift/Kotlin) mirrors these — keep them in sync.

export const APPLE_TEAM_ID = 'KUT463DS29'

// Team-prefixed shared iOS Keychain access group the app and its native
// extensions read the cozy session from.
export const SHARED_KEYCHAIN_ACCESS_GROUP = `${APPLE_TEAM_ID}.com.linagora.twakedrive.shared`

// Dedicated URL scheme the iOS Share Extension redirects to; the OAuth flow
// uses the reserved "cozy" scheme (scheme[0]) instead.
export const SHARE_SCHEME = 'twakedrive'
