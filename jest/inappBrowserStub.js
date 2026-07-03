// Stub for react-native-inappbrowser-reborn.
//
// cozy-client's `mobile.native.js` auth path imports this module, but Twake
// Drive uses its own OIDC flow (see src/auth/registerSession.ts), so it is
// never invoked in tests. The package isn't a dependency; this stub just
// satisfies module resolution so cozy-client can be imported under Jest.
const InAppBrowser = {
  isAvailable: () => Promise.resolve(false),
  open: () => Promise.resolve({ type: 'cancel' }),
  openAuth: () => Promise.resolve({ type: 'cancel' }),
  close: () => {},
  closeAuth: () => {},
}

module.exports = InAppBrowser
module.exports.InAppBrowser = InAppBrowser
module.exports.default = InAppBrowser
