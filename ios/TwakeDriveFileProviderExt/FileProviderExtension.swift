import FileProvider
import UniformTypeIdentifiers

// NSExtensionPrincipalClass in Info.plist resolves "$(PRODUCT_MODULE_NAME).FileProviderExtension".
final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
  required init(domain: NSFileProviderDomain) {
    super.init()
  }

  func invalidate() {}

  func item(for identifier: NSFileProviderItemIdentifier,
            request: NSFileProviderRequest,
            completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void) -> Progress {
    completionHandler(nil, NSError(domain: NSFileProviderErrorDomain,
                                   code: NSFileProviderError.noSuchItem.rawValue))
    return Progress()
  }

  func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier,
                     version requestedVersion: NSFileProviderItemVersion?,
                     request: NSFileProviderRequest,
                     completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) -> Progress {
    completionHandler(nil, nil, NSError(domain: NSFileProviderErrorDomain,
                                        code: NSFileProviderError.noSuchItem.rawValue))
    return Progress()
  }

  func createItem(basedOn itemTemplate: NSFileProviderItem,
                  fields: NSFileProviderItemFields,
                  contents url: URL?,
                  options: NSFileProviderCreateItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    completionHandler(nil, [], false, NSError(domain: NSFileProviderErrorDomain,
                                              code: NSFileProviderError.serverUnreachable.rawValue))
    return Progress()
  }

  func modifyItem(_ item: NSFileProviderItem,
                  baseVersion version: NSFileProviderItemVersion,
                  changedFields: NSFileProviderItemFields,
                  contents newContents: URL?,
                  options: NSFileProviderModifyItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    completionHandler(nil, [], false, NSError(domain: NSFileProviderErrorDomain,
                                              code: NSFileProviderError.serverUnreachable.rawValue))
    return Progress()
  }

  func deleteItem(identifier: NSFileProviderItemIdentifier,
                  baseVersion version: NSFileProviderItemVersion,
                  options: NSFileProviderDeleteItemOptions = [],
                  request: NSFileProviderRequest,
                  completionHandler: @escaping (Error?) -> Void) -> Progress {
    completionHandler(NSError(domain: NSFileProviderErrorDomain,
                             code: NSFileProviderError.noSuchItem.rawValue))
    return Progress()
  }

  func enumerator(for containerItemIdentifier: NSFileProviderItemIdentifier,
                  request: NSFileProviderRequest) throws -> NSFileProviderEnumerator {
    throw NSError(domain: NSFileProviderErrorDomain, code: NSFileProviderError.noSuchItem.rawValue)
  }
}
