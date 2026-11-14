import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useKeyboardOverlap } from '../hooks/useKeyboardBottomInset.js';
import { computeFocusedInputScrollY } from '../lib/keyboard-scroll.js';

type ScrollViewInstance = React.ComponentRef<typeof ScrollView>;
type TextInputInstance = React.ComponentRef<typeof TextInput>;

interface MeasurableNode {
  measureLayout?: (
    relativeToNativeNode: unknown,
    onSuccess: (left: number, top: number, width: number, height: number) => void,
    onFail?: () => void,
  ) => void;
}

interface KeyboardAwareContextValue {
  notifyInputFocus: (target: MeasurableNode | null) => void;
  notifyInputBlur: (target: MeasurableNode | null) => void;
}

const KeyboardAwareContext = createContext<KeyboardAwareContextValue | null>(null);

function assignRef<T>(ref: React.ForwardedRef<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object') {
    ref.current = value;
  }
}

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /** Optional style for the outer wrapper View that shrinks above the keyboard. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Minimum top spacing kept above a focused input when scrolling into view. */
  focusTopMargin?: number;
  /** Minimum bottom spacing kept between a focused input and the keyboard top. */
  focusBottomMargin?: number;
}

/**
 * ScrollView container that automatically shrinks above the virtual keyboard on both
 * Android (including edge-to-edge) and iOS, and scrolls the focused input into view.
 */
export const KeyboardAwareScrollView = React.forwardRef<
  ScrollViewInstance,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    children,
    containerStyle,
    style,
    contentContainerStyle,
    focusTopMargin = 20,
    focusBottomMargin = 56,
    onScroll,
    onLayout,
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = 'on-drag',
    showsVerticalScrollIndicator = false,
    scrollEventThrottle = 16,
    ...restProps
  },
  forwardedRef,
) {
  const containerRef = useRef<React.ComponentRef<typeof View>>(null);
  const scrollViewRef = useRef<ScrollViewInstance | null>(null);
  const focusedInputRef = useRef<MeasurableNode | null>(null);
  const currentScrollYRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const { keyboardMetrics, bottomOverlap, updateOverlap } = useKeyboardOverlap(containerRef);
  const keyboardMetricsRef = useRef(keyboardMetrics);
  keyboardMetricsRef.current = keyboardMetrics;

  const setScrollViewRef = useCallback(
    (instance: ScrollViewInstance | null) => {
      scrollViewRef.current = instance;
      assignRef(forwardedRef, instance);
    },
    [forwardedRef],
  );

  const scrollToFocusedInput = useCallback(
    (targetOverride?: MeasurableNode | null) => {
      const metrics = keyboardMetricsRef.current;
      if (!metrics) {
        return;
      }

      const scrollView = scrollViewRef.current;
      if (!scrollView || typeof scrollView.measureInWindow !== 'function') {
        return;
      }

      const fallbackFocused =
        typeof TextInput.State?.currentlyFocusedInput === 'function'
          ? (TextInput.State.currentlyFocusedInput() as unknown as MeasurableNode | undefined)
          : undefined;
      const target = targetOverride ?? focusedInputRef.current ?? fallbackFocused ?? null;

      const innerView = (
        scrollView as unknown as { getInnerViewRef?: () => unknown }
      ).getInnerViewRef?.();

      if (!target || !innerView || typeof target.measureLayout !== 'function') {
        return;
      }

      scrollView.measureInWindow((_sx, svY, _sw, svH) => {
        const viewportHeight =
          metrics.screenY > 0 && metrics.screenY > svY ? Math.min(svH, metrics.screenY - svY) : svH;

        target.measureLayout?.(
          innerView,
          (_left, contentTop, _width, inputHeight) => {
            const nextScrollY = computeFocusedInputScrollY({
              inputTopInContent: contentTop,
              inputHeight,
              currentScrollY: currentScrollYRef.current,
              viewportHeight,
              topMargin: focusTopMargin,
              bottomMargin: focusBottomMargin,
            });

            if (nextScrollY !== null && Math.abs(nextScrollY - currentScrollYRef.current) > 2) {
              scrollView.scrollTo({ y: nextScrollY, animated: true });
            }
          },
          () => {
            // Target may have unmounted or belong to a different ScrollView.
          },
        );
      });
    },
    [focusBottomMargin, focusTopMargin],
  );

  const scheduleScrollToFocusedInput = useCallback(
    (targetOverride?: MeasurableNode | null) => {
      if (typeof requestAnimationFrame !== 'function') {
        scrollToFocusedInput(targetOverride);
        return;
      }
      if (rafIdRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        scrollToFocusedInput(targetOverride);
      });
    },
    [scrollToFocusedInput],
  );

  useEffect(() => {
    if (keyboardMetrics) {
      scheduleScrollToFocusedInput();
    }
  }, [bottomOverlap, keyboardMetrics, scheduleScrollToFocusedInput]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const contextValue = useMemo<KeyboardAwareContextValue>(
    () => ({
      notifyInputFocus: (target) => {
        focusedInputRef.current = target;
        if (keyboardMetricsRef.current) {
          scheduleScrollToFocusedInput(target);
        }
      },
      notifyInputBlur: (target) => {
        if (focusedInputRef.current === target) {
          focusedInputRef.current = null;
        }
      },
    }),
    [scheduleScrollToFocusedInput],
  );

  const handleContainerLayout = useCallback(() => {
    if (keyboardMetricsRef.current) {
      updateOverlap();
    }
  }, [updateOverlap]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      currentScrollYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const handleScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      if (keyboardMetricsRef.current) {
        scheduleScrollToFocusedInput();
      }
    },
    [onLayout, scheduleScrollToFocusedInput],
  );

  return (
    <View
      ref={containerRef}
      style={[styles.container, containerStyle, { paddingBottom: bottomOverlap }]}
      onLayout={handleContainerLayout}
    >
      <KeyboardAwareContext.Provider value={contextValue}>
        <ScrollView
          ref={setScrollViewRef}
          style={[styles.scrollView, style]}
          contentContainerStyle={contentContainerStyle}
          onScroll={handleScroll}
          onLayout={handleScrollViewLayout}
          scrollEventThrottle={scrollEventThrottle}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          {...restProps}
        >
          {children}
        </ScrollView>
      </KeyboardAwareContext.Provider>
    </View>
  );
});

/**
 * Drop-in TextInput replacement that automatically scrolls its enclosing
 * KeyboardAwareScrollView so the input is never covered by the virtual keyboard.
 */
export const KeyboardAwareTextInput = React.forwardRef<TextInputInstance, TextInputProps>(
  function KeyboardAwareTextInput({ onFocus, onBlur, ...props }, forwardedRef) {
    const context = useContext(KeyboardAwareContext);
    const localRef = useRef<TextInputInstance | null>(null);

    const setInputRef = useCallback(
      (instance: TextInputInstance | null) => {
        localRef.current = instance;
        assignRef(forwardedRef, instance);
      },
      [forwardedRef],
    );

    return (
      <TextInput
        ref={setInputRef}
        {...props}
        onFocus={(event) => {
          context?.notifyInputFocus(localRef.current as unknown as MeasurableNode | null);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          context?.notifyInputBlur(localRef.current as unknown as MeasurableNode | null);
          onBlur?.(event);
        }}
      />
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
});
