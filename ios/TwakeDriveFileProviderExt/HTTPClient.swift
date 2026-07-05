import Foundation

enum CozyError: Error, Equatable {
  case notAuthenticated
  case noSuchItem
  case filenameCollision
  case serverUnreachable
  case insufficientQuota
  case offline
  case server(Int)
}

protocol HTTPClient {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionHTTPClient: HTTPClient {
  let session: URLSession
  init(session: URLSession = .shared) { self.session = session }

  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw CozyError.serverUnreachable }
      return (data, http)
    } catch let e as URLError where [.notConnectedToInternet, .cannotFindHost, .timedOut, .networkConnectionLost].contains(e.code) {
      throw CozyError.offline
    }
  }
}
