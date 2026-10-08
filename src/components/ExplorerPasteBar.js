import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useExplorerStore } from '../state/useExplorerStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { FS } from '../filesystem/FileSystemRouter';

/**
 * Appears as a floating bar at the bottom of the Explorer whenever
 * something is on the clipboard (from Copy or Cut). Pastes into the
 * workspace root by default; to paste into a specific subfolder, the
 * user long-presses that folder and chooses "Paste Here" from the
 * context menu instead (see FileExplorer's integration — folders get an
 * extra context-menu action when clipboard is non-empty).
 */
export default function ExplorerPasteBar({ targetDirUri, targetDirName }) {
  const theme = useCodeForgeTheme();
  const clipboard = useExplorerStore((s) => s.clipboard);
  const clearClipboard = useExplorerStore((s) => s.clearClipboard);
  const invalidateDirectoryCache = useWorkspaceStore((s) => s.invalidateDirectoryCache);
  const [busy, setBusy] = useState(false);

  if (!clipboard) return null;

  async function handlePaste() {
    setBusy(true);
    try {
      if (clipboard.mode === 'copy') {
        await FS.copy(clipboard.uri, targetDirUri);
      } else {
        await FS.move(clipboard.uri, targetDirUri);
      }
      invalidateDirectoryCache(targetDirUri);
      invalidateDirectoryCache(clipboard.parentUri);
      clearClipboard();
      Toast.show({ type: 'success', text1: `Pasted "${clipboard.name}"` });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Paste failed', text2: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.palette.surfaceContainerHighest, borderColor: theme.palette.outline },
      ]}
    >
      <MaterialCommunityIcons
        name={clipboard.mode === 'copy' ? 'content-copy' : 'content-cut'}
        size={16}
        color={theme.palette.onSurfaceVariant}
      />
      <Text numberOfLines={1} style={{ color: theme.palette.onSurfaceVariant, flex: 1, marginLeft: 8, fontSize: 12.5 }}>
        {clipboard.name}
      </Text>
      <Pressable onPress={handlePaste} disabled={busy} style={styles.pasteButton}>
        <Text style={{ color: theme.palette.primary, fontWeight: '600', fontSize: 13 }}>
          {busy ? 'Pasting…' : `Paste into ${targetDirName}`}
        </Text>
      </Pressable>
      <Pressable onPress={clearClipboard} hitSlop={8} style={{ marginLeft: 8 }}>
        <MaterialCommunityIcons name="close" size={16} color={theme.palette.onSurfaceDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  pasteButton: { paddingHorizontal: 8, paddingVertical: 4 },
});
