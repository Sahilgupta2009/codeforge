import React, { useCallback, useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useEditorStore } from '../../state/useEditorStore';
import { useSettingsStore } from '../../state/useSettingsStore';
import { useEditorHandlersStore } from '../../state/useEditorHandlersStore';
import { useKeyboardShortcuts } from '../../commands/useKeyboardShortcuts';
import { writeTabToDisk } from '../../editor/saveTab';
import TabBar from './TabBar';
import TabContextMenu from './TabContextMenu';
import EditorToolbar from './EditorToolbar';
import FindReplacePanel from './FindReplacePanel';
import GoToLineDialog from './GoToLineDialog';
import CodeEditor from './CodeEditor';
import AICodeActionsSheet from '../ai/AICodeActionsSheet';
import PreviewPane from '../preview/PreviewPane';
import RunOutputSheet from '../runner/RunOutputSheet';
import { isRunnableLanguage } from '../../runner/languages';

/**
 * One editor pane: its own tab strip, toolbar, find/replace panel, and
 * code surface. WorkspaceScreen renders one or two of these side by side
 * using useEditorStore's `panes` array (up to 2, split horizontally).
 *
 * Find & Go-to-Line visibility are owned locally (they're inherently
 * per-pane UI state), but this pane also registers `openFind` /
 * `openGoToLine` / `openAIActions` triggers into useEditorHandlersStore,
 * keyed by pane id — this is what lets the Command Palette / keyboard
 * shortcuts / WorkspaceScreen open Find, Go to Line, or the AI Code
 * Actions sheet on whichever pane is currently active without
 * WorkspaceScreen needing to track per-pane UI state itself (same
 * bridging pattern Part 3 established for undo/redo/jumpToOffset, just
 * keyed by pane instead of tab since these are pane-level overlays, not
 * per-tab ones).
 *
 * As of Part 10, HTML and Markdown tabs can also show a live preview
 * (PreviewPane) as a 50/50 split alongside CodeEditor, toggled from the
 * toolbar's eye icon. Preview visibility is tracked per TAB (in a
 * tabId-keyed object, not a single boolean) so switching between an
 * HTML tab and a Python tab and back doesn't lose or leak the preview
 * state between unrelated files.
 */
const PREVIEWABLE_LANGUAGES = new Set(['html', 'markdown']);

export default function EditorPane({ paneId, commandContext }) {
  const theme = useCodeForgeTheme();
  const panes = useEditorStore((s) => s.panes);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActivePane = useEditorStore((s) => s.setActivePane);
  const trimTrailingWhitespaceOnSave = useSettingsStore((s) => s.trimTrailingWhitespaceOnSave);
  const formatOnSave = useSettingsStore((s) => s.formatOnSave);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);

  const [previewVisibleByTabId, setPreviewVisibleByTabId] = useState({});
  const [runVisible, setRunVisible] = useState(false);
  const [runRequestId, setRunRequestId] = useState(0);

  const pane = panes.find((p) => p.id === paneId);
  const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId) || null;

  const previewAvailable = !!activeTab && PREVIEWABLE_LANGUAGES.has(activeTab.language);
  const previewVisible = previewAvailable && !!previewVisibleByTabId[activeTab.id];

  const handleTogglePreview = useCallback(() => {
    if (!activeTab) return;
    setPreviewVisibleByTabId((prev) => ({ ...prev, [activeTab.id]: !prev[activeTab.id] }));
  }, [activeTab]);

  const [contextMenuTab, setContextMenuTab] = useState(null);
  const [findVisible, setFindVisible] = useState(false);
  const [findWithReplace, setFindWithReplace] = useState(false);
  const [goToLineVisible, setGoToLineVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiActionsVisible, setAiActionsVisible] = useState(false);

  const { handleKeyEvent } = useKeyboardShortcuts(commandContext);
  const runFileRef = useRef(null);

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty || saving) return;
    setSaving(true);
    const result = await writeTabToDisk({
      paneId,
      tab: activeTab,
      trimTrailingWhitespace: trimTrailingWhitespaceOnSave,
      format: formatOnSave ? { tabSize, insertSpaces } : null,
    });
    if (result.saved) {
      Toast.show({ type: 'success', text1: `Saved ${activeTab.name}` });
    } else if (result.error) {
      Toast.show({ type: 'error', text1: 'Save failed', text2: result.error.message });
    }
    setSaving(false);
  }, [activeTab, saving, trimTrailingWhitespaceOnSave, formatOnSave, tabSize, insertSpaces, paneId]);

  // Run: HTML/Markdown files "run" by showing the live preview; every
  // other runnable language opens the output sheet and executes.
  const handleRun = useCallback(() => {
    if (!activeTab) return;
    if (PREVIEWABLE_LANGUAGES.has(activeTab.language)) {
      setPreviewVisibleByTabId((prev) => ({ ...prev, [activeTab.id]: true }));
      return;
    }
    if (!isRunnableLanguage(activeTab.language)) {
      Toast.show({ type: 'info', text1: 'Cannot run this file type', text2: activeTab.name });
      return;
    }
    setRunRequestId((n) => n + 1);
    setRunVisible(true);
  }, [activeTab]);

  runFileRef.current = handleRun;

  const handleGoToLine = useCallback(
    (lineIndex, columnIndex) => {
      if (!activeTab) return;
      const lines = activeTab.content.split('\n');
      const clampedLine = Math.max(0, Math.min(lines.length - 1, lineIndex));
      let offset = 0;
      for (let i = 0; i < clampedLine; i++) {
        offset += lines[i].length + 1;
      }
      offset += Math.max(0, Math.min(lines[clampedLine].length, columnIndex));

      const handlers = useEditorHandlersStore.getState().getHandlers(activeTab.id);
      if (handlers?.jumpToOffset) {
        handlers.jumpToOffset(offset);
      }
      setGoToLineVisible(false);
    },
    [activeTab]
  );

  // Register pane-level triggers (openFind, openGoToLine, openAIActions,
  // togglePreview) so the Command Palette / keyboard shortcuts can
  // trigger these on whichever pane is active, keyed separately from
  // the per-tab handler registry. togglePreview reads the pane's
  // CURRENT active tab id from the store at call-time (rather than
  // closing over `activeTab` from render) since this effect only runs
  // once per paneId and would otherwise act on a stale tab after the
  // user switches tabs.
  useEffect(() => {
    useEditorHandlersStore.getState().registerHandlers(`pane:${paneId}`, {
      openFind: (opts) => {
        setFindWithReplace(!!opts?.withReplace);
        setFindVisible(true);
      },
      openGoToLine: () => setGoToLineVisible(true),
      openAIActions: () => setAiActionsVisible(true),
      runFile: () => runFileRef.current && runFileRef.current(),
      togglePreview: () => {
        const currentPane = useEditorStore.getState().panes.find((p) => p.id === paneId);
        const currentTab = currentPane?.tabs.find((t) => t.id === currentPane.activeTabId);
        if (!currentTab || !PREVIEWABLE_LANGUAGES.has(currentTab.language)) return;
        setPreviewVisibleByTabId((prev) => ({ ...prev, [currentTab.id]: !prev[currentTab.id] }));
      },
    });
    return () => {
      useEditorHandlersStore.getState().unregisterHandlers(`pane:${paneId}`);
    };
  }, [paneId]);

  if (!pane) return null;

  return (
    <View style={styles.container} onTouchStart={() => setActivePane(paneId)}>
      <TabBar
        paneId={paneId}
        tabs={pane.tabs}
        activeTabId={pane.activeTabId}
        onSelectTab={(tabId) => setActiveTab(paneId, tabId)}
        onCloseTab={(tabId) => {
          closeTab(paneId, tabId);
          setPreviewVisibleByTabId((prev) => {
            if (!(tabId in prev)) return prev;
            const next = { ...prev };
            delete next[tabId];
            return next;
          });
        }}
        onLongPressTab={(tab) => setContextMenuTab(tab)}
      />

      {activeTab ? (
        <>
          <EditorToolbar
            tab={activeTab}
            onSave={handleSave}
            onToggleFind={() => setFindVisible((v) => !v)}
            onGoToLine={() => setGoToLineVisible(true)}
            onOpenAIActions={() => setAiActionsVisible(true)}
            onRun={isRunnableLanguage(activeTab.language) || previewAvailable ? handleRun : null}
            previewAvailable={previewAvailable}
            previewVisible={previewVisible}
            onTogglePreview={handleTogglePreview}
          />
          {findVisible && (
            <FindReplacePanel
              paneId={paneId}
              tab={activeTab}
              initialShowReplace={findWithReplace}
              onClose={() => setFindVisible(false)}
            />
          )}
          <View style={styles.editorAndPreviewRow}>
            <View style={previewVisible ? styles.halfWidth : styles.fullWidth}>
              <CodeEditor paneId={paneId} tab={activeTab} onHardwareKeyPress={handleKeyEvent} />
            </View>
            {previewVisible && (
              <View style={[styles.halfWidth, styles.previewDivider, { borderLeftColor: theme.palette.outlineVariant }]}>
                <PreviewPane tab={activeTab} />
              </View>
            )}
          </View>
          <GoToLineDialog
            visible={goToLineVisible}
            totalLines={activeTab.content.split('\n').length}
            onGoToLine={handleGoToLine}
            onDismiss={() => setGoToLineVisible(false)}
          />
        </>
      ) : (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-code-outline" size={40} color={theme.palette.onSurfaceDim} />
          <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 12 }}>
            Select a file to open it
          </Text>
        </View>
      )}

      <TabContextMenu paneId={paneId} tab={contextMenuTab} onDismiss={() => setContextMenuTab(null)} />

      <AICodeActionsSheet visible={aiActionsVisible} onDismiss={() => setAiActionsVisible(false)} />

      <RunOutputSheet
        visible={runVisible}
        tab={activeTab}
        runRequestId={runRequestId}
        onDismiss={() => setRunVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  editorAndPreviewRow: { flex: 1, flexDirection: 'row' },
  fullWidth: { flex: 1 },
  halfWidth: { flex: 1, width: '50%' },
  previewDivider: { borderLeftWidth: 1 },
});
