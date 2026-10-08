import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, TextInput as RNTextInput } from 'react-native';
import Modal from 'react-native-modal';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useEditorStore } from '../../state/useEditorStore';
import { useEditorHandlersStore } from '../../state/useEditorHandlersStore';
import { useAIStore } from '../../state/useAIStore';
import { useSettingsStore } from '../../state/useSettingsStore';
import { extractFirstCodeBlock } from '../../ai/promptTemplates';

const ACTIONS = [
  { id: 'explain', icon: 'text-box-search-outline', label: 'Explain', needsSelectionHint: false },
  { id: 'generate', icon: 'auto-fix', label: 'Generate', needsSelectionHint: false, needsInstruction: true },
  { id: 'fix', icon: 'wrench-outline', label: 'Fix', needsSelectionHint: true },
  { id: 'refactor', icon: 'file-refresh-outline', label: 'Refactor', needsSelectionHint: true },
  { id: 'comment', icon: 'comment-text-outline', label: 'Comment', needsSelectionHint: true },
  { id: 'continue', icon: 'arrow-right-bold-outline', label: 'Continue', needsSelectionHint: false },
];

/** How much surrounding text (chars) to pull around the cursor for Generate/Continue's cursorContext. */
const CURSOR_CONTEXT_RADIUS = 1500;

function getSelectionText(tab, selectionRange) {
  if (!tab || !selectionRange || selectionRange.start === selectionRange.end) return null;
  return tab.content.slice(selectionRange.start, selectionRange.end);
}

/**
 * Bottom sheet offering the six AI code actions, operating on the
 * active editor tab's real content/selection via useEditorStore and the
 * per-tab handler registry (for cursor position). Results stream into
 * useAIStore.actionResult and can be inserted back into the editor at
 * the cursor via the same insertTextAtCursor handler the Chat panel
 * uses, or copied to the clipboard.
 */
export default function AICodeActionsSheet({ visible, onDismiss }) {
  const theme = useCodeForgeTheme();
  const panes = useEditorStore((s) => s.panes);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId) || null;

  const actionResult = useAIStore((s) => s.actionResult);
  const runOneOffAction = useAIStore((s) => s.runOneOffAction);
  const clearActionResult = useAIStore((s) => s.clearActionResult);
  const stopAction = useAIStore((s) => s.stopAction);

  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);
  const isConfigured = aiProvider === 'anthropic' || aiProvider === 'openai' ? !!aiApiKey : true;

  const [instruction, setInstruction] = useState('');

  const handleDismiss = useCallback(() => {
    if (actionResult?.isStreaming) stopAction();
    clearActionResult();
    setInstruction('');
    onDismiss();
  }, [actionResult, stopAction, clearActionResult, onDismiss]);

  const runAction = useCallback(
    (actionId) => {
      if (!activeTab) return;

      const handlers = useEditorHandlersStore.getState().getHandlers(activeTab.id);
      const cursor = handlers?.getSelection ? handlers.getSelection() : null;
      const selection = getSelectionText(activeTab, cursor);

      const baseParams = {
        code: activeTab.content,
        language: activeTab.language,
        fileName: activeTab.name,
        selection,
      };

      if (actionId === 'generate') {
        if (!instruction.trim()) return;
        let cursorContext = null;
        if (cursor) {
          const start = Math.max(0, cursor.start - CURSOR_CONTEXT_RADIUS);
          const end = Math.min(activeTab.content.length, cursor.start + CURSOR_CONTEXT_RADIUS);
          cursorContext =
            activeTab.content.slice(start, cursor.start) + '<CURSOR>' + activeTab.content.slice(cursor.start, end);
        }
        runOneOffAction('generate', { instruction: instruction.trim(), language: activeTab.language, fileName: activeTab.name, cursorContext });
        return;
      }

      if (actionId === 'continue') {
        let cursorContext = activeTab.content;
        if (cursor) {
          const start = Math.max(0, cursor.start - CURSOR_CONTEXT_RADIUS);
          cursorContext = activeTab.content.slice(start, cursor.start);
        }
        runOneOffAction('continue', { code: activeTab.content, language: activeTab.language, fileName: activeTab.name, cursorContext });
        return;
      }

      runOneOffAction(actionId, baseParams);
    },
    [activeTab, instruction, runOneOffAction]
  );

  const handleInsert = useCallback(() => {
    if (!activeTab || !actionResult?.text) return;
    const codeBlock = extractFirstCodeBlock(actionResult.text);
    const textToInsert = codeBlock ? codeBlock.code : actionResult.text;
    const handlers = useEditorHandlersStore.getState().getHandlers(activeTab.id);
    if (handlers?.insertTextAtCursor) {
      handlers.insertTextAtCursor(textToInsert);
      Toast.show({ type: 'success', text1: 'Inserted into editor' });
    }
  }, [activeTab, actionResult]);

  const handleCopy = useCallback(async () => {
    if (!actionResult?.text) return;
    await Clipboard.setStringAsync(actionResult.text);
    Toast.show({ type: 'success', text1: 'Copied to clipboard' });
  }, [actionResult]);

  const activeAction = actionResult ? ACTIONS.find((a) => a.id === actionResult.actionId) : null;

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={handleDismiss}
      onSwipeComplete={handleDismiss}
      swipeDirection="down"
      style={styles.modal}
      backdropOpacity={0.4}
      avoidKeyboard
    >
      <View style={[styles.sheet, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={styles.handle} />

        {!activeTab ? (
          <Text style={{ color: theme.palette.onSurfaceDim, textAlign: 'center', paddingVertical: 20 }}>
            Open a file to use AI code actions.
          </Text>
        ) : !isConfigured ? (
          <Text style={{ color: theme.palette.onSurfaceDim, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 20 }}>
            Add an API key in Settings → AI Assistant to use code actions.
          </Text>
        ) : actionResult ? (
          <View style={styles.resultContainer}>
            <View style={styles.resultHeader}>
              <MaterialCommunityIcons name={activeAction?.icon || 'robot-outline'} size={16} color={theme.palette.primary} />
              <Text style={{ color: theme.palette.onSurface, fontWeight: '600', marginLeft: 6, flex: 1 }}>
                {activeAction?.label || 'Result'}
              </Text>
              <Pressable onPress={clearActionResult} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={18} color={theme.palette.onSurfaceVariant} />
              </Pressable>
            </View>

            <ScrollView style={styles.resultScroll} contentContainerStyle={{ padding: 12 }}>
              {actionResult.error ? (
                <View style={styles.errorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.palette.error} />
                  <Text style={{ color: theme.palette.error, marginLeft: 6, flex: 1 }}>{actionResult.error}</Text>
                </View>
              ) : actionResult.text ? (
                <Text selectable style={{ color: theme.palette.onSurface, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 18 }}>
                  {actionResult.text}
                </Text>
              ) : (
                <ActivityIndicator size={16} color={theme.palette.onSurfaceDim} />
              )}
              {actionResult.isStreaming && actionResult.text ? (
                <ActivityIndicator size={12} color={theme.palette.onSurfaceDim} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
              ) : null}
            </ScrollView>

            <View style={styles.resultActions}>
              {actionResult.isStreaming ? (
                <Button onPress={stopAction} textColor={theme.palette.error}>
                  Stop
                </Button>
              ) : (
                <>
                  <Button onPress={() => runAction(actionResult.actionId)} textColor={theme.palette.onSurfaceVariant}>
                    Retry
                  </Button>
                  <Button onPress={handleCopy} textColor={theme.palette.onSurfaceVariant}>
                    Copy
                  </Button>
                  {!actionResult.error && (
                    <Button onPress={handleInsert} mode="contained">
                      Insert
                    </Button>
                  )}
                </>
              )}
            </View>
          </View>
        ) : (
          <>
            <Text numberOfLines={1} style={{ color: theme.palette.onSurfaceVariant, paddingHorizontal: 20, marginBottom: 12 }}>
              AI actions on {activeTab.name}
            </Text>

            <View style={styles.generateInputRow}>
              <RNTextInput
                value={instruction}
                onChangeText={setInstruction}
                placeholder={'What should Generate write? (e.g. "a function that sorts by date")'}
                placeholderTextColor={theme.palette.onSurfaceDim}
                style={[
                  styles.generateInput,
                  { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer },
                ]}
                multiline
              />
            </View>

            <View style={styles.actionsGrid}>
              {ACTIONS.map((action) => (
                <Pressable
                  key={action.id}
                  onPress={() => runAction(action.id)}
                  disabled={action.needsInstruction && !instruction.trim()}
                  style={({ pressed }) => [
                    styles.actionCell,
                    {
                      backgroundColor: pressed ? theme.palette.surfaceContainerHighest : theme.palette.surfaceContainer,
                      opacity: action.needsInstruction && !instruction.trim() ? 0.5 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={action.icon} size={20} color={theme.palette.primary} />
                  <Text style={{ color: theme.palette.onSurface, fontSize: 12.5, marginTop: 6 }}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 20, paddingTop: 8, maxHeight: '75%' },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.4)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  generateInputRow: { paddingHorizontal: 16, marginBottom: 12 },
  generateInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, maxHeight: 70 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  actionCell: {
    width: '31%',
    aspectRatio: 1.3,
    margin: '1.16%',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContainer: { flex: 1, minHeight: 200 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  resultScroll: { flexGrow: 0 },
  resultActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, marginTop: 8, gap: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start' },
});
