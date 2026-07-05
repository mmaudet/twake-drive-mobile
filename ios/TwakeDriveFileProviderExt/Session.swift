import Foundation

struct OAuthOptions: Codable, Equatable {
  let clientID: String
  let clientSecret: String
  let clientName: String
  let softwareID: String
  let redirectURI: String
  let clientKind: String
  let clientURI: String
  let scopes: [String]
  let registrationAccessToken: String?
}

struct OAuthToken: Codable, Equatable {
  var accessToken: String
  var refreshToken: String
  let tokenType: String
  let scope: String
}

struct Session: Codable, Equatable {
  let uri: String
  let oauthOptions: OAuthOptions
  var token: OAuthToken

  /// cozy-stack base URL: `uri` without a trailing slash (mirrors SessionStore.baseUri()).
  var baseURL: String {
    uri.hasSuffix("/") ? String(uri.dropLast()) : uri
  }
}
