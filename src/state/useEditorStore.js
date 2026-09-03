import { create } from 'zustand';
import uuid from 'react-native-uuid';

/**
 * @typedef {Object} EditorTab
 * @property {string} id
 * @property {string} uri            SAF/sandbox URI of the backing file
 * @property {string} name           Display file name
 * @property {string} language       Detected language id (see editor/languages.js)
 * @property {string} content        Current in-memory content
 * @property {string} savedContent   Last-saved content, for dirty checking
 * @property {boolean} isDirty
 * @property {boolean} isPreview     "Preview mode" tabs (single click) get replaced;
 *                                    double-click/edit "pins" them.
 * @property {{line:number, column:number}} cursor
 * @property {Array<{start:number,end:number}>} selections
 * @property {number[]} foldedLines  Line numbers that are currently folded
 * @property {Array} undoStack
 * @property {Array} redoStack
 */

function createTab({ uri, name, language, content }) {
  return {
    id: uuid.v4(),
    uri,
    name,
    language,
    content,
    savedContent: content,
    isDirty: false,
    isPreview: true,
    cursor: { line: 0, column: 0 },
    selections: [],
    foldedLines: [],
    undoStack: [],
    redoStack: [],
    scrollOffset: 0,
  };
}

/**
 * Panes support the split-editor feature. Each pane has its own tab list
 * and active tab, mirroring VS Code's editor groups.
 */
function createPane(id) {
  return { id, tabs: [], activeTabId: null };
}

export const useEditorStore = create((set, get) => ({
  panes: [createPane('pane-1')],
  activePaneId: 'pane-1',
  splitDirection: null, // null | 'horizontal' | 'vertical'

  getActivePane: () => {
    const state = get();
    return state.panes.find((p) => p.id === state.activePaneId) || state.panes[0];
  },

  getActiveTab: () => {
    const pane = get().getActivePane();
    if (!pane) return null;
    return pane.tabs.find((t) => t.id === pane.activeTabId) || null;
  },

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  openFile: ({ uri, name, language, content }, { paneId, preview = true } = {}) =>
    set((state) => {
      const targetPaneId = paneId || state.activePaneId;
      const panes = state.panes.map((pane) => {
        if (pane.id !== targetPaneId) return pane;

        const existing = pane.tabs.find((t) => t.uri === uri);
        if (existing) {
          return { ...pane, activeTabId: existing.id };
        }

        const newTab = createTab({ uri, name, language, content });
        newTab.isPreview = preview;

        // If there's already a preview tab (single-tap open), replace it
        // instead of stacking tabs, matching VS Code's "peek" tab behavior.
        const previewIndex = pane.tabs.findIndex((t) => t.isPreview);
        let tabs;
        if (preview && previewIndex !== -1) {
          tabs = [...pane.tabs];
          tabs[previewIndex] = newTab;
        } else {
          tabs = [...pane.tabs, newTab];
        }

        return { ...pane, tabs, activeTabId: newTab.id };
      });
      return { panes, activePaneId: targetPaneId };
    }),

  pinTab: (paneId, tabId) =>
    set((state) => ({
      panes: state.panes.map((pane) =>
        pane.id !== paneId
          ? pane
          : {
              ...pane,
              tabs: pane.tabs.map((t) => (t.id === tabId ? { ...t, isPreview: false } : t)),
            }
      ),
    })),

  closeTab: (paneId, tabId) =>
    set((state) => {
      const panes = state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        const tabs = pane.tabs.filter((t) => t.id !== tabId);
        let activeTabId = pane.activeTabId;
        if (activeTabId === tabId) {
          const closedIndex = pane.tabs.findIndex((t) => t.id === tabId);
          const fallback = tabs[closedIndex] || tabs[closedIndex - 1] || tabs[0];
          activeTabId = fallback ? fallback.id : null;
        }
        return { ...pane, tabs, activeTabId };
      });
      return { panes };
    }),

  closeOtherTabs: (paneId, keepTabId) =>
    set((state) => ({
      panes: state.panes.map((pane) =>
        pane.id !== paneId
          ? pane
          : { ...pane, tabs: pane.tabs.filter((t) => t.id === keepTabId), activeTabId: keepTabId }
      ),
    })),

  closeAllTabs: (paneId) =>
    set((state) => ({
      panes: state.panes.map((pane) =>
        pane.id !== paneId ? pane : { ...pane, tabs: [], activeTabId: null }
      ),
    })),

  setActiveTab: (paneId, tabId) =>
    set((state) => ({
      panes: state.panes.map((pane) => (pane.id !== paneId ? pane : { ...pane, activeTabId: tabId })),
    })),

  updateTabContent: (paneId, tabId, content) =>
    set((state) => ({
      panes: state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        return {
          ...pane,
          tabs: pane.tabs.map((t) =>
            t.id !== tabId
              ? t
              : { ...t, content, isDirty: content !== t.savedContent, isPreview: false }
          ),
        };
      }),
    })),

  markTabSaved: (paneId, tabId) =>
    set((state) => ({
      panes: state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        return {
          ...pane,
          tabs: pane.tabs.map((t) =>
            t.id !== tabId ? t : { ...t, savedContent: t.content, isDirty: false }
          ),
        };
      }),
    })),

  updateTabCursor: (paneId, tabId, cursor) =>
    set((state) => ({
      panes: state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        return { ...pane, tabs: pane.tabs.map((t) => (t.id !== tabId ? t : { ...t, cursor })) };
      }),
    })),

  toggleFold: (paneId, tabId, lineNumber) =>
    set((state) => ({
      panes: state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        return {
          ...pane,
          tabs: pane.tabs.map((t) => {
            if (t.id !== tabId) return t;
            const folded = t.foldedLines.includes(lineNumber)
              ? t.foldedLines.filter((l) => l !== lineNumber)
              : [...t.foldedLines, lineNumber];
            return { ...t, foldedLines: folded };
          }),
        };
      }),
    })),

  reorderTabs: (paneId, fromIndex, toIndex) =>
    set((state) => ({
      panes: state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        const tabs = [...pane.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, moved);
        return { ...pane, tabs };
      }),
    })),

  // --- Split editor ---

  splitPane: (direction = 'horizontal') =>
    set((state) => {
      if (state.panes.length >= 2) return state; // Cap at 2 panes for mobile screens
      const activePane = state.panes.find((p) => p.id === state.activePaneId);
      const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId);
      const newPane = createPane('pane-2');
      // Carry the current file into the new pane for immediate side-by-side editing
      if (activeTab) {
        const clonedTab = { ...activeTab, id: uuid.v4() };
        newPane.tabs = [clonedTab];
        newPane.activeTabId = clonedTab.id;
      }
      return {
        panes: [...state.panes, newPane],
        splitDirection: direction,
        activePaneId: newPane.id,
      };
    }),

  closeSplit: (paneId) =>
    set((state) => {
      if (state.panes.length <= 1) return state;
      const panes = state.panes.filter((p) => p.id !== paneId);
      return {
        panes,
        splitDirection: null,
        activePaneId: panes[0].id,
      };
    }),

  // --- Zoom ---
  zoomLevel: 0, // relative steps applied to base font size

  zoomIn: () => set((state) => ({ zoomLevel: Math.min(state.zoomLevel + 1, 18) })),
  zoomOut: () => set((state) => ({ zoomLevel: Math.max(state.zoomLevel - 1, -5) })),
  resetZoom: () => set({ zoomLevel: 0 }),
}));
