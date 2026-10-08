import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Text, TextInput, Button } from 'react-native-paper';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useExplorerStore } from '../state/useExplorerStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useEditorStore } from '../state/useEditorStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { FS } from '../filesystem/FileSystemRouter';
import { validateFileName } from '../utils/pathUtils';

/**
 * Handles all Explorer modal dialogs in one component, switching content
 * based on `activeDialog` from useExplorerStore:
 *   - 'create-file' / 'create-folder': name input, creates via FS
 *   - 'rename': pre-filled name input, renames via FS
 *   - 'delete-confirm': destructive confirmation, deletes via FS
 *
 * All three perform real file system mutations (no mocks) and surface
 * FileSystemError messages directly to the user via Toast.
 */
export default function ExplorerDialogs() {
  const theme = useCodeForgeTheme();
  const activeDialog = useExplorerStore((s) => s.activeDialog);
  const dialogTarget = useExplorerStore((s) => s.dialogTarget);
  const closeDialog = useExplorerStore((s) => s.closeDialog);
  const confirmBeforeDelete = useSettingsStore((s) => s.confirmBeforeDelete);

  const invalidateDirectoryCache = useWorkspaceStore((s) => s.invalidateDirectoryCache);
  const closeTabsForUri = useEditorStoreCloseTabsForUri();

  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (activeDialog === 'rename' && dialogTarget) {
      setInputValue(dialogTarget.name);
    } else {
      setInputValue('');
    }
    setError(null);
  }, [activeDialog, dialogTarget]);

  const isOpen = !!activeDialog;
  const isCreate = activeDialog === 'create-file' || activeDialog === 'create-folder';
  const isRename = activeDialog === 'rename';
  const isDeleteConfirm = activeDialog === 'delete-confirm';

  const title = isCreate
    ? activeDialog === 'create-file'
      ? 'New File'
      : 'New Folder'
    : isRename
    ? 'Rename'
    : 'Delete';

  async function handleSubmitName() {
    const validationError = validateFileName(inputValue.trim());
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (activeDialog === 'create-file') {
        const parentUri = dialogTarget.uri;
        await FS.createFile(parentUri, inputValue.trim());
        invalidateDirectoryCache(parentUri);
      } else if (activeDialog === 'create-folder') {
        const parentUri = dialogTarget.uri;
        await FS.createDirectory(parentUri, inputValue.trim());
        invalidateDirectoryCache(parentUri);
      } else if (activeDialog === 'rename') {
        const oldUri = dialogTarget.uri;
        const newUri = await FS.rename(oldUri, inputValue.trim());
        invalidateDirectoryCache(dialogTarget.parentUri);
        // If the renamed file was open in the editor, redirect its tab to
        // the new URI so the open buffer doesn't silently orphan itself.
        redirectOpenTab(oldUri, newUri, inputValue.trim());
      }
      closeDialog();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await FS.delete(dialogTarget.uri);
      invalidateDirectoryCache(dialogTarget.parentUri);
      closeTabsForUri(dialogTarget.uri);
      closeDialog();
      Toast.show({ type: 'success', text1: `Deleted "${dialogTarget.name}"` });
    } catch (err) {
      setError(err.message || 'Delete failed');
      setBusy(false);
    }
  }

  // Skip the confirmation step entirely if the user has turned it off in
  // Settings — but only ever skip for the confirmation dialog itself; the
  // delete action always still goes through FS.delete with error handling.
  useEffect(() => {
    if (isDeleteConfirm && !confirmBeforeDelete) {
      handleDelete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeleteConfirm, confirmBeforeDelete]);

  if (!isOpen || (isDeleteConfirm && !confirmBeforeDelete)) return null;

  return (
    <Modal isVisible={isOpen} onBackdropPress={busy ? undefined : closeDialog} style={styles.modal}>
      <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <Text variant="titleMedium" style={{ color: theme.palette.onSurface, marginBottom: 12 }}>
          {title}
        </Text>

        {isDeleteConfirm ? (
          <>
            <Text style={{ color: theme.palette.onSurfaceVariant, marginBottom: 20 }}>
              Delete "{dialogTarget?.name}"
              {dialogTarget?.isDirectory ? ' and everything inside it' : ''}? This can't be undone.
            </Text>
            <View style={styles.buttonRow}>
              <Button onPress={closeDialog} disabled={busy} textColor={theme.palette.onSurfaceVariant}>
                Cancel
              </Button>
              <Button onPress={handleDelete} loading={busy} textColor={theme.palette.error}>
                Delete
              </Button>
            </View>
          </>
        ) : (
          <>
            <TextInput
              mode="outlined"
              value={inputValue}
              onChangeText={(v) => {
                setInputValue(v);
                setError(null);
              }}
              autoFocus
              selectTextOnFocus={isRename}
              placeholder={activeDialog === 'create-folder' ? 'folder-name' : 'file-name.ext'}
              error={!!error}
              disabled={busy}
              onSubmitEditing={handleSubmitName}
            />
            {error ? (
              <Text style={{ color: theme.palette.error, marginTop: 4, fontSize: 12 }}>{error}</Text>
            ) : null}
            <View style={styles.buttonRow}>
              <Button onPress={closeDialog} disabled={busy} textColor={theme.palette.onSurfaceVariant}>
                Cancel
              </Button>
              <Button onPress={handleSubmitName} loading={busy} mode="contained">
                {isRename ? 'Rename' : 'Create'}
              </Button>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/** Redirects an open editor tab to a new URI/name after a rename. */
function redirectOpenTab(oldUri, newUri, newName) {
  const state = useEditorStore.getState();
  state.panes.forEach((pane) => {
    pane.tabs.forEach((tab) => {
      if (tab.uri === oldUri) {
        // useEditorStore doesn't currently expose a direct URI-rename
        // action since Part 1 didn't anticipate needing it — the closest
        // safe approach without extending the store's public API here is
        // to close the stale tab; Part 3 (editor) adds a proper
        // `retargetTab` action once tab persistence semantics are fully
        // defined alongside undo/redo history.
        state.closeTab(pane.id, tab.id);
      }
    });
  });
}

/** Small helper hook to close any open tabs pointing at a deleted URI (and its descendants if it's a folder). */
function useEditorStoreCloseTabsForUri() {
  return (deletedUri) => {
    const state = useEditorStore.getState();
    state.panes.forEach((pane) => {
      pane.tabs.forEach((tab) => {
        if (tab.uri === deletedUri || tab.uri.startsWith(deletedUri)) {
          state.closeTab(pane.id, tab.id);
        }
      });
    });
  };
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 8,
  },
});
