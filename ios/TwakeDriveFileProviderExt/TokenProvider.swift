import Foundation

actor TokenProvider {
  private let store: SessionStoring
  private let client: HTTPClient
  private let lockURL: URL?
  private var cached: String?
  private var refreshTask: Task<String, Error>?

  init(store: SessionStoring, client: HTTPClient, lockURL: URL?) {
    self.store = store
    self.client = client
    self.lockURL = lockURL
  }

  func validAccessToken() async throws -> String {
    if let c = cached, !c.isEmpty { return c }
    if let s = try store.load(), !s.token.accessToken.isEmpty {
      cached = s.token.accessToken
      return s.token.accessToken
    }
    return try await forceRefresh(previous: nil)
  }

  func forceRefresh(previous: String?) async throws -> String {
    if let inflight = refreshTask { return try await inflight.value }   // single-flight (intra-process)
    let task = Task { try await self.performRefresh(previous: previous) }
    refreshTask = task
    defer { refreshTask = nil }
    let token = try await task.value
    cached = token
    return token
  }

  private func performRefresh(previous: String?) async throws -> String {
    if let lockURL {
      return try await Self.coordinated(lockURL) {
        try await Self.doRefresh(store: self.store, client: self.client, previous: previous)
      }
    }
    return try await Self.doRefresh(store: store, client: client, previous: previous)
  }

  // nonisolated so it runs off the actor executor (safe: touches only the injected store/client).
  nonisolated private static func doRefresh(store: SessionStoring, client: HTTPClient, previous: String?) async throws -> String {
    guard var session = try store.load() else { throw CozyError.notAuthenticated }
    // Another process (e.g. the app) rotated the token past the one that just failed → use it, skip the network.
    if let previous, !session.token.accessToken.isEmpty, session.token.accessToken != previous {
      return session.token.accessToken
    }
    var req = URLRequest(url: URL(string: "\(session.baseURL)/auth/access_token")!)
    req.httpMethod = "POST"
    req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    let form = [
      "grant_type=refresh_token",
      "client_id=\(formEncode(session.oauthOptions.clientID))",
      "client_secret=\(formEncode(session.oauthOptions.clientSecret))",
      "refresh_token=\(formEncode(session.token.refreshToken))",
    ].joined(separator: "&")
    req.httpBody = Data(form.utf8)

    let (data, response) = try await client.send(req)
    guard response.statusCode == 200 else { throw CozyError.notAuthenticated }
    let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    guard let access = obj?["access_token"] as? String, !access.isEmpty else { throw CozyError.notAuthenticated }
    session.token.accessToken = access
    if let rotated = obj?["refresh_token"] as? String, !rotated.isEmpty {
      session.token.refreshToken = rotated
    }
    try store.save(session)     // converge app + extension on the shared keychain
    return access
  }

  nonisolated private static func formEncode(_ s: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
  }

  /// Cross-process serialize via an NSFileCoordinator write on a sentinel in the App Group container.
  /// Runs the async body to completion while holding the coordinated write.
  nonisolated private static func coordinated<T>(_ url: URL, _ body: @escaping () async throws -> T) async throws -> T {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<T, Error>) in
      DispatchQueue.global(qos: .userInitiated).async {
        let coordinator = NSFileCoordinator()
        var coordError: NSError?
        coordinator.coordinate(writingItemAt: url, options: [], error: &coordError) { _ in
          let sem = DispatchSemaphore(value: 0)
          var result: Result<T, Error>!
          Task.detached {
            do { result = .success(try await body()) } catch { result = .failure(error) }
            sem.signal()
          }
          sem.wait()               // hold the coordinated write until the refresh finishes
          cont.resume(with: result)
        }
        if let coordError { cont.resume(throwing: coordError) }
      }
    }
  }
}
