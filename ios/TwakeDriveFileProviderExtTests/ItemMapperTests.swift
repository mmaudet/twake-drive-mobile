import XCTest
import FileProvider
import UniformTypeIdentifiers

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// CozyFileTests.swift above. `import FileProvider` and `import UniformTypeIdentifiers` are
// system frameworks available directly to this test target (no module dependency needed);
// CozyFile / ItemMapper / FileProviderItem reach this target via SHARED_SOURCES.

final class ItemMapperTests: XCTestCase {
  func testMapsFolder() {
    let f = CozyFile.fromAttributes(id: "d", ["type": "directory", "name": "Docs", "dir_id": "io.cozy.files.root-dir"])
    let item = ItemMapper.item(from: f)
    XCTAssertEqual(item.itemIdentifier.rawValue, "d")
    XCTAssertEqual(item.parentItemIdentifier, .rootContainer)     // dir_id == ROOT_DOC_ID -> rootContainer
    XCTAssertEqual(item.filename, "Docs")
    XCTAssertEqual(item.contentType, .folder)
    XCTAssertTrue(item.capabilities.contains(.allowsAddingSubItems))
    XCTAssertFalse(item.isTrashed)
  }

  func testMapsFile() {
    let f = CozyFile.fromAttributes(id: "f", ["type": "file", "name": "a.pdf", "dir_id": "d", "mime": "application/pdf", "size": "10"])
    let item = ItemMapper.item(from: f)
    XCTAssertEqual(item.parentItemIdentifier.rawValue, "d")
    XCTAssertEqual(item.documentSize?.int64Value, 10)          // documentSize is NSNumber?
    XCTAssertTrue(item.capabilities.contains(.allowsWriting))
    XCTAssertTrue(item.contentType.conforms(to: .pdf))
  }

  func testMapsImageContentType() {
    let f = CozyFile.fromAttributes(id: "i", ["type": "file", "name": "p.jpg", "dir_id": "d", "mime": "image/jpeg", "class": "image", "size": "5"])
    XCTAssertTrue(ItemMapper.item(from: f).contentType.conforms(to: .image))
  }

  func testHiddenIdsAreFiltered() {
    XCTAssertTrue(ItemMapper.isHidden("io.cozy.files.trash-dir"))
    XCTAssertTrue(ItemMapper.isHidden("io.cozy.files.shared-drives-dir"))
    XCTAssertFalse(ItemMapper.isHidden("some-file"))
  }
}
