import Foundation

/// The subset of CozyFilesApi the resolver needs — a seam so it is unit-testable.
protocol MoveConflictOps {
  func move(id: String, toParent parentId: String) async throws -> CozyFile
  func get(_ id: String) async throws -> CozyFile
  func statByPath(_ path: String) async throws -> CozyFile?
  func trash(id: String) async throws
}

extension CozyFilesApi: MoveConflictOps {}

struct ConflictResolver {
  let api: MoveConflictOps

  /// Move with cozy-web's moveEntry semantics: on a 409 collision, trash the
  /// conflicting destination entry then retry once (ports CozyStackApi.move :221-234).
  func move(id: String, toParent parentId: String) async throws -> CozyFile {
    do {
      return try await api.move(id: id, toParent: parentId)
    } catch CozyError.filenameCollision {
      let moving = try await api.get(id)
      let parent = try await api.get(parentId)
      guard let base = parent.path?.trimmedTrailingSlash, !base.isEmpty else {
        throw CozyError.filenameCollision            // can't resolve dest path — surface the collision
      }
      if let conflict = try await api.statByPath("\(base)/\(moving.name)") {
        try await api.trash(id: conflict.id)
      }
      return try await api.move(id: id, toParent: parentId)
    }
  }
}

private extension String {
  var trimmedTrailingSlash: String {
    hasSuffix("/") ? String(dropLast()) : self
  }
}
