import Foundation
import Security

/// Seam over the raw Security framework so the store is unit-testable with a fake.
protocol KeychainAccess {
  func read(service: String, account: Data, accessGroup: String) -> Data?
  func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool
}

protocol SessionStoring {
  func load() throws -> Session?
  func save(_ session: Session) throws
}

struct KeychainSessionStore: SessionStoring {
  // expo-secure-store key + its raw-UTF-8 account/generic encoding.
  private static let key = "twake-drive-session"
  // Read fallback mirrors expo-secure-store's get(): requireAuthentication=false first
  // ("app:no-auth"), then "app:auth", then the legacy un-suffixed "app".
  private static let readServices = ["app:no-auth", "app:auth", "app"]
  // Write to the canonical no-auth alias the JS side uses (requireAuthentication defaults false).
  private static let writeService = "app:no-auth"

  private let access: KeychainAccess
  private let accessGroup: String

  init(access: KeychainAccess, accessGroup: String = "com.linagora.twakedrive.shared") {
    self.access = access
    self.accessGroup = accessGroup
  }

  private var account: Data { Data(Self.key.utf8) }

  func load() throws -> Session? {
    for service in Self.readServices {
      guard let data = access.read(service: service, account: account, accessGroup: accessGroup) else { continue }
      return try JSONDecoder().decode(Session.self, from: data)
    }
    return nil
  }

  func save(_ session: Session) throws {
    let data = try JSONEncoder().encode(session)
    guard access.write(data, service: Self.writeService, account: account,
                       accessGroup: accessGroup, accessible: kSecAttrAccessibleAfterFirstUnlock) else {
      throw CozyError.serverUnreachable
    }
  }
}

/// Production keychain access. `read` = SecItemCopyMatching; `write` = add-or-update.
struct RealKeychainAccess: KeychainAccess {
  func read(service: String, account: Data, accessGroup: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: accessGroup,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: kCFBooleanTrue as Any,
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess else { return nil }
    return out as? Data
  }

  func write(_ value: Data, service: String, account: Data, accessGroup: String, accessible: CFString) -> Bool {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: accessGroup,
    ]
    let update: [String: Any] = [kSecValueData as String: value, kSecAttrAccessible as String: accessible]
    let status = SecItemUpdate(base as CFDictionary, update as CFDictionary)
    if status == errSecSuccess { return true }
    if status == errSecItemNotFound {
      var add = base
      add[kSecValueData as String] = value
      add[kSecAttrAccessible as String] = accessible
      return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }
    return false
  }
}
