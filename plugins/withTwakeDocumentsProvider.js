const {
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
} = require('expo/config-plugins')

const AUTHORITY = 'com.linagora.twakedrive.documents'
const PROVIDER = 'com.linagora.twakedrive.fileprovider.TwakeDocumentsProvider'

function addProvider(androidManifest) {
  const app = androidManifest.manifest.application[0]
  app.provider = app.provider || []
  const exists = app.provider.some(p => p.$['android:authorities'] === AUTHORITY)
  if (!exists) {
    app.provider.push({
      $: {
        'android:name': PROVIDER,
        'android:authorities': AUTHORITY,
        'android:exported': 'true',
        'android:grantUriPermissions': 'true',
        'android:permission': 'android.permission.MANAGE_DOCUMENTS',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.content.action.DOCUMENTS_PROVIDER' } }] },
      ],
    })
  }
  return androidManifest
}

function addDependency(src) {
  const dep = 'implementation("androidx.security:security-crypto:1.1.0-alpha06")'
  if (src.includes(dep)) return src
  return src.replace(/dependencies\s*\{/, match => `${match}\n    ${dep}`)
}

function addPackage(src) {
  const reg = 'add(com.linagora.twakedrive.authbridge.TwakeAuthBridgePackage())'
  if (src.includes(reg)) return src
  return src.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{)/,
    `$1\n              ${reg}`
  )
}

module.exports = function withTwakeDocumentsProvider(config) {
  config = withAndroidManifest(config, c => {
    c.modResults = addProvider(c.modResults)
    return c
  })
  config = withAppBuildGradle(config, c => {
    c.modResults.contents = addDependency(c.modResults.contents)
    return c
  })
  config = withMainApplication(config, c => {
    c.modResults.contents = addPackage(c.modResults.contents)
    return c
  })
  return config
}
