// Escape every regex metacharacter so user input matches literally.
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a case-insensitive "contains" pattern STRING for pouchdb-find's `$regex`.
 *
 * Returns a string, NOT a RegExp object. cozy-client serializes the query definition
 * into its (persisted) store, and JSON.stringify turns a RegExp into `{}` — which
 * reaches pouch as `$regex: {}` and matches nothing (the bug the on-device test
 * surfaced; a direct `db.find` test misses it because it skips cozy-client). A string
 * survives serialization. Case-insensitivity is encoded per ASCII letter as `[aA]`,
 * because a plain `new RegExp(string)` — how both pouchdb-find and sift compile
 * `$regex` — cannot carry the `i` flag.
 */
export const buildSearchPattern = (term: string): string =>
  escapeRegExp(term.trim()).replace(/[a-zA-Z]/g, c => `[${c.toLowerCase()}${c.toUpperCase()}]`)
