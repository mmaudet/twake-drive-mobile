import FileProvider
import UniformTypeIdentifiers

// NSExtensionPrincipalClass in Info.plist resolves "$(PRODUCT_MODULE_NAME).FileProviderExtension".
final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
  private static let appGroup = "group.com.linagora.twakedrive"

  required init(domain: NSFileProviderDomain) {
    super.init()
  }

  func invalidate() {}

  // MARK: core

  private static let keychainAccessGroup = "KUT463DS29.com.linagora.twakedrive.shared"

  private func makeApi() throws -> CozyFilesApi {
    let store = KeychainSessionStore(access: RealKeychainAccess(), accessGroup: Self.keychainAccessGroup)
    guard let session = try store.load() else { throw CozyError.notAuthenticated }
    let client = URLSessionHTTPClient()
    let lockURL = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup)?
      .appendingPathComponent("token-refresh.lock")
    let tokens = TokenProvider(store: store, client: client, lockURL: lockURL)
    return CozyFilesApi(baseURL: session.baseURL, tokens: tokens, client: client)
  }

  private func dirId(for identifier: NSFileProviderItemIdentifier) -> String {
    identifier == .rootContainer ? ItemMapper.rootDocID : identifier.rawValue
  }

  static func nsError(_ error: Error) -> NSError {
    let code: NSFileProviderError.Code
    switch error {
    case CozyError.notAuthenticated: code = .notAuthenticated
    case CozyError.noSuchItem: code = .noSuchItem
    case CozyError.filenameCollision: code = .filenameCollision
    case CozyError.insufficientQuota: code = .insufficientQuota
    default: code = .serverUnreachable
    }
    return NSError(domain: NSFileProviderErrorDomain, code: code.rawValue)
  }

  // MARK: item

  func item(for identifier: NSFileProviderItemIdentifier,
            request: NSFileProviderRequest,
            completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void) -> Progress {
    if identifier == .trashContainer || identifier == .workingSet {
      completionHandler(nil, Self.nsError(CozyError.noSuchItem))
      return Progress()
    }
    Task {
      do {
        let api = try makeApi()
        let file = try await api.get(dirId(for: identifier))
        completionHandler(ItemMapper.item(from: file), nil)
      } catch {
        completionHandler(nil, Self.nsError(error))
      }
    }
    return Progress()
  }

  // MARK: fetch contents

  func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier,
                     version requestedVersion: NSFileProviderItemVersion?,
                     request: NSFileProviderRequest,
                     completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) -> Progress {
    Task {
      do {
        let api = try makeApi()
        let file = try await api.get(itemIdentifier.rawValue)
        let name = file.name.isEmpty ? itemIdentifier.rawValue : file.name
        let dest = FileManager.default.temporaryDirectory
          .appendingPathComponent(UUID().uuidString, isDirectory: true)
          .appendingPathComponent(name)
        try await api.download(id: itemIdentifier.rawValue, to: dest)
        completionHandler(dest, ItemMapper.item(from: file), nil)
      } catch {
        completionHandler(nil, nil, Self.nsError(error))
      }
    }
    return Progress()
  }

  // MARK: create

  func createItem(basedOn itemTemplate: NSFileProviderItem,
                  fields: NSFileProviderItemFields,
                  contents url: URL?,
                  options: NSFileProviderCreateItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    let parent = dirId(for: itemTemplate.parentItemIdentifier)
    let name = itemTemplate.filename
    let isDir = itemTemplate.contentType == .folder
    Task {
      do {
        let api = try makeApi()
        let created: CozyFile
        if isDir {
          created = try await api.createDirectory(parentId: parent, name: name)
        } else {
          let mime = itemTemplate.contentType?.preferredMIMEType ?? "application/octet-stream"
          let file = try await api.createFile(parentId: parent, name: name, mime: mime)
          if let url {
            created = try await api.upload(id: file.id, from: url, mime: mime)
          } else {
            created = file
          }
        }
        completionHandler(ItemMapper.item(from: created), [], false, nil)
      } catch {
        completionHandler(nil, [], false, Self.nsError(error))
      }
    }
    return Progress()
  }

  // MARK: modify

  func modifyItem(_ item: NSFileProviderItem,
                  baseVersion version: NSFileProviderItemVersion,
                  changedFields: NSFileProviderItemFields,
                  contents newContents: URL?,
                  options: NSFileProviderModifyItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    let id = item.itemIdentifier.rawValue
    Task {
      do {
        let api = try makeApi()
        var current = try await api.get(id)
        if changedFields.contains(.filename) {
          current = try await api.rename(id: id, name: item.filename)
        }
        if changedFields.contains(.parentItemIdentifier) {
          current = try await api.move(id: id, toParent: dirId(for: item.parentItemIdentifier))
        }
        if changedFields.contains(.contents), let newContents {
          let mime = current.mime ?? item.contentType?.preferredMIMEType ?? "application/octet-stream"
          current = try await api.upload(id: id, from: newContents, mime: mime)
        }
        completionHandler(ItemMapper.item(from: current), [], false, nil)
      } catch {
        completionHandler(nil, [], false, Self.nsError(error))
      }
    }
    return Progress()
  }

  // MARK: delete

  func deleteItem(identifier: NSFileProviderItemIdentifier,
                  baseVersion version: NSFileProviderItemVersion,
                  options: NSFileProviderDeleteItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (Error?) -> Void) -> Progress {
    Task {
      do {
        let api = try makeApi()
        try await api.trash(id: identifier.rawValue)
        completionHandler(nil)
      } catch {
        completionHandler(Self.nsError(error))
      }
    }
    return Progress()
  }

  // MARK: enumerate

  func enumerator(for containerItemIdentifier: NSFileProviderItemIdentifier,
                  request: NSFileProviderRequest) throws -> NSFileProviderEnumerator {
    if containerItemIdentifier == .trashContainer {
      throw Self.nsError(CozyError.noSuchItem)
    }
    let api = try makeApi()
    if containerItemIdentifier == .workingSet {
      return FileProviderEnumerator(api: api, containerDirId: nil)
    }
    return FileProviderEnumerator(api: api, containerDirId: dirId(for: containerItemIdentifier))
  }
}

// MARK: - Enumerator

final class FileProviderEnumerator: NSObject, NSFileProviderEnumerator {
  private let api: CozyFilesApi
  private let containerDirId: String?

  init(api: CozyFilesApi, containerDirId: String?) {
    self.api = api
    self.containerDirId = containerDirId
    super.init()
  }

  func invalidate() {}

  func enumerateItems(for observer: NSFileProviderEnumerationObserver,
                      startingAt page: NSFileProviderPage) {
    guard let containerDirId else {
      observer.finishEnumerating(upTo: nil)
      return
    }
    let pagePath = Self.decodePage(page)
    Task {
      do {
        let (files, nextPage) = try await api.list(dirId: containerDirId, page: pagePath)
        let items = files
          .filter { !ItemMapper.isHidden($0.id) }
          .map { ItemMapper.item(from: $0) }
        observer.didEnumerate(items)
        if let nextPage {
          observer.finishEnumerating(upTo: NSFileProviderPage(Data(nextPage.utf8)))
        } else {
          observer.finishEnumerating(upTo: nil)
        }
      } catch {
        observer.finishEnumeratingWithError(FileProviderExtension.nsError(error))
      }
    }
  }

  func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
    completionHandler(NSFileProviderSyncAnchor(Data("v1".utf8)))
  }

  func enumerateChanges(for observer: NSFileProviderChangeObserver,
                        from anchor: NSFileProviderSyncAnchor) {
    observer.finishEnumeratingChanges(upTo: anchor, moreComing: false)
  }

  private static func decodePage(_ page: NSFileProviderPage) -> String? {
    guard let s = String(data: page.rawValue as Data, encoding: .utf8), s.hasPrefix("/") else {
      return nil
    }
    return s
  }
}
