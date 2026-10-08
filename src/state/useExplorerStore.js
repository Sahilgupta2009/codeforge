import { create } from 'zustand';

/**
 * UI-only state for the File Explorer: which item is selected/long-pressed
 * (for the context menu), clipboard contents for copy/cut + paste, and
 * which modal dialog (create/rename/delete confirm) is currently open.
 *
 * Tree expand/collapse and directory listing cache live in
 * useWorkspaceStore (Part 1) since other modules — Search, Git — also
 * need to know which directories are expanded/cached; this store is
 * purely about Explorer's own interaction chrome.
 */
export const useExplorerStore = create((set, get) => ({
  // The entry the context menu is currently targeting, or null.
  contextMenuTarget: null, // { uri, name, isDirectory, parentUri }

  // Clipboard for copy/cut + paste operations.
  clipboard: null, // { uri, name, isDirectory, parentUri, mode: 'copy' | 'cut' }

  // Active modal dialog state.
  activeDialog: null, // 'create-file' | 'create-folder' | 'rename' | 'delete-confirm' | null
  dialogTarget: null, // the entry the dialog operates on (rename/delete), or parent (create)

  // Multi-select mode (for bulk delete/move) — off by default since single-item
  // long-press context menu covers the common mobile case.
  multiSelectMode: false,
  selectedUris: [],

  openContextMenu: (target) => set({ contextMenuTarget: target }),
  closeContextMenu: () => set({ contextMenuTarget: null }),

  setClipboard: (entry, mode) =>
    set({ clipboard: { ...entry, mode }, contextMenuTarget: null }),
  clearClipboard: () => set({ clipboard: null }),

  openDialog: (dialogName, target = null) =>
    set({ activeDialog: dialogName, dialogTarget: target, contextMenuTarget: null }),
  closeDialog: () => set({ activeDialog: null, dialogTarget: null }),

  toggleMultiSelect: () =>
    set((state) => ({ multiSelectMode: !state.multiSelectMode, selectedUris: [] })),

  toggleSelected: (uri) =>
    set((state) => ({
      selectedUris: state.selectedUris.includes(uri)
        ? state.selectedUris.filter((u) => u !== uri)
        : [...state.selectedUris, uri],
    })),

  clearSelection: () => set({ selectedUris: [], multiSelectMode: false }),
}));
