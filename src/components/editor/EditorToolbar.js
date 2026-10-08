import React from 'react';
import { View, StyleSheet } from 'react-native';
import { IconButton } from 'react-native-paper';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useEditorStore } from '../../state/useEditorStore';
import { useSettingsStore } from '../../state/useSettingsStore';
import { useEditorHandlersStore } from '../../state/useEditorHandlersStore';

/**
 * A slim, always-visible action bar above the editor. Hardware-keyboard
 * shortcuts (Part 4) cover the same actions for users with a keyboard
 * attached, but touch-only users need tappable equivalents for
 * save/undo/redo/find/zoom — this bar is that surface. As of Part 10,
 * HTML and Markdown tabs also get a live-preview toggle (eye icon) —
 * see EditorPane.js for the split-view layout it controls.
 */
export default function EditorToolbar({ tab, onSave, onToggleFind, onGoToLine, onOpenAIActions, previewAvailable, previewVisible, onTogglePreview, onRun }) {
  const theme = useCodeForgeTheme();
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const handlers = useEditorHandlersStore((s) => s.handlersByTabId[tab.id]);

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow, borderBottomColor: theme.palette.outlineVariant }]}>
      {onRun && (
        <>
          <IconButton
            icon="play"
            size={20}
            iconColor="#4caf50"
            onPress={onRun}
            accessibilityLabel="Run file"
          />
          <View style={styles.divider} />
        </>
      )}
      <IconButton icon="content-save-outline" size={18} onPress={onSave} disabled={!tab.isDirty} />
      <IconButton icon="undo" size={18} onPress={() => handlers?.undo()} />
      <IconButton icon="redo" size={18} onPress={() => handlers?.redo()} />
      <View style={styles.divider} />
      <IconButton icon="magnify" size={18} onPress={onToggleFind} />
      <IconButton icon="target" size={18} onPress={onGoToLine} accessibilityLabel="Go to line" />
      <View style={styles.divider} />
      <IconButton
        icon="wrap"
        size={18}
        iconColor={wordWrap ? theme.palette.primary : theme.palette.onSurfaceVariant}
        onPress={() => setSetting('wordWrap', !wordWrap)}
        accessibilityLabel="Toggle word wrap"
      />
      {previewAvailable && (
        <>
          <View style={styles.divider} />
          <IconButton
            icon={previewVisible ? 'eye' : 'eye-outline'}
            size={18}
            iconColor={previewVisible ? theme.palette.primary : theme.palette.onSurfaceVariant}
            onPress={onTogglePreview}
            accessibilityLabel="Toggle live preview"
          />
        </>
      )}
      {onOpenAIActions && (
        <>
          <View style={styles.divider} />
          <IconButton
            icon="creation"
            size={18}
            iconColor={theme.palette.primary}
            onPress={onOpenAIActions}
            accessibilityLabel="AI code actions"
          />
        </>
      )}
      <View style={{ flex: 1 }} />
      <IconButton icon="magnify-minus-outline" size={18} onPress={zoomOut} />
      <IconButton icon="magnify-plus-outline" size={18} onPress={zoomIn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderBottomWidth: 1,
    paddingHorizontal: 2,
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(150,150,150,0.25)',
    marginHorizontal: 2,
  },
});
