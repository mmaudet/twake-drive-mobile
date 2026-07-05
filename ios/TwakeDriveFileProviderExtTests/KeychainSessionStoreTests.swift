import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// SessionTests.swift (Task 3): this test target has zero PBXTargetDependency on the
// TwakeDriveFileProviderExt app-extension target, so that import fails with "no such
// module" regardless of whether KeychainSessionStore.swift exists. KeychainAccess,
// KeychainSessionStore, and Session all reach this test target via
// scripts/ios-add-file-provider-tests.cjs's SHARED_SOURCES mechanism: compiled directly
// into this target's own Sources build phase, so they're plain types in this target's
// own module — no import needed, same as any other file in this target.

private final class FakeKeychain: KeychainAccess {
  var store: [String: Data] = [:]     // key = service
  private(set) var lastWriteService: String?
  private(set) var lastAccessGroup: String?
  private(set) var lastAccount: Data?
  func read(service: String, account: Data, accessGroup: String) -> Data? {
    lastAccessGroup = accessGroup; lastAccount = account
    return store[service]
  }
  func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool {
    lastWriteService = service; lastAccessGroup = accessGroup; lastAccount = account
    store[service] = value; return true
  }
}

private let sessionJSON = """
{"uri":"https://alice.twake.app","oauthOptions":{"clientID":"c","clientSecret":"s","clientName":"n","softwareID":"sw","redirectURI":"r","clientKind":"mobile","clientURI":"u","scopes":["*"],"registrationAccessToken":null},"token":{"accessToken":"at","refreshToken":"rt","tokenType":"bearer","scope":"*"}}
"""

final class KeychainSessionStoreTests: XCTestCase {
  func testLoadReadsCanonicalNoAuthAliasAndQueriesRawKey() throws {
    let kc = FakeKeychain()
    kc.store["app:no-auth"] = Data(sessionJSON.utf8)
    let store = KeychainSessionStore(access: kc)
    let s = try store.load()
    XCTAssertEqual(s?.token.accessToken, "at")
    XCTAssertEqual(kc.lastAccount, Data("twake-drive-session".utf8))   // raw UTF-8, not hashed
    XCTAssertEqual(kc.lastAccessGroup, "com.linagora.twakedrive.shared")
  }

  func testLoadFallsBackAcrossServiceAliases() throws {
    // Only the legacy "app" alias present -> still found via the fallback chain.
    let kc = FakeKeychain()
    kc.store["app"] = Data(sessionJSON.utf8)
    XCTAssertEqual(try KeychainSessionStore(access: kc).load()?.token.refreshToken, "rt")
  }

  func testLoadReturnsNilWhenAbsent() throws {
    XCTAssertNil(try KeychainSessionStore(access: FakeKeychain()).load())
  }

  func testSaveWritesCanonicalNoAuthAliasWithAfterFirstUnlock() throws {
    let kc = FakeKeychain()
    var s = try JSONDecoder().decode(Session.self, from: Data(sessionJSON.utf8))
    s.token.accessToken = "at-2"
    try KeychainSessionStore(access: kc).save(s)
    XCTAssertEqual(kc.lastWriteService, "app:no-auth")
    let readBack = try KeychainSessionStore(access: kc).load()
    XCTAssertEqual(readBack?.token.accessToken, "at-2")               // converges with the app
  }
}
