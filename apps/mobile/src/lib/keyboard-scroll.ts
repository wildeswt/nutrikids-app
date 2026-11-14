export interface ContainerKeyboardOverlapParams {
  containerY: number;
  containerHeight: number;
  keyboardScreenY: number;
  keyboardHeight: number;
}

export interface FocusedInputScrollParams {
  inputTopInContent: number;
  inputHeight: number;
  currentScrollY: number;
  viewportHeight: number;
  topMargin?: number;
  bottomMargin?: number;
}

const DEFAULT_TOP_MARGIN = 20;
const DEFAULT_BOTTOM_MARGIN = 56;
const MAX_SAFE_BOTTOM_BAR_EXTRA = 100;

/**
 * Calculates how many pixels of the container are covered by the virtual keyboard.
 * Uses window coordinates so it yields 0 when the OS already resizes the window
 * (e.g. Android adjustResize) and the exact overlap when running edge-to-edge.
 */
export function computeContainerKeyboardOverlap({
  containerY,
  containerHeight,
  keyboardScreenY,
  keyboardHeight,
}: ContainerKeyboardOverlapParams): number {
  if (keyboardHeight <= 0) {
    return 0;
  }

  if (containerHeight > 0 && keyboardScreenY > 0) {
    const rawOverlap = Math.max(0, Math.round(containerY + containerHeight - keyboardScreenY));
    // Guard against detached or floating keyboards sitting far above the bottom edge.
    const maxExpectedOverlap = Math.round(keyboardHeight + MAX_SAFE_BOTTOM_BAR_EXTRA);
    return Math.min(rawOverlap, maxExpectedOverlap);
  }

  return Math.max(0, Math.round(keyboardHeight));
}

/**
 * Computes the target vertical scroll offset needed so the focused input stays
 * completely visible above the keyboard without pushing its top edge out of view.
 * Returns null when the input is already comfortably visible inside the viewport.
 */
export function computeFocusedInputScrollY({
  inputTopInContent,
  inputHeight,
  currentScrollY,
  viewportHeight,
  topMargin = DEFAULT_TOP_MARGIN,
  bottomMargin = DEFAULT_BOTTOM_MARGIN,
}: FocusedInputScrollParams): number | null {
  if (viewportHeight <= 0) {
    return null;
  }

  const minScrollYForBottom = inputTopInContent + inputHeight + bottomMargin - viewportHeight;
  const maxScrollYForTop = Math.max(0, inputTopInContent - topMargin);

  if (currentScrollY < minScrollYForBottom) {
    return Math.max(0, Math.round(Math.min(minScrollYForBottom, maxScrollYForTop)));
  }

  if (currentScrollY > maxScrollYForTop) {
    return Math.round(maxScrollYForTop);
  }

  return null;
}
