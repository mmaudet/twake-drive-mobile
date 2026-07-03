/**
 * Real integration check for the file-search query — runs it against a REAL
 * PouchDB (pouchdb-find), in plain Node.
 *
 * Why a standalone script and not a jest test: the app's babel config
 * (babel.config.js) aliases the pouch native deps — `pouchdb-collate` →
 * `@craftzdog/pouchdb-collate-react-native`, `crypto` → `react-native-quick-crypto`,
 * `buffer`/`stream` → RN variants — and jest.setup.ts mocks those native modules to
 * `{}`. So pouch's real internals cannot run inside the jest environment. In plain
 * Node none of that applies, so the real pouchdb-find engine runs unmodified.
 *
 * What is real here: the actual pouchdb-find `db.find()` pipeline (index scan +
 * in-memory `$regex` match, `$ne`/`$nin` filters, sort, limit) over real documents —
 * with the selector JSON-round-tripped first to mirror cozy-client's store
 * serialization (the layer that broke the original RegExp-object version on device).
 * The selector matches what `searchFilesQuery` builds (src/client/searchFilesQuery.test.ts)
 * and the pattern matches what `buildSearchPattern` builds (src/search/buildSearchPattern.test.ts).
 *
 * Run: `node scripts/search-integration.cjs`  (also: `npm run test:integration`)
 */
'use strict'

const assert = require('assert')

const PouchDB = require('pouchdb-core')
  .plugin(require('pouchdb-adapter-memory'))
  .plugin(require('pouchdb-mapreduce'))
  .plugin(require('pouchdb-find'))

// Mirrors src/search/buildSearchPattern.ts (unit-tested there): escape every regex
// metacharacter, then encode case-insensitivity per ASCII letter as [aA]. Returns a
// STRING (not a RegExp) so it survives cozy-client's store serialization (see below).
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const buildSearchPattern = term =>
  escapeRegExp(term.trim()).replace(/[a-zA-Z]/g, c => `[${c.toLowerCase()}${c.toUpperCase()}]`)

// Selector exactly as searchFilesQuery builds it (see src/client/queries.ts):
const HIDDEN_ROOT_DIR_IDS = ['io.cozy.files.shared-drives-dir', 'io.cozy.files.trash-dir']
const selectorFor = term => ({
  name: { $regex: buildSearchPattern(term) },
  trashed: { $ne: true },
  _id: { $nin: HIDDEN_ROOT_DIR_IDS }
})

const LIMIT = 50

let dbCounter = 0
async function search(docs, term) {
  const db = new PouchDB(`search-integration-${dbCounter++}`, { adapter: 'memory' })
  try {
    await db.bulkDocs(docs)
    // Round-trip the selector through JSON to mirror cozy-client, which serializes the
    // query definition into its persisted store. A RegExp object would become {} here
    // (matching nothing — the on-device bug); the string pattern survives.
    const selector = JSON.parse(JSON.stringify(selectorFor(term)))
    // No sort / no index at the DB level — mirrors searchFilesQuery. Sorting a $regex
    // query at the DB level errors ("Cannot sort…") and hangs pouch on device; the
    // screen sorts by name in JS, so do the same here.
    const res = await db.find({ selector, limit: LIMIT })
    return res.docs
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(d => d._id)
  } finally {
    await db.destroy()
  }
}

const CASES = [
  {
    name: 'case-insensitive filename match; excludes trashed + hidden root dirs',
    term: 'report',
    unordered: true,
    docs: [
      { _id: 'f1', name: 'Q3 REPORT.pdf', type: 'file', trashed: false, dir_id: 'd0' },
      { _id: 'f2', name: 'annual report 2024.docx', type: 'file', trashed: false, dir_id: 'd0' },
      { _id: 'f3', name: 'budget.xlsx', type: 'file', trashed: false, dir_id: 'd0' },
      { _id: 'f4', name: 'old report.txt', type: 'file', trashed: true, dir_id: 'd0' },
      { _id: 'io.cozy.files.shared-drives-dir', name: 'report container', type: 'directory' }
    ],
    // sorted by name asc: 'Q3 REPORT.pdf' (Q=0x51) < 'annual report...' (a=0x61)
    expect: ['f1', 'f2']
  },
  {
    name: 'regex metacharacters escaped — "a.b" matches only the literal dot',
    term: 'a.b',
    docs: [
      { _id: 'lit', name: 'a.b.txt', type: 'file', trashed: false, dir_id: 'd0' },
      { _id: 'wild', name: 'aXb.txt', type: 'file', trashed: false, dir_id: 'd0' }
    ],
    expect: ['lit']
  },
  {
    name: 'results sorted by name ascending',
    term: 'report',
    docs: [
      { _id: 'c', name: 'car report', type: 'file', trashed: false, dir_id: 'd0' },
      { _id: 'a', name: 'apple report', type: 'file', trashed: false, dir_id: 'd0' },
      { _id: 'b', name: 'box report', type: 'file', trashed: false, dir_id: 'd0' }
    ],
    expect: ['a', 'b', 'c']
  }
]

async function main() {
  let passed = 0
  for (const c of CASES) {
    const ids = await search(c.docs, c.term)
    const actual = c.unordered ? ids.slice().sort() : ids
    const expected = c.unordered ? c.expect.slice().sort() : c.expect
    assert.deepStrictEqual(actual, expected, `${c.name}\n  expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(ids)}`)
    console.log(`  ✓ ${c.name}\n      -> [${ids.join(', ')}]`)
    passed++
  }

  // Limit: 60 matching docs -> capped at 50.
  const many = Array.from({ length: 60 }, (_, i) => ({
    _id: `r${String(i).padStart(2, '0')}`,
    name: `report ${String(i).padStart(2, '0')}`,
    type: 'file',
    trashed: false,
    dir_id: 'd0'
  }))
  const capped = await search(many, 'report')
  assert.strictEqual(capped.length, LIMIT, `limit: expected ${LIMIT}, got ${capped.length}`)
  console.log(`  ✓ caps results at ${LIMIT} (had 60 matches)\n      -> ${capped.length} results`)
  passed++

  console.log(`\n✅ ${passed}/${CASES.length + 1} search-query integration checks passed against a real PouchDB (pouchdb-find).`)
}

main().catch(err => {
  console.error(`\n✗ FAIL: ${err.message}`)
  process.exit(1)
})
