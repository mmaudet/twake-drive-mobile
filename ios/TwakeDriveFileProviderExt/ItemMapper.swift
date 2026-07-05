import Foundation
import FileProvider
import UniformTypeIdentifiers

/// Conforms to the NSFileProviderItem protocol (pure/testable — no live extension).
/// Must be a class, not a struct: NSFileProviderItem refines NSObjectProtocol (an @objc
/// protocol), so a value type cannot conform (confirmed by xcodebuild: a `struct` here fails
/// with "non-class type 'FileProviderItem' cannot conform to class protocol
/// 'NSFileProviderItemProtocol'/'NSObjectProtocol'").
final class FileProviderItem: NSObject, NSFileProviderItem {
  let itemIdentifier: NSFileProviderItemIdentifier
  let parentItemIdentifier: NSFileProviderItemIdentifier
  let filename: String
  let contentType: UTType
  let capabilities: NSFileProviderItemCapabilities
  let documentSize: NSNumber?
  let contentModificationDate: Date?
  let itemVersion: NSFileProviderItemVersion
  var isTrashed: Bool { false }

  init(
    itemIdentifier: NSFileProviderItemIdentifier,
    parentItemIdentifier: NSFileProviderItemIdentifier,
    filename: String,
    contentType: UTType,
    capabilities: NSFileProviderItemCapabilities,
    documentSize: NSNumber?,
    contentModificationDate: Date?,
    itemVersion: NSFileProviderItemVersion
  ) {
    self.itemIdentifier = itemIdentifier
    self.parentItemIdentifier = parentItemIdentifier
    self.filename = filename
    self.contentType = contentType
    self.capabilities = capabilities
    self.documentSize = documentSize
    self.contentModificationDate = contentModificationDate
    self.itemVersion = itemVersion
  }
}

enum ItemMapper {
  static let rootDocID = "io.cozy.files.root-dir"                       // DocumentMapper.ROOT_DOC_ID
  static let hiddenIDs: Set<String> = ["io.cozy.files.trash-dir", "io.cozy.files.shared-drives-dir"]

  static func isHidden(_ id: String) -> Bool { hiddenIDs.contains(id) }

  static func identifier(for id: String) -> NSFileProviderItemIdentifier {
    id == rootDocID ? .rootContainer : NSFileProviderItemIdentifier(id)
  }

  static func item(from f: CozyFile) -> FileProviderItem {
    let parent: NSFileProviderItemIdentifier = f.dirId.map { identifier(for: $0) } ?? .rootContainer
    let type: UTType = f.isDir
      ? .folder
      : (f.mime.flatMap { UTType(mimeType: $0) } ?? .data)

    var caps: NSFileProviderItemCapabilities = [.allowsReading, .allowsDeleting, .allowsRenaming, .allowsReparenting]
    if f.isDir {
      caps.insert(.allowsAddingSubItems)
      caps.insert(.allowsContentEnumerating)
    } else {
      caps.insert(.allowsWriting)
    }

    // Version bumps when content (updated_at/size) or metadata (name/parent) changes,
    // so the system re-materializes after our own mutations (parity with notifyChange).
    let contentVersion = Data("\(Int64(f.updatedAt.timeIntervalSince1970))|\(f.size)".utf8)
    let metadataVersion = Data("\(f.name)|\(f.dirId ?? "")".utf8)

    return FileProviderItem(
      itemIdentifier: identifier(for: f.id),
      parentItemIdentifier: parent,
      filename: f.name,
      contentType: type,
      capabilities: caps,
      documentSize: f.isDir ? nil : NSNumber(value: f.size),
      contentModificationDate: f.updatedAt.timeIntervalSince1970 > 0 ? f.updatedAt : nil,
      itemVersion: NSFileProviderItemVersion(contentVersion: contentVersion, metadataVersion: metadataVersion)
    )
  }
}
