import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// CozyFilesApiWriteTests.swift (Task 8): this test target has zero PBXTargetDependency on the
// TwakeDriveFileProviderExt app-extension target, so that import fails with "no such module"
// regardless of whether ConflictResolver/MoveConflictOps exist. CozyFile, CozyError, and (once
// written) ConflictResolver/MoveConflictOps all reach this test target via
// scripts/ios-add-file-provider-tests.cjs's SHARED_SOURCES mechanism: compiled directly into
// this target's own Sources build phase, so they're plain types in this target's own module —
// no import needed, same as any other file in this target.

private final class ScriptedApi: MoveConflictOps {
  var moveResults: [Result<CozyFile, Error>]           // consumed in order per move() call
  var getById: [String: CozyFile] = [:]
  var statByPathResult: CozyFile?
  private(set) var trashed: [String] = []
  private(set) var moveCalls = 0
  private(set) var statedPaths: [String] = []
  init(moveResults: [Result<CozyFile, Error>]) { self.moveResults = moveResults }

  func move(id: String, toParent parentId: String) async throws -> CozyFile {
    defer { moveCalls += 1 }
    switch moveResults[moveCalls] { case .success(let f): return f; case .failure(let e): throw e }
  }
  func get(_ id: String) async throws -> CozyFile {
    guard let f = getById[id] else { throw CozyError.noSuchItem }
    return f
  }
  func statByPath(_ path: String) async throws -> CozyFile? { statedPaths.append(path); return statByPathResult }
  func trash(id: String) async throws { trashed.append(id) }
}

private func file(_ id: String, name: String, path: String? = nil, dir: Bool = false) -> CozyFile {
  CozyFile(id: id, name: name, isDir: dir, dirId: nil, size: 0, mime: nil, klass: nil,
           updatedAt: Date(timeIntervalSince1970: 0), path: path)
}

final class ConflictResolverTests: XCTestCase {
  func testPlainMoveSucceedsWithoutConflict() async throws {
    let moved = file("f", name: "a.txt")
    let api = ScriptedApi(moveResults: [.success(moved)])
    let r = try await ConflictResolver(api: api).move(id: "f", toParent: "t")
    XCTAssertEqual(r.id, "f")
    XCTAssertEqual(api.moveCalls, 1)
    XCTAssertTrue(api.trashed.isEmpty)
  }

  func test409TrashesConflictAtDestPathThenRetries() async throws {
    let api = ScriptedApi(moveResults: [.failure(CozyError.filenameCollision), .success(file("f", name: "a.txt"))])
    api.getById["f"] = file("f", name: "a.txt")               // moving item (for its name)
    api.getById["t"] = file("t", name: "Target", path: "/Docs/Target", dir: true)  // dest dir (for its path)
    api.statByPathResult = file("dup", name: "a.txt")         // conflicting entry at dest
    let r = try await ConflictResolver(api: api).move(id: "f", toParent: "t")
    XCTAssertEqual(r.id, "f")
    XCTAssertEqual(api.statedPaths, ["/Docs/Target/a.txt"])   // dest path + moving name
    XCTAssertEqual(api.trashed, ["dup"])                       // conflict trashed
    XCTAssertEqual(api.moveCalls, 2)                           // retried
  }

  func test409WithNoConflictingEntryStillRetries() async throws {
    let api = ScriptedApi(moveResults: [.failure(CozyError.filenameCollision), .success(file("f", name: "a.txt"))])
    api.getById["f"] = file("f", name: "a.txt")
    api.getById["t"] = file("t", name: "T", path: "/Docs/T", dir: true)
    api.statByPathResult = nil                                 // nothing to trash
    _ = try await ConflictResolver(api: api).move(id: "f", toParent: "t")
    XCTAssertTrue(api.trashed.isEmpty)
    XCTAssertEqual(api.moveCalls, 2)
  }

  func testNonCollisionErrorPropagates() async throws {
    let api = ScriptedApi(moveResults: [.failure(CozyError.notAuthenticated)])
    do { _ = try await ConflictResolver(api: api).move(id: "f", toParent: "t"); XCTFail("expected throw") }
    catch { XCTAssertEqual(error as? CozyError, .notAuthenticated) }  // not swallowed by the 409 path
  }
}
