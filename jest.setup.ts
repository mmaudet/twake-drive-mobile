import '@testing-library/react-native/extend-expect'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: {
    SUCCESS: 'success',
    CANCEL: 'cancel',
    DISMISS: 'dismiss'
  }
}))

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr', languageTag: 'fr-FR' }]
}))
