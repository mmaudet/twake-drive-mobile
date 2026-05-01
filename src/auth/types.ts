export interface TwakeConfiguration {
  'twake-pass-login-uri'?: string
  'twake-flagship-login-uri'?: string
}

export interface OidcCallback {
  fqdn: string
  registerToken: string
  code?: string | null
}

export interface Session {
  uri: string
  accessToken: string
  refreshToken: string
}

export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled OIDC flow')
    this.name = 'UserCancelledError'
  }
}

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryError'
  }
}
