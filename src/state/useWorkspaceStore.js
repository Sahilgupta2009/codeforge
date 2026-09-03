import { create } from 'zustand';

/**
 * Tracks the currently open workspace (project folder) and its metadata.
 * The workspace root is a SAF tree URI obtained via expo-document-picker's
 * directory picker. Nothing here touches disk directly — see
 * src/filesystem for actual I/O.
 */
export const useWorkspaceStore = create((set, get) => ({
  // { uri, name, openedAt } | null
  workspace: null,

  // Per-workspace settings that live alongside the project (like VS Code's
  // .vscode/settings.json), keyed by workspace uri.
  workspaceSettingsByUri: {},

  // Expanded/collapsed state of the file explorer tree, keyed by dir uri.
  expandedDirs: {},

  // Cache of directory listings, keyed by dir uri, to avoid re-querying
  // SAF on every render. Invalidated by FileSystemEventBus on mutation.
  directoryCache: {},

  openWorkspace: (workspace) => set({ workspace, expandedDirs: {}, directoryCache: {} }),

  closeWorkspace: () => set({ workspace: null, expandedDirs: {}, directoryCache: {} }),

  toggleExpanded: (dirUri) =>
    set((state) => ({
      expandedDirs: { ...state.expandedDirs, [dirUri]: !state.expandedDirs[dirUri] },
    })),

  setDirectoryCache: (dirUri, entries) =>
    set((state) => ({
      directoryCache: { ...state.directoryCache, [dirUri]: entries },
    })),

  invalidateDirectoryCache: (dirUri) =>
    set((state) => {
      const next = { ...state.directoryCache };
      delete next[dirUri];
      return { directoryCache: next };
    }),

  invalidateAllCaches: () => set({ directoryCache: {} }),

  getWorkspaceSetting: (key, fallback) => {
    const state = get();
    if (!state.workspace) return fallback;
    const settings = state.workspaceSettingsByUri[state.workspace.uri] || {};
    return key in settings ? settings[key] : fallback;
  },

  setWorkspaceSetting: (key, value) =>
    set((state) => {
      if (!state.workspace) return state;
      const uri = state.workspace.uri;
      const existing = state.workspaceSettingsByUri[uri] || {};
      return {
        workspaceSettingsByUri: {
          ...state.workspaceSettingsByUri,
          [uri]: { ...existing, [key]: value },
        },
      };
    }),
}));
