import React from 'react'
import { StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5
const DISMISS_TRANSLATION_PX = 150
const DISMISS_VELOCITY = 800

interface Props {
  uri: string
  headers?: Record<string, string>
  placeholderUri?: string | null
  onSingleTap?: () => void
  onDismiss?: () => void
  onLoad?: () => void
  onError?: (err: unknown) => void
}

/**
 * Fullscreen image viewer with native-feeling gestures:
 * - Pinch to zoom (1x → 5x), clamped
 * - Pan to move when zoomed
 * - Single tap → toggles the surrounding UI overlay (via onSingleTap)
 * - Double tap → toggles 1x ↔ 2.5x
 * - Vertical drag at base scale → dismiss (via onDismiss) past threshold
 */
export const ZoomableImage = ({
  uri,
  headers,
  placeholderUri,
  onSingleTap,
  onDismiss,
  onLoad,
  onError
}: Props): React.ReactElement => {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      const next = savedScale.value * e.scale
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.5, next))
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = MIN_SCALE
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else {
        savedScale.value = scale.value
      }
    })

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate(e => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX
        translateY.value = savedTranslateY.value + e.translationY
      } else {
        // Drag-to-dismiss: image follows finger on both axes.
        translateX.value = e.translationX
        translateY.value = e.translationY
      }
    })
    .onEnd(e => {
      if (scale.value > 1) {
        savedTranslateX.value = translateX.value
        savedTranslateY.value = translateY.value
        return
      }
      const dismiss =
        Math.abs(e.translationY) > DISMISS_TRANSLATION_PX ||
        Math.abs(e.velocityY) > DISMISS_VELOCITY
      if (dismiss && onDismiss) {
        runOnJS(onDismiss)()
      } else {
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
      }
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1)
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
        savedScale.value = 1
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE)
        savedScale.value = DOUBLE_TAP_SCALE
      }
    })

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDelay(250)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)()
    })

  const composed = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap)
  )

  // Progress of the drag-to-dismiss interaction. Only meaningful at base
  // scale; clamped 0..1 against the dismiss threshold. Drives the backdrop
  // fade and the image scale-down so the dismissal looks like a modal
  // shrinking into the void rather than a flat slide.
  const dragProgress = useDerivedValue(() => {
    if (scale.value > 1) return 0
    const ratio = Math.abs(translateY.value) / DISMISS_TRANSLATION_PX
    return ratio > 1 ? 1 : ratio
  })

  const backdropStyle = useAnimatedStyle(() => ({
    // Full black at rest; fades all the way to transparent as the drag
    // approaches the dismiss threshold so the underlying modal-host
    // screen shows through.
    backgroundColor: `rgba(0,0,0,${1 - dragProgress.value})`
  }))

  const transformStyle = useAnimatedStyle(() => {
    const dismissScale = scale.value <= 1 ? 1 - 0.15 * dragProgress.value : 1
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value * dismissScale }
      ]
    }
  })

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, transformStyle]}>
          <Image
            source={{ uri, headers }}
            placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
            placeholderContentFit="contain"
            style={styles.image}
            contentFit="contain"
            transition={150}
            onLoad={onLoad}
            onError={onError}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' }
})
