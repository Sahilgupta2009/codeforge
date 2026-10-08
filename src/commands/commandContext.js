import { useCallback, useMemo } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { useEditorHandlersStore } from '../state/useEditorHandlersStore';
import { useGitStore } from '../state/useGitStore';
import { disposeGitFS } from '../git/GitFileSystemBridge';
import { writeTabToDisk, writeAllDirtyTabsToDisk } from '../editor/saveTab';
import { formatDocument } from '../editor/formatDocument';
import Toast from 'react-native-toast-message';

/**
 * @typedef {Object} CommandContext
 * Everything a Command's run(ctx) function might need. Assembled fresh
 * on every render via useCommandContext() so it's always in sync with
 * live state — commands never hold stale references.
 */

/**
 * Builds the CommandContext for the currently active pane/tab/workspace,
 * plus the UI-level callbacks (open command palette, toggle sidebar,
 * etc.) passed in from WorkspaceScreen, which owns that local UI state.
 *
 * @param {{
 *   navigation: object,
 *   uiCallbacks: {
 *     openCommandPalette: () => void,
 *     toggleSidebar: () => void,
 *     toggleTerminal: () => void,
 *     newTerminal: () => void,
 *     setFindVisible: (visible: boolean, opts?: object) => void,
 *     setGoToLineVisible: (visible: boolean) => void,
 *     openGlobalSearch: () => void,
 *     openNewFileDialog: () => void,
 *     openGitPanel: () => void,
 *     openBranchSwitcher: () => void,
 *     openCommitHistory: () => void,
 *     openAIChat: () => void,
 *     openAIActions: () => void,
 *     togglePreview: () => void,
 *   }
 * }} args
 */
export function useCommandContext({ navigation, uiCallbacks }) {
  const panes = useEditorStore((s) => s.panes);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const splitPane = useEditorStore((s) => s.splitPane);
  const closeSplit = useEditorStore((s) => s.closeSplit);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);

  const workspace = useWorkspaceStore((s) => s.workspace);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);

  const themeMode = useSettingsStore((s) => s.themeMode);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const trimTrailingWhitespaceOnSave = useSettingsStore((s) => s.trimTrailingWhitespaceOnSave);
  const formatOnSave = useSettingsStore((s) => s.formatOnSave);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);

  const isGitRepo = useGitStore((s) => s.isRepo);
  const gitPushAction = useGitStore((s) => s.push);
  const gitPullAction = useGitStore((s) => s.pull);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId) || null;
  const editorHandlers = useEditorHandlersStore((s) => (activeTab ? s.handlersByTabId[activeTab.id] : null));

  const anyDirtyTabs = panes.some((p) => p.tabs.some((t) => t.isDirty));
  const tabCount = activePane?.tabs.length || 0;
  const paneCount = panes.length;

  const saveActiveTab = useCallback(async () => {
    if (!activePane || !activeTab) return;
    const result = await writeTabToDisk({
      paneId: activePane.id,
      tab: activeTab,
      trimTrailingWhitespace: trimTrailingWhitespaceOnSave,
      format: formatOnSave ? { tabSize, insertSpaces } : null,
    });
    if (result.error) {
      Toast.show({ type: 'error', text1: `Failed to save ${activeTab.name}`, text2: result.error.message });
    }
  }, [activePane, activeTab, trimTrailingWhitespaceOnSave, formatOnSave, tabSize, insertSpaces]);

  const saveAllTabs = useCallback(async () => {
    const { savedCount, failures } = await writeAllDirtyTabsToDisk({
      trimTrailingWhitespace: trimTrailingWhitespaceOnSave,
      format: formatOnSave ? { tabSize, insertSpaces } : null,
    });
    failures.forEach(({ tab, error }) => {
      Toast.show({ type: 'error', text1: `Failed to save ${tab.name}`, text2: error.message });
    });
    if (savedCount > 0 && failures.length === 0) {
      Toast.show({ type: 'success', text1: `Saved ${savedCount} file${savedCount === 1 ? '' : 's'}` });
    }
  }, [trimTrailingWhitespaceOnSave, formatOnSave, tabSize, insertSpaces]);

  const formatActiveTab = useCallback(() => {
    if (!activePane || !activeTab) return;
    const formatted = formatDocument(activeTab.content, { tabSize, insertSpaces });
    if (formatted !== activeTab.content) {
      useEditorStore.getState().updateTabContent(activePane.id, activeTab.id, formatted);
      Toast.show({ type: 'success', text1: 'Document formatted' });
    } else {
      Toast.show({ type: 'info', text1: 'Already formatted' });
    }
  }, [activePane, activeTab, tabSize, insertSpaces]);

  const closeActiveTab = useCallback(() => {
    if (activePane && activeTab) closeTab(activePane.id, activeTab.id);
  }, [activePane, activeTab, closeTab]);

  const cycleTab = useCallback(
    (direction) => {
      if (!activePane || activePane.tabs.length === 0) return;
      const currentIndex = activePane.tabs.findIndex((t) => t.id === activePane.activeTabId);
      const nextIndex = ((currentIndex + direction) % activePane.tabs.length + activePane.tabs.length) % activePane.tabs.length;
      setActiveTab(activePane.id, activePane.tabs[nextIndex].id);
    },
    [activePane, setActiveTab]
  );

  const closeOtherSplit = useCallback(() => {
    const otherPane = panes.find((p) => p.id !== activePaneId);
    if (otherPane) closeSplit(otherPane.id);
  }, [panes, activePaneId, closeSplit]);

  const toggleTheme = useCallback(() => {
    setSetting('themeMode', themeMode === 'dark' ? 'light' : 'dark');
  }, [themeMode, setSetting]);

  const closeWorkspaceAndGoHome = useCallback(() => {
    if (workspace) disposeGitFS(workspace.uri);
    closeWorkspace();
    navigation?.replace('Welcome');
  }, [workspace, closeWorkspace, navigation]);

  const gitPush = useCallback(async () => {
    const result = await gitPushAction();
    if (result.success) {
      Toast.show({ type: 'success', text1: 'Pushed successfully' });
    } else {
      Toast.show({ type: 'error', text1: 'Push failed', text2: result.error });
    }
  }, [gitPushAction]);

  const gitPull = useCallback(async () => {
    const result = await gitPullAction();
    if (result.success) {
      Toast.show({ type: 'success', text1: 'Pulled successfully' });
    } else {
      Toast.show({ type: 'error', text1: 'Pull failed', text2: result.error });
    }
  }, [gitPullAction]);

  const context = useMemo(
    () => ({
      // State
      workspace,
      activeTab,
      activePane,
      panes,
      paneCount,
      tabCount,
      anyDirtyTabs,
      editorHandlers,
      navigation,
      isGitRepo,

      // File actions
      saveActiveTab,
      saveAllTabs,
      closeActiveTab,
      openNewFileDialog: uiCallbacks.openNewFileDialog,

      // Edit actions
      setFindVisible: uiCallbacks.setFindVisible,
      setGoToLineVisible: uiCallbacks.setGoToLineVisible,
      openGlobalSearch: uiCallbacks.openGlobalSearch,

      // View actions
      openCommandPalette: uiCallbacks.openCommandPalette,
      toggleSidebar: uiCallbacks.toggleSidebar,
      toggleTerminal: uiCallbacks.toggleTerminal,
      newTerminal: uiCallbacks.newTerminal,
      splitPane,
      closeOtherSplit,
      zoomIn,
      zoomOut,
      toggleTheme,
      formatActiveTab,

      // Git actions
      openGitPanel: uiCallbacks.openGitPanel,
      openBranchSwitcher: uiCallbacks.openBranchSwitcher,
      openCommitHistory: uiCallbacks.openCommitHistory,
      gitPush,
      gitPull,

      // AI Assistant actions
      openAIChat: uiCallbacks.openAIChat,
      openAIActions: uiCallbacks.openAIActions,

      // Preview actions (Part 10)
      togglePreview: uiCallbacks.togglePreview,
      runFile: uiCallbacks.runFile,

      // Navigation
      cycleTab,
      closeWorkspaceAndGoHome,
    }),
    [
      workspace,
      activeTab,
      activePane,
      panes,
      paneCount,
      tabCount,
      anyDirtyTabs,
      editorHandlers,
      navigation,
      isGitRepo,
      saveActiveTab,
      saveAllTabs,
      closeActiveTab,
      uiCallbacks,
      splitPane,
      closeOtherSplit,
      zoomIn,
      zoomOut,
      toggleTheme,
      formatActiveTab,
      gitPush,
      gitPull,
      cycleTab,
      closeWorkspaceAndGoHome,
    ]
  );

  return context;
}
