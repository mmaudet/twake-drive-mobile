import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// CozyFilesApiReadTests.swift (Task 7): this test target has zero PBXTargetDependency on the
// TwakeDriveFileProviderExt app-extension target, so that import fails with "no such module"
// regardless of whether CozyFilesApi's write methods exist. CozyFilesApi, TokenProvider,
// HTTPClient, CozyError, CozyFile, FakeSessionStore, FakeHTTPClient, makeSession, and
// httpResponse all reach this test target via scripts/ios-add-file-provider-tests.cjs's
// SHARED_SOURCES / TEST_ONLY_SOURCES mechanism: compiled directly into this target's own
// Sources build phase, so they're plain types in this target's own module — no import needed.

final class CozyFilesApiWriteTests: XCTestCase {
  private func makeApi(_ handler: @escaping (URLRequest) async throws -> (Data, HTTPURLResponse)) -> CozyFilesApi {
    let store = FakeSessionStore(makeSession(access: "at-live"))
    let http = FakeHTTPClient(handler)
    return CozyFilesApi(baseURL: "https://alice.twake.app",
                        tokens: TokenProvider(store: store, client: http, lockURL: nil), client: http)
  }
  private let ok = #"{"data":{"id":"new-1","attributes":{"type":"file","name":"n","size":"0"}}}"#

  func testCreateDirectoryPostsTypeDirectory() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "POST")
      XCTAssertEqual(req.url?.path, "/files/parent-1")
      let q = req.url?.query ?? ""
      XCTAssertTrue(q.contains("Type=directory"))
      XCTAssertTrue(q.contains("Name=My%20Folder"))            // space percent-encoded by CozyFilesApi.encode
      return httpResponse(req.url!, 201, #"{"data":{"id":"d","attributes":{"type":"directory","name":"My Folder"}}}"#)
    }
    let f = try await api.createDirectory(parentId: "parent-1", name: "My Folder")
    XCTAssertTrue(f.isDir)
  }

  func testCreateFilePostsTypeFileWithMime() async throws {
    let api = makeApi { req in
      XCTAssertTrue((req.url?.query ?? "").contains("Type=file"))
      XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "text/plain")
      return httpResponse(req.url!, 201, self.ok)
    }
    _ = try await api.createFile(parentId: "p", name: "a.txt", mime: "text/plain")
  }

  func testUploadPutsBytes() async throws {
    let src = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try Data("payload".utf8).write(to: src)
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "PUT")
      XCTAssertEqual(req.url?.path, "/files/file-1")
      XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/octet-stream")
      XCTAssertEqual(req.httpBody, Data("payload".utf8))
      return httpResponse(req.url!, 200, self.ok)
    }
    _ = try await api.upload(id: "file-1", from: src, mime: "application/octet-stream")
  }

  func testRenamePatchesNameAttribute() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "PATCH")
      XCTAssertEqual(req.url?.path, "/files/file-1")
      let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
      XCTAssertTrue(body.contains("\"name\":\"renamed.txt\""))
      XCTAssertTrue(body.contains("\"type\":\"io.cozy.files\""))
      return httpResponse(req.url!, 200, self.ok)
    }
    _ = try await api.rename(id: "file-1", name: "renamed.txt")
  }

  func testMovePatchesDirId() async throws {
    let api = makeApi { req in
      let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
      XCTAssertTrue(body.contains("\"dir_id\":\"target-1\""))
      return httpResponse(req.url!, 200, self.ok)
    }
    _ = try await api.move(id: "file-1", toParent: "target-1")
  }

  func testMoveThrowsFilenameCollisionOn409() async throws {
    let api = makeApi { req in httpResponse(req.url!, 409, "{}") }
    do { _ = try await api.move(id: "f", toParent: "t"); XCTFail("expected throw") }
    catch { XCTAssertEqual(error as? CozyError, .filenameCollision) }
  }

  func testTrashSendsDelete() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.httpMethod, "DELETE")
      XCTAssertEqual(req.url?.path, "/files/file-1")
      return httpResponse(req.url!, 200, "{}")
    }
    try await api.trash(id: "file-1")
  }

  func testStatByPathReturnsNilOn404() async throws {
    let api = makeApi { req in
      XCTAssertEqual(req.url?.path, "/files/metadata")
      XCTAssertTrue((req.url?.query ?? "").contains("Path="))
      return httpResponse(req.url!, 404, "{}")
    }
    let r = try await api.statByPath("/Docs/x.txt")
    XCTAssertNil(r)
  }
}
