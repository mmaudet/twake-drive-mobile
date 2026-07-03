// Escape every regex metacharacter so user input matches literally.
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a case-insensitive "contains" matcher for a search term.
 *
 * Returns a RegExp (NOT a pattern string): pouchdb-selector-core evaluates
 * `$regex` via `new RegExp(userValue)`, which preserves the flags of a RegExp
 * argument — a `(?i)` inline-flag string would throw in JS. sift (cozy-client's
 * in-memory evaluator) accepts a RegExp too.
 */
export const buildSearchRegex = (term: string): RegExp => new RegExp(escapeRegExp(term.trim()), 'i')
