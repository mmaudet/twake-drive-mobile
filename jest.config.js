// We intentionally do not use `preset: 'jest-expo'` here because Jest appends
// our setupFiles AFTER the preset's, which is too late: jest-expo's setup.js
// requires expo/src/winter which calls `installFormDataPatch(FormData)` — a bare
// reference to the global `FormData` that Node 16 does not define.  By inlining
// the preset and prepending our polyfill we ensure `global.FormData` exists first.
module.exports = {
  haste: {
    defaultPlatform: 'ios',
    platforms: ['android', 'ios', 'native'],
  },
  resolver: require.resolve('react-native/jest/resolver.js'),
  transform: {
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve('react-native/jest/assetFileTransformer.js'),
    '\\.[jt]sx?$': ['babel-jest', { caller: { name: 'metro', bundler: 'metro', platform: 'ios' } }],
    '^.+\\.(bmp|gif|jpg|jpeg|png|psd|svg|webp|xml|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|yaml|yml|otf|ttf|zip|heic|avif|db)$': require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  testEnvironment: require.resolve('react-native/jest/react-native-env.js'),
  setupFiles: [
    '<rootDir>/jest/globalPolyfills.js',
    require.resolve('react-native/jest/setup.js'),
    require.resolve('jest-expo/src/preset/setup.js'),
  ],
  setupFilesAfterEnv: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@gorhom/bottom-sheet|react-native-paper))',
    '/node_modules/react-native-reanimated/plugin/'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(docx|xlsx|pptx)$': '<rootDir>/jest/binaryStub.js',
    '^react-native-vector-icons/.*$': '<rootDir>/jest/vectorIconsStub.js',
    '^react-native-inappbrowser-reborn$': '<rootDir>/jest/inappBrowserStub.js',
    '^react-native-ios11-devicecheck$': '<rootDir>/jest/emptyNativeStub.js',
    '^react-native-google-play-integrity$': '<rootDir>/jest/emptyNativeStub.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  // Cold CI runners pay the heavy cozy-client import chain on a suite's first
  // test; jest's 5s default times out there (passes locally). 20s absorbs it.
  testTimeout: 20000,
  // Keep setImmediate real so that flush() helpers in tests work correctly with
  // jest.useFakeTimers().  Node 16 does not fake setImmediate via modern timers
  // by default in some configurations; making it explicit avoids hangs.
  fakeTimers: {
    doNotFake: ['setImmediate', 'clearImmediate'],
  },
}
