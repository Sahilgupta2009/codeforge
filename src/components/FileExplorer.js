import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useExplorerStore } from '../state/useExplorerStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { useGitStore } from '../state/useGitStore';
import { FS } from '../filesystem/FileSystemRouter';
import { FileSystemEventBus, FS_EVENTS } from '../filesystem/FileSystemEventBus';
import { sortEntries } from '../utils/pathUtils';
import FileTreeRow from './FileTreeRow';
import ExplorerContextMenu from './ExplorerContextMenu';
import ExplorerDialogs from './ExplorerDialogs';
import ExplorerPasteBar from './ExplorerPasteBar';

/**
 * Flattens the expanded-directory tree into a single array suitable for
 * FlatList virtualization. This is the standard technique for performant
 * tree views: rather than recursively nesting components per directory
 * (which breaks virtualization — FlatList can't window rows it doesn't
 * know exist ahead of time), we compute the full visible row list up
 * front from cached directory listings + expanded-state, and let
 * FlatList window *that* flat array.
 *
 * Only expanded directories' children are included; collapsed
 * directories contribute just their own row. Directories that are
 * expanded but not yet cached contribute a row + are queued for loading
 * (handled by the loadDirectory effect below), so opening a huge project
 * never walks more of the tree than what's actually visible.
 */
function flattenTree(rootUri, directoryCache, expandedDirs, excludePatterns) {
  const rows = [];

  function walk(dirUri, depth, relativePathPrefix) {
    const entries = directoryCache[dirUri];
    if (!entries) return; // Not loaded yet — nothing to flatten below this point.

    const filtered = entries.filter((e) => !excludePatterns.includes(e.name));
    const sorted = sortEntries(filtered);

    for (const entry of sorted) {
      const relativePath = relativePathPrefix ? `${relativePathPrefix}/${entry.name}` : entry.name;
      rows.push({ ...entry, depth, parentUri: dirUri, relativePath });
      if (entry.isDirectory && expandedDirs[entry.uri]) {
        walk(entry.uri, depth + 1, relativePath);
      }
    }
  }

  walk(rootUri, 0, '');
  return rows;
}

export default function FileExplorer({ onOpenFile }) {
  const theme = useCodeForgeTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const expandedDirs = useWorkspaceStore((s) => s.expandedDirs);
  const directoryCache = useWorkspaceStore((s) => s.directoryCache);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const setDirectoryCache = useWorkspaceStore((s) => s.setDirectoryCache);
  const invalidateDirectoryCache = useWorkspaceStore((s) => s.invalidateDirectoryCache);
  const excludePatterns = useSettingsStore((s) => s.excludePatterns);

  const openContextMenu = useExplorerStore((s) => s.openContextMenu);
  const openDialog = useExplorerStore((s) => s.openDialog);
  const selectedUris = useExplorerStore((s) => s.selectedUris);
  const multiSelectMode = useExplorerStore((s) => s.multiSelectMode);
  const toggleSelected = useExplorerStore((s) => s.toggleSelected);
  const clipboard = useExplorerStore((s) => s.clipboard);

  const [loadingDirs, setLoadingDirs] = useState({}); // uri -> true while fetching
  const [rootLoaded, setRootLoaded] = useState(false);
  const [rootError, setRootError] = useState(null);
  const activeFileUri = useRef(null); // set by parent via onOpenFile consumer, tracked for highlight

  const rootUri = workspace?.uri;

  const loadDirectory = useCallback(
    async (dirUri) => {
      setLoadingDirs((s) => ({ ...s, [dirUri]: true }));
      try {
        const entries = await FS.listDirectory(dirUri);
        setDirectoryCache(dirUri, entries);
        if (dirUri === rootUri) {
          setRootLoaded(true);
          setRootError(null);
        }
      } catch (err) {
        if (dirUri === rootUri) {
          setRootError(err.message || 'Failed to open this folder.');
        } else {
          Toast.show({ type: 'error', text1: 'Could not load folder', text2: err.message });
        }
      } finally {
        setLoadingDirs((s) => {
          const next = { ...s };
          delete next[dirUri];
          return next;
        });
      }
    },
    [rootUri, setDirectoryCache]
  );

  // Load the root directory as soon as a workspace is opened.
  useEffect(() => {
    if (rootUri && !directoryCache[rootUri]) {
      loadDirectory(rootUri);
    } else if (rootUri) {
      setRootLoaded(true);
    }
  }, [rootUri]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazily load any directory the instant it's expanded but not yet cached.
  useEffect(() => {
    Object.keys(expandedDirs).forEach((uri) => {
      if (expandedDirs[uri] && !directoryCache[uri] && !loadingDirs[uri]) {
        loadDirectory(uri);
      }
    });
  }, [expandedDirs, directoryCache, loadingDirs, loadDirectory]);

  // Keep the tree in sync with mutations made elsewhere (rename dialog,
  // Git checkout, terminal file ops) by invalidating + reloading the
  // affected parent directory's cache when the event bus fires.
  useEffect(() => {
    const unsubs = [
      FileSystemEventBus.on(FS_EVENTS.CREATED, ({ parentUri }) => {
        invalidateDirectoryCache(parentUri);
        loadDirectory(parentUri);
      }),
      FileSystemEventBus.on(FS_EVENTS.DELETED, ({ parentUri }) => {
        invalidateDirectoryCache(parentUri);
        loadDirectory(parentUri);
      }),
      FileSystemEventBus.on(FS_EVENTS.RENAMED, () => {
        // Renames touch two logical spots (old removed, new added) but
        // since our rename always keeps the same parent, refresh root's
        // relevant cached parent by just refreshing every currently
        // expanded directory's cache is overkill — instead we refresh
        // the whole visible cache set, which for typical project sizes
        // (hundreds, not tens of thousands, of *expanded* dirs) is cheap.
        Object.keys(expandedDirs).forEach((uri) => {
          if (expandedDirs[uri]) {
            invalidateDirectoryCache(uri);
            loadDirectory(uri);
          }
        });
        if (rootUri) loadDirectory(rootUri);
      }),
      FileSystemEventBus.on(FS_EVENTS.MOVED, ({ oldParentUri, newParentUri }) => {
        invalidateDirectoryCache(oldParentUri);
        invalidateDirectoryCache(newParentUri);
        loadDirectory(oldParentUri);
        loadDirectory(newParentUri);
      }),
      FileSystemEventBus.on(FS_EVENTS.COPIED, () => {
        // Copy targets are refreshed by the dialog itself (it knows the
        // destination directly); nothing to do globally here.
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [expandedDirs, invalidateDirectoryCache, loadDirectory, rootUri]);

  const rows = useMemo(() => {
    if (!rootUri) return [];
    return flattenTree(rootUri, directoryCache, expandedDirs, excludePatterns);
  }, [rootUri, directoryCache, expandedDirs, excludePatterns]);

  // Git status entries are keyed by relative path ("src/App.js"), not
  // SAF URI, since that's the vocabulary git itself uses (see
  // GitService.getStatus). Building a Map once per status change (not
  // per row) keeps the per-row lookup O(1) instead of re-scanning the
  // status array for every visible row on every render.
  const gitStatusList = useGitStore((s) => s.status);
  const isGitRepo = useGitStore((s) => s.isRepo);
  const gitStatusByPath = useMemo(() => {
    if (!isGitRepo) return null;
    const map = new Map();
    for (const entry of gitStatusList) {
      map.set(entry.path, entry.status);
    }
    return map;
  }, [gitStatusList, isGitRepo]);

  const handlePress = useCallback(
    (entry) => {
      if (multiSelectMode) {
        toggleSelected(entry.uri);
        return;
      }
      if (entry.isDirectory) {
        toggleExpanded(entry.uri);
      } else {
        onOpenFile?.(entry);
        activeFileUri.current = entry.uri;
      }
    },
    [multiSelectMode, toggleSelected, toggleExpanded, onOpenFile]
  );

  const handleLongPress = useCallback(
    (entry) => {
      openContextMenu({
        uri: entry.uri,
        name: entry.name,
        isDirectory: entry.isDirectory,
        parentUri: entry.parentUri,
      });
    },
    [openContextMenu]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <FileTreeRow
        entry={item}
        depth={item.depth}
        isExpanded={!!expandedDirs[item.uri]}
        isLoading={!!loadingDirs[item.uri]}
        isSelected={selectedUris.includes(item.uri)}
        isActive={activeFileUri.current === item.uri}
        gitStatus={gitStatusByPath ? gitStatusByPath.get(item.relativePath) || null : null}
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
    ),
    [expandedDirs, loadingDirs, selectedUris, gitStatusByPath, handlePress, handleLongPress]
  );

  if (!workspace) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}>
      <View style={[styles.header, { borderBottomColor: theme.palette.outlineVariant }]}>
        <Text
          variant="labelLarge"
          numberOfLines={1}
          style={{ color: theme.palette.onSurfaceVariant, flex: 1, letterSpacing: 0.5 }}
        >
          {workspace.name.toUpperCase()}
        </Text>
        <IconButton
          icon="file-plus-outline"
          size={17}
          onPress={() => openDialog('create-file', { uri: workspace.uri, isDirectory: true })}
          accessibilityLabel="New file"
        />
        <IconButton
          icon="folder-plus-outline"
          size={17}
          onPress={() => openDialog('create-folder', { uri: workspace.uri, isDirectory: true })}
          accessibilityLabel="New folder"
        />
        <IconButton
          icon="refresh"
          size={17}
          onPress={() => {
            invalidateDirectoryCache(workspace.uri);
            loadDirectory(workspace.uri);
          }}
          accessibilityLabel="Refresh"
        />
      </View>

      {!rootLoaded && !rootError && (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      )}

      {rootError && (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={theme.palette.error} />
          <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
            {rootError}
          </Text>
          <IconButton icon="refresh" onPress={() => loadDirectory(workspace.uri)} />
        </View>
      )}

      {rootLoaded && rows.length === 0 && (
        <View style={styles.centerState}>
          <Text style={{ color: theme.palette.onSurfaceDim }}>This folder is empty</Text>
        </View>
      )}

      {rootLoaded && rows.length > 0 && (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.uri}
          renderItem={renderItem}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews
          getItemLayout={(_, index) => ({ length: 34, offset: 34 * index, index })}
        />
      )}

      {clipboard && (
        <ExplorerPasteBar targetDirUri={workspace.uri} targetDirName={workspace.name} />
      )}

      <ExplorerContextMenu />
      <ExplorerDialogs />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: 12,
    borderBottomWidth: 1,
  },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
