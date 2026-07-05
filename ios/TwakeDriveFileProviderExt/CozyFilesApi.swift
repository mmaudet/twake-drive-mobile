import Foundation

struct CozyFilesApi {
  let baseURL: String
  let tokens: TokenProvider
  let client: HTTPClient

  // MARK: request plumbing

  enum Method: String { case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE" }

  private func request(_ path: String, method: Method, token: String,
                       accept: Bool, contentType: String? = nil, body: Data? = nil) throws -> URLRequest {
    // `path` may be a bare path or already-encoded query. One exception: cozy-stack's
    // JSON:API pagination links (`list`'s `links.next`, stored verbatim/base-stripped) carry
    // literal, unencoded `[`/`]` (e.g. `page[cursor]=...`), which `URL(string:)` isn't
    // guaranteed to accept on our iOS 16.0 floor. Percent-encode just those two characters —
    // a no-op for paths that don't contain them, and it never touches bytes that are already
    // percent-encoded elsewhere in `path` (brackets can't appear inside a `%XX` escape).
    let safePath = path.replacingOccurrences(of: "[", with: "%5B")
                       .replacingOccurrences(of: "]", with: "%5D")
    guard let url = URL(string: baseURL + safePath) else {
      throw CozyError.serverUnreachable
    }
    var req = URLRequest(url: url)
    req.httpMethod = method.rawValue
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if accept { req.setValue("application/vnd.api+json", forHTTPHeaderField: "Accept") }
    if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
    if let body { req.httpBody = body }
    return req
  }

  /// Sends with the current token; on 401 force-refreshes (passing the just-rejected token as
  /// `previous`, per TokenProvider's `forceRefresh(previous:)` — see Task 6) and retries once;
  /// then maps status → CozyError.
  @discardableResult
  func send(_ path: String, method: Method, accept: Bool = true,
            contentType: String? = nil, body: Data? = nil) async throws -> Data {
    var token = try await tokens.validAccessToken()
    var (data, resp) = try await client.send(try request(path, method: method, token: token, accept: accept, contentType: contentType, body: body))
    if resp.statusCode == 401 {
      token = try await tokens.forceRefresh(previous: token)
      (data, resp) = try await client.send(try request(path, method: method, token: token, accept: accept, contentType: contentType, body: body))
    }
    try Self.mapStatus(resp.statusCode)
    return data
  }

  static func mapStatus(_ code: Int) throws {
    switch code {
    case 200...299: return
    case 401, 403:  throw CozyError.notAuthenticated
    case 404:       throw CozyError.noSuchItem
    case 409:       throw CozyError.filenameCollision
    case 507:       throw CozyError.insufficientQuota
    default:        throw CozyError.server(code)
    }
  }

  static func encode(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: .urlQueryValueAllowed) ?? s
  }

  private func parseData(_ data: Data) throws -> CozyFile {
    guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let node = root["data"] as? [String: Any],
          let id = node["id"] as? String,
          let attrs = node["attributes"] as? [String: Any] else { throw CozyError.server(-1) }
    return CozyFile.fromAttributes(id: id, attrs)
  }

  // MARK: read

  func get(_ id: String) async throws -> CozyFile {
    try parseData(try await send("/files/\(id)", method: .get))
  }

  /// One page of children + the next relative page path (base-stripped), mirroring CozyStackApi.list.
  func list(dirId: String, page: String?) async throws -> (files: [CozyFile], nextPage: String?) {
    let path = page ?? "/files/\(dirId)"
    let data = try await send(path, method: .get)
    guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      return ([], nil)
    }
    let included = (root["included"] as? [[String: Any]]) ?? []
    let files: [CozyFile] = included.compactMap { node in
      guard let id = node["id"] as? String, let attrs = node["attributes"] as? [String: Any] else { return nil }
      return CozyFile.fromAttributes(id: id, attrs)
    }
    var next: String? = nil
    if let links = root["links"] as? [String: Any], let raw = links["next"] as? String, !raw.isEmpty {
      next = raw.hasPrefix(baseURL) ? String(raw.dropFirst(baseURL.count)) : raw
    }
    return (files, next)
  }

  func download(id: String, to dest: URL) async throws {
    let data = try await send("/files/download/\(id)", method: .get, accept: false)
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: dest, options: .atomic)
  }

  func thumbnail(id: String, to dest: URL) async throws {
    let data = try await send("/files/\(id)/thumbnails/medium", method: .get, accept: false)
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: dest, options: .atomic)
  }
}

extension CozyFilesApi {
  // MARK: write

  func createDirectory(parentId: String, name: String) async throws -> CozyFile {
    let data = try await send("/files/\(parentId)?Type=directory&Name=\(Self.encode(name))",
                              method: .post)
    return try parseData(data)
  }

  func createFile(parentId: String, name: String, mime: String) async throws -> CozyFile {
    let data = try await send("/files/\(parentId)?Type=file&Name=\(Self.encode(name))",
                              method: .post, contentType: mime, body: Data())
    return try parseData(data)
  }

  func upload(id: String, from src: URL, mime: String) async throws -> CozyFile {
    let bytes = try Data(contentsOf: src)
    let data = try await send("/files/\(id)", method: .put, accept: true, contentType: mime, body: bytes)
    return try parseData(data)
  }

  private func patch(_ id: String, attributes: [String: Any]) async throws -> CozyFile {
    let payload: [String: Any] = ["data": ["type": "io.cozy.files", "id": id, "attributes": attributes]]
    let body = try JSONSerialization.data(withJSONObject: payload)
    let data = try await send("/files/\(id)", method: .patch, contentType: "application/vnd.api+json", body: body)
    return try parseData(data)
  }

  func rename(id: String, name: String) async throws -> CozyFile {
    try await patch(id, attributes: ["name": name])
  }

  /// Plain reparent PATCH. A 409 surfaces as CozyError.filenameCollision; ConflictResolver (Task 9) resolves it.
  func move(id: String, toParent parentId: String) async throws -> CozyFile {
    try await patch(id, attributes: ["dir_id": parentId])
  }

  func trash(id: String) async throws {
    _ = try await send("/files/\(id)", method: .delete)
  }

  func statByPath(_ path: String) async throws -> CozyFile? {
    do {
      let data = try await send("/files/metadata?Path=\(Self.encode(path))", method: .get)
      return try parseData(data)
    } catch CozyError.noSuchItem {
      return nil
    }
  }
}

extension CharacterSet {
  /// Query-value safe set (encodes `&`, `=`, `/`, `?`, space) for Name=/Path= params.
  static let urlQueryValueAllowed: CharacterSet = {
    var set = CharacterSet.alphanumerics
    set.insert(charactersIn: "-._~")
    return set
  }()
}
