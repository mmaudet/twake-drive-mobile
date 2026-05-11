module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            'pouchdb-collate': '@craftzdog/pouchdb-collate-react-native',
            crypto: 'react-native-quick-crypto',
            stream: 'readable-stream',
            buffer: '@craftzdog/react-native-buffer'
          },
          extensions: [
            '.ios.js',
            '.android.js',
            '.native.js',
            '.js',
            '.jsx',
            '.json',
            '.ts',
            '.tsx'
          ]
        }
      ],
      'react-native-worklets/plugin'
    ]
  }
}
