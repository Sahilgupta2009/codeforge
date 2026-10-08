import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useEditorStore } from '../state/useEditorStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { useEditorHandlersStore } from '../state/useEditorHandlersStore';
import { useSearchStore } from '../state/useSearchStore';
import { useGitStore } from '../state/useGitStore';
import { useTerminalStore } from '../state/useTerminalStore';
import FileExplorer from '../components/FileExplorer';
import GlobalSearchPanel from '../components/GlobalSearchPanel';
import GitStatusPanel from '../components/GitStatusPanel';
import DiffViewer from '../components/DiffViewer';
import BranchSwitcher from '../components/BranchSwitcher';
import CommitHistory from '../components/CommitHistory';
import SidebarViewSwitcher from '../components/SidebarViewSwitcher';
import TerminalPanel from '../components/terminal/TerminalPanel';
import ExtensionsPanel from '../components/extensions/ExtensionsPanel';
import ExtensionHost from '../extensions/ExtensionHost';
import { useExtensionStore } from '../state/useExtensionStore';
import AIChatPanel from '../components/ai/AIChatPanel';
import FilePreviewPane from '../components/preview/FilePreviewPane';
import EditorPane from '../components/editor/EditorPane';
import StatusBar from '../components/StatusBar';
import CommandPalette from '../components/commands/CommandPalette';
import { useCommandContext } from '../commands/commandContext';
import { FS } from '../filesystem/FileSystemRouter';
import { detectLanguage, isImageFile, isPdfFile, isBinaryFile, formatFileSize } from '../utils/pathUtils';

const RAIL_WIDTH = 44; // matches SidebarViewSwitcher
const WIDE_LAYOUT_MIN_WIDTH = 700; // below this, the sidebar is a slide-over drawer

/**
 * Main IDE shell. As of Part 10:
 *   - Left sidebar: switchable between File Explorer, Global Search,
 *     Source Control (Git), Extensions, and the AI Assistant chat via
 *     the icon rail — each sidebarView value has its own explicit
 *     render branch (not a catch-all else), so adding a view can never
 *     accidentally fall through to the wrong panel.
 *   - Source Control: real git status, stage/unstage, commit composer,
 *     branch switcher, commit history, diff viewer
 *   - Global Search: real project-wide search/replace
 *   - AI Assistant: persistent chat (AIChatPanel) against the
 *     configured provider, plus per-tab AI code actions (Explain/
 *     Generate/Fix/Refactor/Comment/Continue) reachable from the editor
 *     toolbar's sparkle icon or the Command Palette — see
 *     src/ai/aiService.js for the provider/streaming architecture.
 *   - Center: real multi-tab CodeEditor, up to 2 panes side by side.
 *     HTML and Markdown tabs can show a live split preview (see
 *     EditorPane.js / src/components/preview/PreviewPane.js). Opening
 *     an image or PDF from the Explorer renders it directly in this
 *     area via FilePreviewPane rather than opening a text tab — see
 *     src/components/preview/ for the real ImagePreview/PdfPreview
 *     renderers, both reading live file bytes via
 *     FS.readFileBase64, nothing mocked.
 *   - Bottom: real status bar, plus the integrated Terminal panel
 *     (toggle via the top-bar icon, Command Palette, or Ctrl+`) — a
 *     real virtual command interpreter operating on the actual
 *     workspace, with an optional per-tab switch to dispatch commands
 *     to a real installed Termux for full process execution (see
 *     src/terminal/termuxBridge.js for exactly what that bridge can and
 *     cannot do)
 *   - Command Palette + hardware keyboard shortcuts
 */
export default function WorkspaceScreen({ navigation }) {
  const theme = useCodeForgeTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < WIDE_LAYOUT_MIN_WIDTH;
  const sidebarWidth = isNarrow
    ? Math.max(200, Math.min(300, windowWidth - RAIL_WIDTH - 56))
    : Math.min(300, windowWidth * 0.4);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const panes = useEditorStore((s) => s.panes);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const openFile = useEditorStore((s) => s.openFile);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const excludePatterns = useSettingsStore((s) => s.excludePatterns);
  const isGitRepo = useGitStore((s) => s.isRepo);
  const gitCurrentBranch = useGitStore((s) => s.currentBranch);
  const gitStatus = useGitStore((s) => s.status);
  const terminalPanelVisible = useTerminalStore((s) => s.panelVisible);
  const toggleTerminalPanel = useTerminalStore((s) => s.togglePanel);
  const createTerminalSession = useTerminalStore((s) => s.createSession);
  // On phones the sidebar starts closed and slides over the editor; on
  // tablets/landscape it sits beside the editor.
  const [sidebarOpen, setSidebarOpen] = useState(() => windowWidth >= WIDE_LAYOUT_MIN_WIDTH);
  const [sidebarView, setSidebarView] = useState('explorer'); // 'explorer' | 'search' | 'git' | 'extensions' | 'ai'
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
  const [diffViewerFile, setDiffViewerFile] = useState(null);
  const [branchSwitcherVisible, setBranchSwitcherVisible] = useState(false);
  const [commitHistoryVisible, setCommitHistoryVisible] = useState(false);

  const [nonTextFile, setNonTextFile] = useState(null); // { uri, name, size, reason } | null
  const [previewFile, setPreviewFile] = useState(null); // { uri, name, size } | null — image/PDF, Part 10
  const [opening, setOpening] = useState(false);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId) || null;

  // --- UI-level callbacks the command system needs, implemented here
  // since WorkspaceScreen is what owns sidebar/palette/non-text-file UI
  // state. Find/GoToLine delegate to whichever pane is active via the
  // pane-keyed handlers EditorPane registers (see EditorPane.js).
  const uiCallbacks = useMemo(
    () => ({
      openCommandPalette: () => setCommandPaletteVisible(true),
      toggleSidebar: () => setSidebarOpen((v) => !v),
      toggleTerminal: toggleTerminalPanel,
      newTerminal: createTerminalSession,
      setFindVisible: (visible, opts) => {
        if (!visible || !activePaneId) return;
        const handlers = useEditorHandlersStore.getState().getHandlers(`pane:${activePaneId}`);
        handlers?.openFind?.(opts);
      },
      setGoToLineVisible: (visible) => {
        if (!visible || !activePaneId) return;
        const handlers = useEditorHandlersStore.getState().getHandlers(`pane:${activePaneId}`);
        handlers?.openGoToLine?.();
      },
      openGlobalSearch: () => {
        setSidebarOpen(true);
        setSidebarView('search');
      },
      openGitPanel: () => {
        setSidebarOpen(true);
        setSidebarView('git');
      },
      openBranchSwitcher: () => setBranchSwitcherVisible(true),
      openCommitHistory: () => setCommitHistoryVisible(true),
      openNewFileDialog: () => {
        Toast.show({
          type: 'info',
          text1: 'New File',
          text2: 'Use the file explorer\u2019s "+" button for now — a dedicated command-driven dialog lands in a later part.',
        });
      },
      openAIChat: () => {
        setSidebarOpen(true);
        setSidebarView('ai');
      },
      openAIActions: () => {
        if (!activePaneId) return;
        const handlers = useEditorHandlersStore.getState().getHandlers(`pane:${activePaneId}`);
        handlers?.openAIActions?.();
      },
      runFile: () => {
        if (!activePaneId) return;
        const handlers = useEditorHandlersStore.getState().getHandlers(`pane:${activePaneId}`);
        handlers?.runFile?.();
      },
      togglePreview: () => {
        if (!activePaneId) return;
        const handlers = useEditorHandlersStore.getState().getHandlers(`pane:${activePaneId}`);
        handlers?.togglePreview?.();
      },
    }),
    [activePaneId, toggleTerminalPanel, createTerminalSession]
  );

  const commandContext = useCommandContext({ navigation, uiCallbacks });

  const closeSidebarIfNarrow = useCallback(() => {
    if (isNarrow) setSidebarOpen(false);
  }, [isNarrow]);

  const handleOpenFile = useCallback(
    async (entry) => {
      closeSidebarIfNarrow();
      if (isBinaryFile(entry.name) && !isImageFile(entry.name) && !isPdfFile(entry.name)) {
        setPreviewFile(null);
        setNonTextFile({ ...entry, reason: 'This file type is not previewable as text.' });
        return;
      }
      if (isImageFile(entry.name) || isPdfFile(entry.name)) {
        setNonTextFile(null);
        setPreviewFile(entry);
        return;
      }

      setNonTextFile(null);
      setPreviewFile(null);
      setOpening(true);
      try {
        const content = await FS.readFile(entry.uri);
        openFile(
          { uri: entry.uri, name: entry.name, language: detectLanguage(entry.name), content },
          { preview: true }
        );
      } catch (err) {
        Toast.show({ type: 'error', text1: 'Could not open file', text2: err.message });
      } finally {
        setOpening(false);
      }
    },
    [openFile, closeSidebarIfNarrow]
  );

  // Opens a search-result match: opens the file (as a real tab, reading
  // real content) then jumps the cursor to the exact match offset once
  // the editor instance for that tab has mounted and registered its
  // jumpToOffset handler.
  const handleOpenSearchMatch = useCallback(
    async (fileResult, match) => {
      closeSidebarIfNarrow();
      setNonTextFile(null);
      setPreviewFile(null);
      setOpening(true);
      try {
        const content = await FS.readFile(fileResult.uri);
        openFile(
          { uri: fileResult.uri, name: fileResult.name, language: detectLanguage(fileResult.name), content },
          { preview: true }
        );

        // The new tab's CodeEditor registers its jumpToOffset handler in
        // an effect after mount; poll briefly for it rather than assuming
        // a fixed delay, so this works reliably regardless of how fast a
        // given device renders the new tab.
        const uri = fileResult.uri;
        let attempts = 0;
        const tryJump = () => {
          attempts++;
          const state = useEditorStore.getState();
          const pane = state.panes.find((p) => p.tabs.some((t) => t.uri === uri));
          const tab = pane?.tabs.find((t) => t.uri === uri);
          const handlers = tab ? useEditorHandlersStore.getState().getHandlers(tab.id) : null;
          if (handlers?.jumpToOffset) {
            handlers.jumpToOffset(match.fileOffset);
          } else if (attempts < 20) {
            setTimeout(tryJump, 50);
          }
        };
        setTimeout(tryJump, 50);
      } catch (err) {
        Toast.show({ type: 'error', text1: 'Could not open file', text2: err.message });
      } finally {
        setOpening(false);
      }
    },
    [openFile, closeSidebarIfNarrow]
  );

  const renderSidebarContent = () =>
    sidebarView === 'explorer' ? (
      <FileExplorer onOpenFile={handleOpenFile} />
    ) : sidebarView === 'search' ? (
      <GlobalSearchPanel onOpenMatch={handleOpenSearchMatch} />
    ) : sidebarView === 'git' ? (
      <GitStatusPanel onOpenDiff={setDiffViewerFile} />
    ) : sidebarView === 'extensions' ? (
      <ExtensionsPanel />
    ) : sidebarView === 'ai' ? (
      <AIChatPanel />
    ) : null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.palette.surface, paddingBottom: insets.bottom },
      ]}
    >
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: theme.palette.outlineVariant,
            paddingTop: insets.top,
            height: 52 + insets.top,
            backgroundColor: theme.palette.surface,
          },
        ]}
      >
        <IconButton
          icon={sidebarOpen ? 'dock-left' : 'dock-window'}
          iconColor={theme.palette.onSurfaceVariant}
          size={20}
          onPress={() => setSidebarOpen((v) => !v)}
          accessibilityLabel="Toggle sidebar"
        />
        <Text style={{ color: theme.palette.onSurface, flex: 1 }} numberOfLines={1}>
          {activeTab ? activeTab.name : previewFile ? previewFile.name : workspace?.name || 'No workspace'}
        </Text>
        {opening && <ActivityIndicator size={16} style={{ marginRight: 8 }} color={theme.palette.primary} />}
        {isGitRepo && (
          <>
            <IconButton
              icon="source-branch"
              iconColor={theme.palette.onSurfaceVariant}
              size={20}
              onPress={() => setBranchSwitcherVisible(true)}
              accessibilityLabel="Switch branch"
            />
            <IconButton
              icon="history"
              iconColor={theme.palette.onSurfaceVariant}
              size={20}
              onPress={() => setCommitHistoryVisible(true)}
              accessibilityLabel="Commit history"
            />
          </>
        )}
        <IconButton
          icon="magnify"
          iconColor={theme.palette.onSurfaceVariant}
          size={20}
          onPress={() => setCommandPaletteVisible(true)}
          accessibilityLabel="Command palette"
        />
        <IconButton
          icon="dock-right"
          iconColor={panes.length > 1 ? theme.palette.primary : theme.palette.onSurfaceVariant}
          size={20}
          onPress={() => {
            if (panes.length > 1) {
              commandContext.closeOtherSplit();
            } else {
              commandContext.splitPane('horizontal');
            }
          }}
          accessibilityLabel="Toggle split editor"
        />
        <IconButton
          icon="console"
          iconColor={terminalPanelVisible ? theme.palette.primary : theme.palette.onSurfaceVariant}
          size={20}
          onPress={toggleTerminalPanel}
          accessibilityLabel="Toggle terminal"
        />
        <IconButton
          icon="cog-outline"
          iconColor={theme.palette.onSurfaceVariant}
          size={20}
          onPress={() => navigation.navigate('Settings')}
        />
      </View>

      <View style={styles.body}>
        {sidebarOpen && !isNarrow && (
          <View style={styles.sidebarRow}>
            <SidebarViewSwitcher activeView={sidebarView} onSelectView={setSidebarView} />
            <View style={[styles.sidebar, { width: sidebarWidth, borderRightColor: theme.palette.outlineVariant }]}>
              {renderSidebarContent()}
            </View>
          </View>
        )}

        <View style={styles.editorArea}>
          {previewFile ? (
            <FilePreviewPane file={previewFile} onClose={() => setPreviewFile(null)} />
          ) : nonTextFile ? (
            <View style={styles.center}>
              <MaterialCommunityIcons name="file-question-outline" size={36} color={theme.palette.onSurfaceDim} />
              <Text numberOfLines={1} style={{ color: theme.palette.onSurface, marginTop: 12, fontWeight: '600' }}>
                {nonTextFile.name}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.palette.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}
              >
                {nonTextFile.reason}
              </Text>
              {nonTextFile.size != null && (
                <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, marginTop: 4 }}>
                  {formatFileSize(nonTextFile.size)}
                </Text>
              )}
              <IconButton icon="close" onPress={() => setNonTextFile(null)} style={{ marginTop: 8 }} />
            </View>
          ) : (
            <View style={styles.panesRow}>
              {panes.map((pane) => (
                <View
                  key={pane.id}
                  style={[
                    styles.paneContainer,
                    panes.length > 1 && { borderLeftWidth: 1, borderLeftColor: theme.palette.outlineVariant },
                  ]}
                >
                  <EditorPane paneId={pane.id} commandContext={commandContext} />
                </View>
              ))}
            </View>
          )}
        </View>
        {sidebarOpen && isNarrow && (
          <>
            <Pressable
              style={styles.scrim}
              onPress={() => setSidebarOpen(false)}
              accessibilityLabel="Close sidebar"
            />
            <View
              style={[
                styles.drawer,
                { backgroundColor: theme.palette.surface, borderRightColor: theme.palette.outlineVariant },
              ]}
            >
              <SidebarViewSwitcher activeView={sidebarView} onSelectView={setSidebarView} />
              <View style={{ width: sidebarWidth }}>{renderSidebarContent()}</View>
            </View>
          </>
        )}
      </View>

      <ExtensionHost />

      <TerminalPanel />

      <StatusBar
        activeTab={activeTab}
        workspace={workspace}
        onGoToLine={() => uiCallbacks.setGoToLineVisible(true)}
        onOpenLanguagePicker={() => {}}
        tabSize={tabSize}
        gitBranch={isGitRepo ? gitCurrentBranch : null}
        gitDirty={isGitRepo && gitStatus.length > 0}
      />

      <CommandPalette
        visible={commandPaletteVisible}
        commandContext={commandContext}
        onDismiss={() => setCommandPaletteVisible(false)}
      />

      <DiffViewer
        visible={!!diffViewerFile}
        fileStatus={diffViewerFile}
        onDismiss={() => setDiffViewerFile(null)}
      />

      <BranchSwitcher visible={branchSwitcherVisible} onDismiss={() => setBranchSwitcherVisible(false)} />

      <CommitHistory visible={commitHistoryVisible} onDismiss={() => setCommitHistoryVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  body: { flex: 1, flexDirection: 'row' },
  sidebarRow: { flexDirection: 'row' },
  sidebar: { borderRightWidth: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    borderRightWidth: 1,
    zIndex: 11,
    elevation: 16,
  },
  editorArea: { flex: 1 },
  panesRow: { flex: 1, flexDirection: 'row' },
  paneContainer: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
