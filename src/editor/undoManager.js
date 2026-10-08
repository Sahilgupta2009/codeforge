/**
 * Undo/redo history manager.
 *
 * Uses debounced content snapshots rather than per-keystroke diffs: every
 * edit updates a "pending" snapshot, and a snapshot is only pushed onto
 * the undo stack once typing pauses (default 400ms) or a "hard boundary"
 * action occurs (paste, find & replace, formatting, or explicit
 * Undo/Redo themselves). This mirrors how VS Code/Sublime group rapid
 * typing into single undo steps rather than undoing one character at a
 * time, which is what users actually expect.
 *
 * This module is intentionally UI-agnostic — it holds no React state,
 * just stacks of {content, cursor} snapshots — so CodeEditor.js drives it
 * and useEditorStore.js persists the resulting stacks per-tab.
 */

const DEFAULT_DEBOUNCE_MS = 400;
const MAX_HISTORY_SIZE = 200;

export function createUndoManager({ debounceMs = DEFAULT_DEBOUNCE_MS } = {}) {
  let pendingTimer = null;

  return {
    /**
     * Called on every content change. Pushes the *previous* state onto
     * the undo stack once the debounce window elapses without further
     * edits, and always clears the redo stack (a fresh edit invalidates
     * any redo history, matching standard editor behavior).
     *
     * @param {{undoStack: Array, redoStack: Array}} tab
     * @param {{content: string, cursor: object}} previousState
     * @param {(next: {undoStack: Array, redoStack: Array}) => void} commit
     */
    recordChange(tab, previousState, commit) {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        const undoStack = [...tab.undoStack, previousState].slice(-MAX_HISTORY_SIZE);
        commit({ undoStack, redoStack: [] });
        pendingTimer = null;
      }, debounceMs);
    },

    /**
     * Forces any pending debounced snapshot to commit immediately —
     * called before a "hard boundary" action (paste, format, explicit
     * save) so that action starts its own clean undo step rather than
     * being merged into whatever the user was mid-typing.
     */
    flush(tab, previousState, commit) {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
        const undoStack = [...tab.undoStack, previousState].slice(-MAX_HISTORY_SIZE);
        commit({ undoStack, redoStack: [] });
      }
    },

    /**
     * Pops the most recent snapshot off the undo stack, pushes the
     * *current* state onto the redo stack, and returns the snapshot to
     * restore. Returns null if there's nothing to undo.
     */
    undo(tab, currentState) {
      if (tab.undoStack.length === 0) return null;
      const undoStack = [...tab.undoStack];
      const restored = undoStack.pop();
      const redoStack = [...tab.redoStack, currentState].slice(-MAX_HISTORY_SIZE);
      return { restored, undoStack, redoStack };
    },

    /**
     * Pops the most recent snapshot off the redo stack, pushes the
     * *current* state back onto the undo stack, and returns the
     * snapshot to restore. Returns null if there's nothing to redo.
     */
    redo(tab, currentState) {
      if (tab.redoStack.length === 0) return null;
      const redoStack = [...tab.redoStack];
      const restored = redoStack.pop();
      const undoStack = [...tab.undoStack, currentState].slice(-MAX_HISTORY_SIZE);
      return { restored, undoStack, redoStack };
    },

    cancelPending() {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    },
  };
}
