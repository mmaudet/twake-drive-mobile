import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// SessionTests.swift/KeychainSessionStoreTests.swift/CozyFileTests.swift/ItemMapperTests.swift
// (Tasks 3/4/5): this test target has zero PBXTargetDependency on the
// TwakeDriveFileProviderExt app-extension target, so that import fails with "no such module"
// regardless of whether TokenProvider.swift exists. TokenProvider reaches this test target via
// scripts/ios-add-file-provider-tests.cjs's SHARED_SOURCES mechanism: compiled directly into
// this target's own Sources build phase, so it's a plain type in this target's own module — no
// import needed, same as any other file in this target. FakeSessionStore / FakeHTTPClient /
// makeSession / httpResponse come from Fakes.swift (TEST_ONLY_SOURCES, same target).

final class TokenProviderTests: XCTestCase {
  func testValidAccessTokenReturnsStoredWithoutNetwork() async throws {
    let store = FakeSessionStore(makeSession(access: "at-live"))
    let http = FakeHTTPClient { _ in XCTFail("no network expected"); return httpResponse(URL(string: "https://x")!, 200, "{}") }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    let token = try await tp.validAccessToken()
    XCTAssertEqual(token, "at-live")
    XCTAssertEqual(http.callCount, 0)
  }

  func testForceRefreshPostsAndWritesBackRotatedToken() async throws {
    let store = FakeSessionStore(makeSession(access: "at-old", refresh: "rt-old"))
    let http = FakeHTTPClient { req in
      XCTAssertEqual(req.url?.path, "/auth/access_token")
      XCTAssertEqual(req.httpMethod, "POST")
      let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
      XCTAssertTrue(body.contains("grant_type=refresh_token"))
      XCTAssertTrue(body.contains("refresh_token=rt-old"))
      return httpResponse(req.url!, 200, #"{"access_token":"at-new","refresh_token":"rt-new"}"#)
    }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    // previous = "at-old": the store's current access token — the server rejected it (401), so we
    // refresh; nothing newer is stored, so this falls through to a real network refresh.
    let token = try await tp.forceRefresh(previous: "at-old")
    XCTAssertEqual(token, "at-new")
    XCTAssertEqual(store.current?.token.accessToken, "at-new")     // write-back
    XCTAssertEqual(store.current?.token.refreshToken, "rt-new")    // rotated token persisted
  }

  func testForceRefreshIsSingleFlightUnderConcurrency() async throws {
    let store = FakeSessionStore(makeSession())
    let http = FakeHTTPClient { req in
      try? await Task.sleep(nanoseconds: 60_000_000)               // coalesce concurrent callers
      return httpResponse(req.url!, 200, #"{"access_token":"at-new"}"#)
    }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    let tokens = try await withThrowingTaskGroup(of: String.self) { group -> [String] in
      // previous = "at-old": the store's default access token (see makeSession) — every concurrent
      // caller observed the same failed 401 token, so they all race into the same single-flight refresh.
      for _ in 0..<5 { group.addTask { try await tp.forceRefresh(previous: "at-old") } }
      var out: [String] = []
      for try await t in group { out.append(t) }
      return out
    }
    XCTAssertEqual(tokens, Array(repeating: "at-new", count: 5))
    XCTAssertEqual(http.callCount, 1)                              // one HTTP call for five callers
  }

  func testForceRefreshShortCircuitsWhenAnotherProcessAlreadyRotated() async throws {
    // Store already holds "at-fresh", written by another process (e.g. the app) that rotated the
    // token. This process only ever knew "at-stale" — that's the token that just 401'd, so it's
    // what gets passed as `previous`. Since the store's current token differs from `previous`,
    // forceRefresh(previous:) short-circuits to the fresher stored token without touching the network.
    let store = FakeSessionStore(makeSession(access: "at-fresh"))
    let http = FakeHTTPClient { _ in XCTFail("should not hit network"); return httpResponse(URL(string: "https://x")!, 200, "{}") }
    let tp = TokenProvider(store: store, client: http, lockURL: nil)
    // previous = "at-stale": the stale token THIS process used and that 401'd.
    let token = try await tp.forceRefresh(previous: "at-stale")
    XCTAssertEqual(token, "at-fresh")
    XCTAssertEqual(http.callCount, 0)
  }
}
