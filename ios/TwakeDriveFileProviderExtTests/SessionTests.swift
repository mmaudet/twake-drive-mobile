import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — deliberately, matching
// SmokeTest.swift's pattern. This test target has zero PBXTargetDependency on the
// TwakeDriveFileProviderExt app-extension target (verified: both targets' `dependencies`
// arrays are empty in project.pbxproj); the extension's module is never built as part of
// this scheme, so that import would fail with "no such module" regardless of whether
// Session.swift exists. Session.swift instead reaches this test target the way
// scripts/ios-add-file-provider-tests.cjs's SHARED_SOURCES is documented to work: compiled
// directly into BOTH targets' own Sources build phase, so `Session` is a plain type in this
// target's own module — no import needed, same as any other file in this target.
final class SessionTests: XCTestCase {
  // A fixture captured from a real logged-in session (nested shape written by src/auth/tokenStorage.ts).
  private let fixture = """
  {
    "uri": "https://alice.twake.app/",
    "oauthOptions": {
      "clientID": "cid-123",
      "clientSecret": "secret-xyz",
      "clientName": "Twake Drive",
      "softwareID": "io.twake.drive",
      "redirectURI": "twakedrive://oauth",
      "clientKind": "mobile",
      "clientURI": "https://twake.app",
      "scopes": ["io.cozy.files", "*"],
      "registrationAccessToken": "rat-1"
    },
    "token": { "accessToken": "at-1", "refreshToken": "rt-1", "tokenType": "bearer", "scope": "*" }
  }
  """

  func testDecodesNestedSession() throws {
    let s = try JSONDecoder().decode(Session.self, from: Data(fixture.utf8))
    XCTAssertEqual(s.uri, "https://alice.twake.app/")
    XCTAssertEqual(s.baseURL, "https://alice.twake.app")           // trailing slash stripped
    XCTAssertEqual(s.oauthOptions.clientID, "cid-123")
    XCTAssertEqual(s.oauthOptions.clientSecret, "secret-xyz")
    XCTAssertEqual(s.oauthOptions.scopes, ["io.cozy.files", "*"])
    XCTAssertEqual(s.token.accessToken, "at-1")
    XCTAssertEqual(s.token.refreshToken, "rt-1")
  }

  func testRoundTripsThroughEncoder() throws {
    let s = try JSONDecoder().decode(Session.self, from: Data(fixture.utf8))
    let reencoded = try JSONEncoder().encode(s)
    let s2 = try JSONDecoder().decode(Session.self, from: reencoded)
    XCTAssertEqual(s, s2)
  }

  func testOptionalRegistrationTokenMayBeAbsent() throws {
    let minimal = fixture.replacingOccurrences(of: "\"registrationAccessToken\": \"rat-1\"", with: "\"registrationAccessToken\": null")
    let s = try JSONDecoder().decode(Session.self, from: Data(minimal.utf8))
    XCTAssertNil(s.oauthOptions.registrationAccessToken)
  }
}
