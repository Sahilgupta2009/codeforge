import { create } from 'zustand';

/**
 * Bridges the currently-mounted CodeEditor instance's imperative
 * undo/redo (and, later, format-document / comment-toggle) handlers to
 * any UI that needs to trigger them — EditorToolbar, the command palette
 * (Part 4), and hardware keyboard shortcuts (Part 4) — without prop-
 * drilling through every intermediate component or relying on a
 * non-reactive static object.
 *
 * Each CodeEditor instance registers its handlers under its tab id on
 * mount and unregisters on unmount. Consumers look up handlers by tab id
 * via a real Zustand selector, so they re-render correctly if the
 * registration changes (e.g. switching tabs re-registers a different
 * instance).
 */
export const useEditorHandlersStore = create((set, get) => ({
  handlersByTabId: {},

  registerHandlers: (tabId, handlers) =>
    set((state) => ({
      handlersByTabId: { ...state.handlersByTabId, [tabId]: handlers },
    })),

  unregisterHandlers: (tabId) =>
    set((state) => {
      const next = { ...state.handlersByTabId };
      delete next[tabId];
      return { handlersByTabId: next };
    }),

  getHandlers: (tabId) => get().handlersByTabId[tabId] || null,
}));
