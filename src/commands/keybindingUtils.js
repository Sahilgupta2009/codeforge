/**
 * Keybinding string parsing and matching.
 *
 * Keybindings are stored as human-readable strings ("Ctrl+Shift+P",
 * "Ctrl+`") in useSettingsStore.keybindings (see Part 1). This module
 * converts those strings into a normalized descriptor and matches them
 * against incoming key events from the hardware-keyboard listener.
 *
 * IMPORTANT PLATFORM NOTE: React Native's public API surface does not
 * expose a general "global hardware keydown" event on Android the way a
 * browser's `window.addEventListener('keydown', ...)` does — physical
 * keyboard input on Android normally only reaches the currently-focused
 * TextInput's `onKeyPress`. CodeForge's shortcut system therefore works
 * by attaching a key listener to the app's outermost view via
 * react-native's `onKeyPress` where available AND to the code editor's
 * own TextInput (which is very often the focused element during actual
 * coding sessions, where shortcuts matter most). This is documented
 * plainly in KeyboardShortcutListener.js rather than silently pretending
 * full OS-level global capture — see that file for the concrete capture
 * strategy and its known limitation (shortcuts typed while a non-editor
 * TextInput, like the Find box, has focus are captured there directly
 * instead, which is actually the more correct behavior since e.g.
 * Ctrl+A in the Find box should select the find query, not "select all"
 * in the editor).
 */

const MODIFIER_ALIASES = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'ctrl', // Android hardware keyboards report Cmd as Ctrl in practice; treated as equivalent
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
};

/**
 * Parses "Ctrl+Shift+P" into { ctrl: true, shift: true, alt: false, key: 'p' }.
 */
export function parseKeybinding(bindingString) {
  if (!bindingString) return null;
  const parts = bindingString.split('+').map((p) => p.trim());
  const descriptor = { ctrl: false, shift: false, alt: false, key: null };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (MODIFIER_ALIASES[lower]) {
      descriptor[MODIFIER_ALIASES[lower]] = true;
    } else {
      descriptor.key = normalizeKeyName(part);
    }
  }

  return descriptor.key ? descriptor : null;
}

/**
 * Normalizes a key name so both a keybinding string's key portion and an
 * incoming native key event's `key` field compare equal regardless of
 * case or naming convention differences (e.g. "Esc" vs "Escape").
 */
function normalizeKeyName(key) {
  const lower = key.toLowerCase();
  const aliases = {
    esc: 'escape',
    del: 'delete',
    return: 'enter',
    space: ' ',
    '`': '`',
    '-': '-',
    '=': '=',
    '/': '/',
    '\\': '\\',
  };
  return aliases[lower] || lower;
}

/**
 * Compares a parsed keybinding descriptor against a live key event
 * (shape: { key, ctrlKey, shiftKey, altKey }, matching the fields React
 * Native's TextInput onKeyPress nativeEvent provides on Android with a
 * hardware keyboard attached).
 */
export function matchesKeybinding(descriptor, event) {
  if (!descriptor || !event) return false;
  const eventKey = normalizeKeyName(event.key || '');
  return (
    descriptor.key === eventKey &&
    descriptor.ctrl === !!event.ctrlKey &&
    descriptor.shift === !!event.shiftKey &&
    descriptor.alt === !!event.altKey
  );
}

/**
 * Given the full keybindings map (action id -> binding string) and a key
 * event, finds the action id whose binding matches, or null.
 */
export function findMatchingAction(keybindings, event) {
  for (const [actionId, bindingString] of Object.entries(keybindings)) {
    const descriptor = parseKeybinding(bindingString);
    if (matchesKeybinding(descriptor, event)) {
      return actionId;
    }
  }
  return null;
}

/**
 * Formats a descriptor back to a display string (used by the Keybindings
 * settings screen when capturing a new binding from a keypress).
 */
export function formatKeybinding(descriptor) {
  const parts = [];
  if (descriptor.ctrl) parts.push('Ctrl');
  if (descriptor.shift) parts.push('Shift');
  if (descriptor.alt) parts.push('Alt');
  const keyDisplay = descriptor.key === ' ' ? 'Space' : descriptor.key.length === 1 ? descriptor.key.toUpperCase() : capitalize(descriptor.key);
  parts.push(keyDisplay);
  return parts.join('+');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
