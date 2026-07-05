import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// SessionTests.swift/KeychainSessionStoreTests.swift/CozyFileTests.swift/TokenProviderTests.swift
// (Tasks 3/4/5/6): this test target has zero PBXTargetDependency on the
// TwakeDriveFileProviderExt app-extension target, so that import fails with "no such module"
// regardless of whether CozyFilesApi exists. CozyFilesApi, TokenProvider, HTTPClient, CozyError,
// CozyFile, FakeSessionStore, FakeHTTPClient, makeSession, and httpResponse all reach this test
// target via scripts/ios-add-file-provider-tests.cjs's SHARED_SOURCES / TEST_ONLY_SOURCES
// mechanism: compiled directly into this target's own Sources build phase, so they're plain
// types in this target's own module — no import needed.

final class CozyFilesApiReadTests: XCTestCase {
  private func makeApi(_ handler: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse)) -> CozyFilesApi {
    let store = FakeSessionStore(makeSession(access: "at-live"))
    let http = FakeHTTPClient(handler)
    let tokens = TokenProvider(store: store, client: http, lockURL: nil)
    return CozyFilesApi(baseURL: "https://alice.twake.app", tokens: tokens, client: http)
  }

  func testGetParsesAttributesAndSendsBearerAndAccept() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/file-1")
      XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer at-live")
      XCTAssertEqual(req.value(forHTTPHeaderField: "Accept"), "application/vnd.api+json")
      return httpResponse(req.url!, 200, #"{"data":{"id":"file-1","attributes":{"type":"file","name":"a.pdf","dir_id":"d","size":"3","mime":"application/pdf"}}}"#)
    }
    let f = try await api.get("file-1")
    XCTAssertEqual(f.name, "a.pdf")
    XCTAssertEqual(f.size, 3)
  }

  func testListParsesIncludedAndFollowsLinksNext() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/dir-1")
      let json = #"""
      {"included":[
        {"id":"c1","attributes":{"type":"file","name":"one.txt","dir_id":"dir-1","size":"1"}},
        {"id":"c2","attributes":{"type":"directory","name":"sub","dir_id":"dir-1"}}
      ],"links":{"next":"https://alice.twake.app/files/dir-1?page[cursor]=abc"}}
      """#
      return httpResponse(req.url!, 200, json)
    }
    let (files, next) = try await api.list(dirId: "dir-1", page: nil)
    XCTAssertEqual(files.map(\.id), ["c1", "c2"])
    XCTAssertEqual(next, "/files/dir-1?page[cursor]=abc")   // base stripped
  }

  func testListReturnsNilNextWhenNoLink() async throws {
    let api = makeApi { req in httpResponse(req.url!, 200, #"{"included":[]}"#) }
    let (files, next) = try await api.list(dirId: "d", page: nil)
    XCTAssertTrue(files.isEmpty)
    XCTAssertNil(next)
  }

  /// Round-trips a real cozy-stack pagination cursor: `links.next` carries literal, unencoded
  /// JSON:API brackets (`page[cursor]=...`), stored verbatim (base-stripped) by `list`. Feeding
  /// that value back in as the second call's `page` must build a valid request URL — not crash
  /// a force-unwrapped `URL(string:)` — and must still carry the cursor through to cozy-stack.
  /// This is exactly what Task 10's enumerator does across multi-page folders.
  func testListRoundTripsBracketedPageCursorIntoNextRequest() async throws {
    var callCount = 0
    let api = makeApi { req in
      callCount += 1
      if callCount == 1 {
        XCTAssertEqual(req.url?.path, "/files/dir-1")
        let json = #"""
        {"included":[
          {"id":"c1","attributes":{"type":"file","name":"one.txt","dir_id":"dir-1","size":"1"}}
        ],"links":{"next":"https://alice.twake.app/files/dir-1?page[cursor]=Y29zdG8="}}
        """#
        return httpResponse(req.url!, 200, json)
      }
      // Second call: the round-tripped `next` page must have produced a well-formed URL (no
      // crash from the unencoded `[`/`]`) and the cursor must still be present and correct.
      let comps = try XCTUnwrap(URLComponents(url: try XCTUnwrap(req.url), resolvingAgainstBaseURL: false))
      XCTAssertEqual(comps.path, "/files/dir-1")
      XCTAssertEqual(comps.queryItems?.first(where: { $0.name == "page[cursor]" })?.value, "Y29zdG8=")
      return httpResponse(req.url!, 200, #"{"included":[]}"#)
    }

    let (firstFiles, next) = try await api.list(dirId: "dir-1", page: nil)
    XCTAssertEqual(firstFiles.map(\.id), ["c1"])
    let nextPage = try XCTUnwrap(next)
    XCTAssertEqual(nextPage, "/files/dir-1?page[cursor]=Y29zdG8=")   // base stripped, brackets verbatim

    let (secondFiles, secondNext) = try await api.list(dirId: "dir-1", page: nextPage)
    XCTAssertTrue(secondFiles.isEmpty)
    XCTAssertNil(secondNext)
    XCTAssertEqual(callCount, 2)
  }

  func testRetriesOnceOn401ThenSucceeds() async throws {
    let store = FakeSessionStore(makeSession(access: "at-old"))
    var calls = 0
    let http = FakeHTTPClient { req in
      calls += 1
      if req.url?.path == "/auth/access_token" {
        return httpResponse(req.url!, 200, #"{"access_token":"at-new"}"#)
      }
      if calls == 1 { return httpResponse(req.url!, 401, "{}") }       // first data call: 401
      XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer at-new")
      return httpResponse(req.url!, 200, #"{"data":{"id":"x","attributes":{"type":"file","name":"n","size":"0"}}}"#)
    }
    let tokens = TokenProvider(store: store, client: http, lockURL: nil)
    let api = CozyFilesApi(baseURL: "https://alice.twake.app", tokens: tokens, client: http)
    let f = try await api.get("x")
    XCTAssertEqual(f.id, "x")
  }

  func testDownloadWritesBytesToDest() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/download/file-1")
      return (Data("hello".utf8), HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
    let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try await api.download(id: "file-1", to: dest)
    XCTAssertEqual(try String(contentsOf: dest, encoding: .utf8), "hello")
  }
}
