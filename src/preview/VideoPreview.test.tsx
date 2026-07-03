import React from 'react'
import { render } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: mockPush, canGoBack: () => true })
}))

const captured: { onStart?: () => void; onStop?: () => void } = {}

jest.mock('expo-video', () => ({
  __esModule: true,
  VideoView: (props: {
    onPictureInPictureStart?: () => void
    onPictureInPictureStop?: () => void
  }) => {
    captured.onStart = props.onPictureInPictureStart
    captured.onStop = props.onPictureInPictureStop
    return null
  },
  useVideoPlayer: jest.fn()
}))

import { PiPSessionContext, PiPSessionContextValue } from './PiPSession'
import { VideoPreview } from './VideoPreview'

const mockClaim = jest.fn()
const mockRelease = jest.fn()

const makePlayer = (playing: boolean) => ({
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn(),
  playing,
  loop: false,
  staysActiveInBackground: false,
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
})

const wrap = (ui: React.ReactElement, playing = true) => {
  const ctxValue: PiPSessionContextValue = {
    active: null,
    player: makePlayer(playing) as unknown as PiPSessionContextValue['player'],
    claim: mockClaim,
    release: mockRelease
  }
  return <PiPSessionContext.Provider value={ctxValue}>{ui}</PiPSessionContext.Provider>
}

describe('VideoPreview', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPush.mockReset()
    mockClaim.mockReset()
    mockRelease.mockReset()
    captured.onStart = undefined
    captured.onStop = undefined
  })

  it('dismisses the modal when PiP starts', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStart!()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('re-pushes the preview route when PiP stops (restore or close)', async () => {
    // We always re-push on stop because expo-video does not let us tell
    // restore vs close apart reliably — see VideoPreview.tsx for the
    // rationale. The push is deferred one tick to let iOS finish its
    // PiP teardown.
    render(
      wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />, true)
    )
    captured.onStop!()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockPush).toHaveBeenCalledWith('/preview/f1')
  })

  it('still re-pushes on PiP stop when the player is paused', async () => {
    render(
      wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />, false)
    )
    captured.onStop!()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockPush).toHaveBeenCalledWith('/preview/f1')
  })
})
