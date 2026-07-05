import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Real react-i18next is used (not mocked) so the confirm button shows the
// actual "Import here" copy. expo-localization is globally mocked to `fr`
// in jest.setup.ts, so the active language must be forced to English here —
// otherwise `t('drive.import.confirm')` resolves to the French string.
import i18n from '@/i18n'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()

// expo-router isn't globally mocked in this repo (see app/metadata/[fileId].test.tsx);
// each suite mocks it locally. Stack is never actually rendered here — ImportLayout
// is given `children`, which short-circuits the `children ?? <Stack .../>` fallback.
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => true
  })
}))

// The real cozy-client package does not work under this Jest environment
// (see FolderPicker.test.tsx / metadata/[fileId].test.tsx for the same
// pattern) — useClient() throws without it, so it is always mocked locally.
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({})
}))

// See mockBack/mockPush note above re: the `mock`-prefix hoisting requirement.
const mockUploadBatch = jest.fn()
jest.mock('@/share/uploadBatch', () => ({
  uploadBatch: (...a: unknown[]) => mockUploadBatch(...a)
}))
jest.mock('@/share/PendingShareProvider', () => ({
  usePendingShare: () => ({
    items: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }],
    clear: jest.fn()
  })
}))
// FolderPicker is exercised elsewhere; stub it to a confirm button that hands back a folder.
jest.mock('@/ui/FolderPicker', () => {
  const { Button } = require('react-native-paper')
  return {
    FolderPicker: ({ onConfirm, confirmLabel }: any) => (
      <Button onPress={() => onConfirm({ _id: 'dest1', name: 'Docs' })}>{confirmLabel}</Button>
    )
  }
})

import ImportLayout from './_layout'
import { ImportScreen } from './_ImportScreen'

// PaperProvider: ImportLayout renders a real react-native-paper Snackbar.
// SafeAreaProvider: Snackbar reads safe-area insets via useSafeAreaInsets,
// which throws without a provider ancestor (see AppBar.test.tsx).
const wrap = () =>
  render(
    <PaperProvider>
      <SafeAreaProvider>
        <ImportLayout>
          <ImportScreen pathSegments={[]} />
        </ImportLayout>
      </SafeAreaProvider>
    </PaperProvider>
  )

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => mockUploadBatch.mockReset())

test('confirming a destination uploads the pending items there', async () => {
  mockUploadBatch.mockResolvedValueOnce({ results: [], succeeded: 1, failed: 0 })
  const { getByText } = wrap()
  fireEvent.press(getByText('Import here'))
  await waitFor(() => expect(mockUploadBatch).toHaveBeenCalledTimes(1))
  const [, items, dirId] = mockUploadBatch.mock.calls[0]
  expect(items).toEqual([{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }])
  expect(dirId).toBe('dest1')
})
