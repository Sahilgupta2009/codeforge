/**
 * Shared layout metrics between CodeEditor's real (invisible-text)
 * TextInput and its syntax-highlight overlay. Both layers MUST use
 * identical font family/size/line-height or the overlay will visually
 * drift from the actual cursor position — so every constant that affects
 * text metrics lives here, computed once from settings, and is passed
 * to both layers rather than each computing its own.
 */

export function getEditorMetrics({ fontSize, zoomLevel, lineHeightMultiplier }) {
  const effectiveFontSize = clamp(fontSize + zoomLevel, 9, 40);
  const lineHeight = Math.round(effectiveFontSize * lineHeightMultiplier);
  return {
    fontSize: effectiveFontSize,
    lineHeight,
    // Monospace character width is a fixed ratio of font size for the
    // system monospace font on Android (~0.6 for most monospace faces);
    // used to position the minimap and to compute column-from-x-offset
    // for tap-to-place-cursor.
    charWidth: effectiveFontSize * 0.6,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const GUTTER_MIN_WIDTH = 40;
export const GUTTER_CHAR_WIDTH_RATIO = 0.62;
export const MINIMAP_WIDTH = 60;
export const MINIMAP_LINE_HEIGHT = 2;
export const OVERSCAN_LINES = 20; // extra lines rendered above/below viewport
