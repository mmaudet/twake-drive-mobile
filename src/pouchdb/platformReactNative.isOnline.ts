import NetInfo from '@react-native-community/netinfo'

let currentState: boolean | undefined

export const isOnline = async (): Promise<boolean> => {
  if (currentState === undefined) {
    const state = await NetInfo.fetch()
    currentState = state.isConnected ?? true
    NetInfo.addEventListener(s => {
      currentState = s.isConnected ?? true
    })
  }
  return currentState
}
