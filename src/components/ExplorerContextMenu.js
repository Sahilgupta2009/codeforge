import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Modal from 'react-native-modal';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useExplorerStore } from '../state/useExplorerStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { FS } from '../filesystem/FileSystemRouter';

/**
 * A bottom-sheet action menu, opened by long-pressing a file/folder row.
 * Mobile-appropriate replacement for a desktop right-click menu — full
 * width, large touch targets, dismiss-by-swipe-down.
 */
export default function ExplorerContextMenu() {
  const theme = useCodeForgeTheme();
  const target = useExplorerStore((s) => s.contextMenuTarget);
  const closeContextMenu = useExplorerStore((s) => s.closeContextMenu);
  const openDialog = useExplorerStore((s) => s.openDialog);
  const setClipboard = useExplorerStore((s) => s.setClipboard);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const clearClipboard = useExplorerStore((s) => s.clearClipboard);
  const invalidateDirectoryCache = useWorkspaceStore((s) => s.invalidateDirectoryCache);

  const isOpen = !!target;

  const handleCopyPath = useCallback(async () => {
    if (!target) return;
    await Clipboard.setStringAsync(target.uri);
    Toast.show({ type: 'success', text1: 'Path copied' });
    closeContextMenu();
  }, [target, closeContextMenu]);

  const handleCopy = useCallback(() => {
    if (!target) return;
    setClipboard(target, 'copy');
    Toast.show({ type: 'info', text1: `Copied "${target.name}"`, text2: 'Paste into another folder' });
  }, [target, setClipboard]);

  const handleCut = useCallback(() => {
    if (!target) return;
    setClipboard(target, 'cut');
    Toast.show({ type: 'info', text1: `"${target.name}" ready to move`, text2: 'Paste into another folder' });
  }, [target, setClipboard]);

  if (!target) return null;

  const handlePasteHere = async () => {
    if (!clipboard) return;
    try {
      if (clipboard.mode === 'copy') {
        await FS.copy(clipboard.uri, target.uri);
      } else {
        await FS.move(clipboard.uri, target.uri);
      }
      invalidateDirectoryCache(target.uri);
      invalidateDirectoryCache(clipboard.parentUri);
      clearClipboard();
      Toast.show({ type: 'success', text1: `Pasted "${clipboard.name}" into "${target.name}"` });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Paste failed', text2: err.message });
    }
    closeContextMenu();
  };

  const actions = [
    {
      icon: 'pencil-outline',
      label: 'Rename',
      onPress: () => openDialog('rename', target),
    },
    { icon: 'content-copy', label: 'Copy', onPress: handleCopy },
    { icon: 'content-cut', label: 'Cut', onPress: handleCut },
    ...(target.isDirectory && clipboard && clipboard.uri !== target.uri
      ? [{ icon: 'content-paste', label: `Paste "${clipboard.name}" Here`, onPress: handlePasteHere }]
      : []),
    ...(target.isDirectory
      ? [
          {
            icon: 'file-plus-outline',
            label: 'New File Here',
            onPress: () => openDialog('create-file', target),
          },
          {
            icon: 'folder-plus-outline',
            label: 'New Folder Here',
            onPress: () => openDialog('create-folder', target),
          },
        ]
      : []),
    { icon: 'identifier', label: 'Copy Path', onPress: handleCopyPath },
    {
      icon: 'trash-can-outline',
      label: 'Delete',
      destructive: true,
      onPress: () => openDialog('delete-confirm', target),
    },
  ];

  return (
    <Modal
      isVisible={isOpen}
      onBackdropPress={closeContextMenu}
      onSwipeComplete={closeContextMenu}
      swipeDirection="down"
      style={styles.modal}
      backdropOpacity={0.4}
    >
      <View style={[styles.sheet, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <MaterialCommunityIcons
            name={target.isDirectory ? 'folder' : 'file-outline'}
            size={18}
            color={theme.palette.primary}
          />
          <Text numberOfLines={1} style={{ color: theme.palette.onSurface, marginLeft: 8, flex: 1 }}>
            {target.name}
          </Text>
        </View>

        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.actionRow,
              { backgroundColor: pressed ? theme.palette.surfaceContainerHighest : 'transparent' },
            ]}
          >
            <MaterialCommunityIcons
              name={action.icon}
              size={20}
              color={action.destructive ? theme.palette.error : theme.palette.onSurfaceVariant}
            />
            <Text
              style={{
                color: action.destructive ? theme.palette.error : theme.palette.onSurface,
                marginLeft: 16,
                fontSize: 15,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.4)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
});
