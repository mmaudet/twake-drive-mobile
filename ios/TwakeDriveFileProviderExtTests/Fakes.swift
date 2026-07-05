import Foundation

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// SessionTests.swift/KeychainSessionStoreTests.swift/CozyFileTests.swift (Tasks 3/4/5): this
// test target has zero PBXTargetDependency on the TwakeDriveFileProviderExt app-extension
// target, so that import fails with "no such module" regardless of whether SessionStoring /
// HTTPClient exist. SessionStoring, Session, OAuthOptions, OAuthToken, HTTPClient, and
// CozyError all reach this test target via scripts/ios-add-file-provider-tests.cjs's
// SHARED_SOURCES mechanism: compiled directly into this target's own Sources build phase, so
// they're plain types in this target's own module — no import needed, same as any other file
// in this target. Reused by TokenProviderTests (Task 6) and Tasks 7/8's CozyFilesApi tests.

final class FakeSessionStore: SessionStoring {
  var current: Session?
  private(set) var saved: [Session] = []
  init(_ s: Session?) { current = s }
  func load() throws -> Session? { current }
  func save(_ session: Session) throws { current = session; saved.append(session) }
}

final class FakeHTTPClient: HTTPClient {
  /// Per-request canned responses; also counts calls for single-flight assertions.
  var handler: (URLRequest) async throws -> (Data, HTTPURLResponse)
  private(set) var callCount = 0
  private let lock = NSLock()
  init(_ handler: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse)) { self.handler = handler }
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    lock.lock(); callCount += 1; lock.unlock()
    return try await handler(request)
  }
}

func makeSession(access: String = "at-old", refresh: String = "rt-old") -> Session {
  Session(
    uri: "https://alice.twake.app",
    oauthOptions: OAuthOptions(clientID: "c", clientSecret: "s", clientName: "n", softwareID: "sw",
                               redirectURI: "r", clientKind: "mobile", clientURI: "u", scopes: ["*"],
                               registrationAccessToken: nil),
    token: OAuthToken(accessToken: access, refreshToken: refresh, tokenType: "bearer", scope: "*"))
}

func httpResponse(_ url: URL, _ status: Int, _ json: String) -> (Data, HTTPURLResponse) {
  (Data(json.utf8), HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!)
}
