import Foundation

struct CozyFile: Equatable {
  let id: String
  let name: String
  let isDir: Bool
  let dirId: String?
  let size: Int64
  let mime: String?
  let klass: String?
  let updatedAt: Date
  let path: String?

  var hasThumbnail: Bool { klass == "image" }

  private static let iso: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return f
  }()

  private static func parseDate(_ s: String?) -> Date {
    guard let s, s.count >= 19 else { return Date(timeIntervalSince1970: 0) }
    return iso.date(from: String(s.prefix(19))) ?? Date(timeIntervalSince1970: 0)
  }

  /// Ports Models.kt CozyFile.fromAttributes.
  static func fromAttributes(id: String, _ a: [String: Any]) -> CozyFile {
    let isDir = (a["type"] as? String) == "directory"
    func str(_ k: String) -> String? {
      guard let v = a[k] as? String, !v.isEmpty else { return nil }
      return v
    }
    let size: Int64 = isDir ? 0 : Int64(str("size") ?? "0") ?? 0
    return CozyFile(
      id: id,
      name: str("name") ?? "",
      isDir: isDir,
      dirId: str("dir_id"),
      size: size,
      mime: str("mime"),
      klass: str("class"),
      updatedAt: parseDate(str("updated_at")),
      path: str("path")
    )
  }
}
