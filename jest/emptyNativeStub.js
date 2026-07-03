// Generic stub for optional cozy-client native modules that this app neither
// installs nor uses (device attestation: Play Integrity, iOS DeviceCheck).
// They are never invoked in tests; this only satisfies module resolution so
// cozy-client can be imported under Jest.
const stub = {}
module.exports = stub
module.exports.default = stub
