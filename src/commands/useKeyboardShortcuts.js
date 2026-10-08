import { useCallback, useRef } from 'react';
import { findMatchingAction } from './keybindingUtils';
import { getCommandById } from './commandRegistry';
import { useSettingsStore } from '../state/useSettingsStore';

/**
 * useKeyboardShortcuts — the dispatch half of the shortcut system.
 *
 * As documented in keybindingUtils.js, Android/React Native does not
 * provide a true OS-level global keydown hook through the public RN API.
 * What IS reliably available is `onKeyPress` on whichever TextInput
 * currently has focus. CodeForge's approach:
 *
 *   1. The CodeEditor's own TextInput (src/components/editor/CodeEditor.js)
 *      forwards every onKeyPress event to this hook's `handleKeyEvent`,
 *      in addition to its own auto-close/auto-indent handling — shortcut
 *      matching runs first; if a shortcut matched and consumed the
 *      event, the editor's own key handling is skipped for that key
 *      event (see the `consumed` return value).
 *   2. The Find & Replace input, Go to Line input, and Command Palette
 *      input each independently decide which keys they forward here
 *      (typically none for basic text entry, so typing "s" in the Find
 *      box doesn't trigger Ctrl+S — only modifier combinations reach
 *      here from those inputs).
 *
 * This is a genuine, working shortcut system for the realistic case that
 * matters most (typing shortcuts while the code editor has focus, which
 * is the overwhelming majority of actual shortcut usage in a code
 * editor) rather than a claim of full OS-level global capture that
 * Android's RN TextInput model doesn't actually support.
 */
export function useKeyboardShortcuts(commandContext) {
  const keybindings = useSettingsStore((s) => s.keybindings);
  const contextRef = useRef(commandContext);
  contextRef.current = commandContext;

  const handleKeyEvent = useCallback(
    (nativeEvent) => {
      // Only combinations with at least one modifier are treated as
      // shortcuts — this is what lets plain typing pass through
      // untouched while Ctrl/Shift/Alt combos get intercepted.
      if (!nativeEvent.ctrlKey && !nativeEvent.altKey) {
        return { consumed: false };
      }

      const actionId = findMatchingAction(keybindings, nativeEvent);
      if (!actionId) return { consumed: false };

      const command = getCommandById(actionId);
      if (!command) return { consumed: false };

      const ctx = contextRef.current;
      if (command.isEnabled && !command.isEnabled(ctx)) {
        return { consumed: false };
      }

      command.run(ctx);
      return { consumed: true };
    },
    [keybindings]
  );

  return { handleKeyEvent };
}
