import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput as RNTextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useGitStore } from '../state/useGitStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { getFileIcon } from '../utils/pathUtils';

const STATUS_LABELS = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: 'U',
  conflict: '!',
};

/**
 * Git source-control sidebar panel: shows unstaged and staged changes
 * separately (VS Code's two-section model), lets the user stage/unstage
 * individual files or everything at once, and provides the commit
 * composer. Also offers "Initialize Repository" when the workspace
 * isn't a git repo yet.
 */
export default function GitStatusPanel({ onOpenDiff }) {
  const theme = useCodeForgeTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const isRepo = useGitStore((s) => s.isRepo);
  const isLoading = useGitStore((s) => s.isLoading);
  const status = useGitStore((s) => s.status);
  const currentBranch = useGitStore((s) => s.currentBranch);
  const errorMessage = useGitStore((s) => s.errorMessage);

  const checkRepoState = useGitStore((s) => s.checkRepoState);
  const initRepo = useGitStore((s) => s.initRepo);
  const stagePath = useGitStore((s) => s.stagePath);
  const unstagePath = useGitStore((s) => s.unstagePath);
  const stageAll = useGitStore((s) => s.stageAll);
  const commitAction = useGitStore((s) => s.commit);
  const refreshStatus = useGitStore((s) => s.refreshStatus);

  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (workspace) checkRepoState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.uri]);

  const handleInit = useCallback(async () => {
    const result = await initRepo();
    if (result.success) {
      Toast.show({ type: 'success', text1: 'Repository initialized' });
    } else {
      Toast.show({ type: 'error', text1: 'Init failed', text2: result.error });
    }
  }, [initRepo]);

  const handleCommit = useCallback(async () => {
    setCommitting(true);
    const result = await commitAction(commitMessage);
    setCommitting(false);
    if (result.success) {
      setCommitMessage('');
      Toast.show({ type: 'success', text1: 'Committed', text2: result.sha?.slice(0, 8) });
    } else {
      Toast.show({ type: 'error', text1: 'Commit failed', text2: result.error });
    }
  }, [commitAction, commitMessage]);

  if (!workspace) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.palette.surfaceContainerLow }]}>
        <Text style={{ color: theme.palette.onSurfaceDim }}>Open a folder to use source control</Text>
      </View>
    );
  }

  if (!isRepo) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.palette.surfaceContainerLow }]}>
        <MaterialCommunityIcons name="source-branch" size={32} color={theme.palette.onSurfaceDim} />
        <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 12, marginBottom: 16, textAlign: 'center', paddingHorizontal: 24 }}>
          This folder isn't a git repository yet.
        </Text>
        <Button mode="contained" onPress={handleInit} loading={isLoading}>
          Initialize Repository
        </Button>
      </View>
    );
  }

  const unstagedChanges = status.filter((s) => !s.staged);
  const stagedChanges = status.filter((s) => s.staged);

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}>
      <View style={[styles.branchRow, { borderBottomColor: theme.palette.outlineVariant }]}>
        <MaterialCommunityIcons name="source-branch" size={14} color={theme.palette.primary} />
        <Text numberOfLines={1} style={{ color: theme.palette.onSurface, marginLeft: 6, fontSize: 12.5, flex: 1 }}>
          {currentBranch || 'detached HEAD'}
        </Text>
        <Pressable onPress={refreshStatus} hitSlop={8}>
          {isLoading ? (
            <ActivityIndicator size={14} color={theme.palette.primary} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={16} color={theme.palette.onSurfaceVariant} />
          )}
        </Pressable>
      </View>

      <View style={styles.commitBox}>
        <RNTextInput
          value={commitMessage}
          onChangeText={setCommitMessage}
          placeholder="Commit message"
          placeholderTextColor={theme.palette.onSurfaceDim}
          multiline
          style={[
            styles.commitInput,
            { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer, borderColor: theme.palette.outlineVariant },
          ]}
        />
        <Button
          mode="contained"
          onPress={handleCommit}
          loading={committing}
          disabled={stagedChanges.length === 0 || !commitMessage.trim()}
          style={{ marginTop: 6 }}
          contentStyle={{ height: 34 }}
        >
          {`Commit${stagedChanges.length > 0 ? ` (${stagedChanges.length})` : ''}`}
        </Button>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={{ color: theme.palette.error, fontSize: 11.5 }} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>
      )}

      <FlatList
        data={[
          ...(stagedChanges.length > 0 ? [{ type: 'header', label: 'STAGED CHANGES', key: 'staged-header' }] : []),
          ...stagedChanges.map((s) => ({ type: 'file', ...s, key: `staged-${s.path}` })),
          ...(unstagedChanges.length > 0 ? [{ type: 'header', label: 'CHANGES', key: 'unstaged-header', showStageAll: true }] : []),
          ...unstagedChanges.map((s) => ({ type: 'file', ...s, key: `unstaged-${s.path}` })),
        ]}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={{ color: theme.palette.onSurfaceDim, padding: 20 }}>No changes</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11, fontWeight: '600', flex: 1 }}>
                  {item.label}
                </Text>
                {item.showStageAll && (
                  <Pressable onPress={stageAll} hitSlop={6}>
                    <Text style={{ color: theme.palette.primary, fontSize: 11 }}>Stage All</Text>
                  </Pressable>
                )}
              </View>
            );
          }
          return (
            <Pressable onPress={() => onOpenDiff?.(item)} style={styles.fileRow}>
              <MaterialCommunityIcons name={getFileIcon(item.path, false)} size={15} color={theme.palette.onSurfaceVariant} />
              <Text numberOfLines={1} style={{ color: theme.palette.onSurface, flex: 1, marginLeft: 8, fontSize: 12.5 }}>
                {item.path}
              </Text>
              <Text style={{ color: theme.palette.git[item.status] || theme.palette.onSurfaceDim, fontSize: 11, fontWeight: '700', marginRight: 8 }}>
                {STATUS_LABELS[item.status] || '?'}
              </Text>
              <Pressable onPress={() => (item.staged ? unstagePath(item.path) : stagePath(item.path))} hitSlop={8}>
                <MaterialCommunityIcons
                  name={item.staged ? 'minus' : 'plus'}
                  size={16}
                  color={theme.palette.onSurfaceVariant}
                />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 16 },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 34,
    borderBottomWidth: 1,
  },
  commitBox: { padding: 8 },
  commitInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  errorBanner: { paddingHorizontal: 10, paddingBottom: 6 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
