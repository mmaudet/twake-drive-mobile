import Foundation

/// URLProtocol that returns canned responses. Set `requestHandler` per test.
final class MockURLProtocol: URLProtocol {
  /// (status, headers, body) for a given request; also records the request for assertions.
  static var requestHandler: ((URLRequest) throws -> (Int, [String: String], Data))?
  static private(set) var recorded: [URLRequest] = []

  static func reset() { requestHandler = nil; recorded = [] }
  static func session() -> URLSession {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: cfg)
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    MockURLProtocol.recorded.append(request)
    guard let handler = MockURLProtocol.requestHandler else {
      client?.urlProtocol(self, didFailWithError: CocoaError(.featureUnsupported)); return
    }
    do {
      let (status, headers, body) = try handler(request)
      let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }
  override func stopLoading() {}
}
