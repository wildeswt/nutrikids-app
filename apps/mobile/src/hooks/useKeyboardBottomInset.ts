import { useCallback, useEffect, useState, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent, type View } from 'react-native';
import { computeContainerKeyboardOverlap } from '../lib/keyboard-scroll.js';

export interface KeyboardFrameMetrics {
  height: number;
  screenY: number;
  duration?: number;
}

function animateKeyboardTransitionIfSupported(duration?: number): void {
  if (
    Platform.OS === 'ios' &&
    duration &&
    duration > 0 &&
    typeof LayoutAnimation?.configureNext === 'function'
  ) {
    const safeDuration = Math.max(duration, 10);
    LayoutAnimation.configureNext({
      duration: safeDuration,
      update: {
        duration: safeDuration,
        type: 'keyboard',
      },
    });
  }
}

/**
 * Tracks the active virtual keyboard frame metrics across iOS and Android.
 * Returns null when the keyboard is hidden.
 */
export function useKeyboardMetrics(): KeyboardFrameMetrics | null {
  const [metrics, setMetrics] = useState<KeyboardFrameMetrics | null>(() => {
    const current = typeof Keyboard.metrics === 'function' ? Keyboard.metrics() : undefined;
    if (current && current.height > 0) {
      return { height: current.height, screenY: current.screenY };
    }
    return null;
  });

  useEffect(() => {
    const handleShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      const screenY = event.endCoordinates?.screenY ?? 0;
      if (height <= 0) {
        setMetrics(null);
        return;
      }
      setMetrics({
        height,
        screenY,
        duration: event.duration,
      });
    };

    const handleHide = (event: KeyboardEvent) => {
      animateKeyboardTransitionIfSupported(event?.duration);
      setMetrics(null);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, handleShow);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return metrics;
}

/**
 * Hook that detects the active keyboard height and returns it as a bottom inset.
 * On Android, where Expo/edge-to-edge does not resize the Activity window,
 * this inset provides the exact height needed so containers can avoid the keyboard.
 */
export function useKeyboardBottomInset(): number {
  const metrics = useKeyboardMetrics();
  return metrics?.height ?? 0;
}

/**
 * Computes the exact bottom padding needed for a specific container View
 * so its bottom edge stops right above the active virtual keyboard.
 */
export function useKeyboardOverlap(
  containerRef: RefObject<React.ComponentRef<typeof View> | null>,
): {
  keyboardMetrics: KeyboardFrameMetrics | null;
  bottomOverlap: number;
  updateOverlap: () => void;
} {
  const keyboardMetrics = useKeyboardMetrics();
  const [bottomOverlap, setBottomOverlap] = useState(0);

  const updateOverlap = useCallback(() => {
    if (!keyboardMetrics) {
      setBottomOverlap(0);
      return;
    }

    const container = containerRef.current;
    if (container && typeof container.measureInWindow === 'function') {
      container.measureInWindow((_x, y, _width, height) => {
        const nextOverlap = computeContainerKeyboardOverlap({
          containerY: y,
          containerHeight: height,
          keyboardScreenY: keyboardMetrics.screenY,
          keyboardHeight: keyboardMetrics.height,
        });
        animateKeyboardTransitionIfSupported(keyboardMetrics.duration);
        setBottomOverlap(nextOverlap);
      });
      return;
    }

    animateKeyboardTransitionIfSupported(keyboardMetrics.duration);
    setBottomOverlap(Math.max(0, Math.round(keyboardMetrics.height)));
  }, [containerRef, keyboardMetrics]);

  useEffect(() => {
    updateOverlap();
  }, [updateOverlap]);

  return { keyboardMetrics, bottomOverlap, updateOverlap };
}
