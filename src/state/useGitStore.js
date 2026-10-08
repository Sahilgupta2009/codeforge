import { create } from 'zustand';
import * as GitService from '../git/GitService';
import { FileSystemEventBus, FS_EVENTS } from '../filesystem/FileSystemEventBus';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useSettingsStore } from './useSettingsStore';

export const useGitStore = create((set, get) => ({
  isRepo: false,
  isLoading: false,
  currentBranch: null,
  branches: [],
  status: [], // [{ path, status, staged }]
  history: [],
  errorMessage: null,
  lastCheckedAt: null,

  /** Detects whether the current workspace is a git repo and, if so, loads full status. */
  checkRepoState: async () => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) {
      set({ isRepo: false, status: [], branches: [], currentBranch: null, history: [] });
      return;
    }

    const isRepo = await GitService.isGitRepo(workspace.uri);
    set({ isRepo });
    if (isRepo) {
      await get().refreshStatus();
      await get().refreshBranches();
      await get().refreshHistory();
    }
  },

  initRepo: async () => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return { success: false, error: 'No workspace open' };
    set({ isLoading: true, errorMessage: null });
    try {
      const excludePatterns = useSettingsStore.getState().excludePatterns;
      await GitService.initRepo(workspace.uri, excludePatterns);
      set({ isRepo: true });
      await get().refreshStatus();
      await get().refreshBranches();
      return { success: true };
    } catch (err) {
      set({ errorMessage: err.message });
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  refreshStatus: async () => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace || !get().isRepo) return;
    set({ isLoading: true });
    try {
      const excludePatterns = useSettingsStore.getState().excludePatterns;
      const status = await GitService.getStatus(workspace.uri, excludePatterns);
      set({ status, lastCheckedAt: Date.now(), errorMessage: null });
    } catch (err) {
      set({ errorMessage: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshBranches: async () => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace || !get().isRepo) return;
    try {
      const [branches, currentBranch] = await Promise.all([
        GitService.listBranches(workspace.uri),
        GitService.getCurrentBranch(workspace.uri),
      ]);
      set({ branches, currentBranch });
    } catch (err) {
      set({ errorMessage: err.message });
    }
  },

  refreshHistory: async () => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace || !get().isRepo) return;
    try {
      const history = await GitService.getCommitHistory(workspace.uri, { depth: 50 });
      set({ history });
    } catch (err) {
      set({ errorMessage: err.message });
    }
  },

  stagePath: async (filepath) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return;
    try {
      await GitService.stageFile(workspace.uri, filepath);
      await get().refreshStatus();
    } catch (err) {
      set({ errorMessage: err.message });
    }
  },

  unstagePath: async (filepath) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return;
    try {
      await GitService.unstageFile(workspace.uri, filepath);
      await get().refreshStatus();
    } catch (err) {
      set({ errorMessage: err.message });
    }
  },

  stageAll: async () => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return;
    try {
      const paths = get().status.map((s) => s.path);
      await GitService.stageAll(workspace.uri, paths);
      await get().refreshStatus();
    } catch (err) {
      set({ errorMessage: err.message });
    }
  },

  commit: async (message, author) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return { success: false, error: 'No workspace open' };
    if (!message || !message.trim()) return { success: false, error: 'Commit message is required' };

    const stagedPaths = get().status.filter((s) => s.staged).map((s) => s.path);
    if (stagedPaths.length === 0) {
      return { success: false, error: 'No staged changes to commit' };
    }

    set({ isLoading: true, errorMessage: null });
    try {
      const sha = await GitService.commit(workspace.uri, { message: message.trim(), ...author });
      await get().refreshStatus();
      await get().refreshHistory();
      return { success: true, sha };
    } catch (err) {
      set({ errorMessage: err.message });
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  createBranch: async (branchName, { checkout = true } = {}) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return { success: false, error: 'No workspace open' };
    set({ isLoading: true, errorMessage: null });
    try {
      await GitService.createBranch(workspace.uri, branchName, { checkout });
      await get().refreshBranches();
      if (checkout) {
        // Branch creation with checkout doesn't change working-tree
        // content (new branch points at the same commit), so no SAF
        // sync is needed here — only refreshStatus to reflect the new
        // branch context.
        await get().refreshStatus();
      }
      return { success: true };
    } catch (err) {
      set({ errorMessage: err.message });
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  checkoutBranch: async (branchName) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return { success: false, error: 'No workspace open' };
    set({ isLoading: true, errorMessage: null });
    try {
      const { written, failed } = await GitService.checkoutBranch(workspace.uri, branchName);
      await get().refreshBranches();
      await get().refreshStatus();
      // Invalidate the whole directory cache tree since checkout can
      // touch arbitrarily many files — a targeted invalidation per
      // written path would need parent-directory resolution for each,
      // which is more complexity than a workspace-wide refresh costs.
      useWorkspaceStore.getState().invalidateAllCaches();
      FileSystemEventBus.emit(FS_EVENTS.WORKSPACE_CHANGED, { workspace });
      return { success: true, written, failed };
    } catch (err) {
      set({ errorMessage: err.message });
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  push: async (options) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return { success: false, error: 'No workspace open' };
    set({ isLoading: true, errorMessage: null });
    try {
      const branch = get().currentBranch;
      const result = await GitService.push(workspace.uri, { branch, ...options });
      return { success: true, result };
    } catch (err) {
      set({ errorMessage: err.message });
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  pull: async (options) => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return { success: false, error: 'No workspace open' };
    set({ isLoading: true, errorMessage: null });
    try {
      const branch = get().currentBranch;
      await GitService.pull(workspace.uri, { branch, ...options });
      await get().refreshStatus();
      await get().refreshHistory();
      useWorkspaceStore.getState().invalidateAllCaches();
      FileSystemEventBus.emit(FS_EVENTS.WORKSPACE_CHANGED, { workspace });
      return { success: true };
    } catch (err) {
      set({ errorMessage: err.message });
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ errorMessage: null }),
}));

// Keep git status roughly fresh when files change elsewhere in the app
// (editor saves, Explorer create/rename/delete) — debounced so a burst
// of saves (e.g. Save All) doesn't trigger a refreshStatus per file.
let refreshDebounceTimer = null;
function scheduleStatusRefresh() {
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    if (useGitStore.getState().isRepo) {
      useGitStore.getState().refreshStatus();
    }
  }, 800);
}

FileSystemEventBus.on(FS_EVENTS.WRITTEN, scheduleStatusRefresh);
FileSystemEventBus.on(FS_EVENTS.CREATED, scheduleStatusRefresh);
FileSystemEventBus.on(FS_EVENTS.DELETED, scheduleStatusRefresh);
FileSystemEventBus.on(FS_EVENTS.RENAMED, scheduleStatusRefresh);
FileSystemEventBus.on(FS_EVENTS.MOVED, scheduleStatusRefresh);
