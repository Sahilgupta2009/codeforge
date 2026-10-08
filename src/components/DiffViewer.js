import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { FS } from '../filesystem/FileSystemRouter';
import { computeLineDiff, groupIntoHunks, summarizeDiff } from '../git/lineDiff';
import { readFileAtCommit, getHeadCommitOid } from '../git/GitService';

/**
 * Shows a unified diff for a single file: working-tree content (read
 * live from SAF via FS.readFile, so it always reflects unsaved-to-git-
 * but-saved-to-disk edits) versus its content at HEAD (read via git's
 * blob store through readFileAtCommit). For a newly-added/untracked
 * file, the "old" side is simply empty, which computeLineDiff handles
 * as a pure-addition diff.
 */
export default function DiffViewer({ visible, fileStatus, onDismiss }) {
  const theme = useCodeForgeTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);

  const [loading, setLoading] = useState(true);
  const [oldContent, setOldContent] = useState('');
  const [newContent, setNewContent] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !fileStatus || !workspace) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [headOid, resolvedNewContent] = await Promise.all([
          getHeadCommitOid(workspace.uri),
          resolveWorkingTreeContent(workspace.uri, fileStatus),
        ]);

        let resolvedOldContent = '';
        if (headOid && fileStatus.status !== 'untracked' && fileStatus.status !== 'added') {
          resolvedOldContent = await readFileAtCommit(workspace.uri, fileStatus.path, headOid);
        }

        if (!cancelled) {
          setOldContent(resolvedOldContent);
          setNewContent(resolvedNewContent);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, fileStatus, workspace]);

  const diff = useMemo(() => computeLineDiff(oldContent, newContent), [oldContent, newContent]);
  const hunks = useMemo(() => groupIntoHunks(diff, 3), [diff]);
  const summary = useMemo(() => summarizeDiff(diff), [diff]);

  if (!fileStatus) return null;

  return (
    <Modal isVisible={visible} onBackdropPress={onDismiss} style={styles.modal} propagateSwipe>
      <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={[styles.header, { borderBottomColor: theme.palette.outlineVariant }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: theme.palette.onSurface, fontSize: 14, fontWeight: '600' }}>
              {fileStatus.path}
            </Text>
            {!loading && (
              <Text style={{ fontSize: 11, marginTop: 2 }}>
                <Text style={{ color: theme.palette.git.added }}>+{summary.additions} </Text>
                <Text style={{ color: theme.palette.git.deleted }}>-{summary.deletions}</Text>
              </Text>
            )}
          </View>
          <IconButton icon="close" size={18} onPress={onDismiss} />
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.palette.primary} />
          </View>
        )}

        {!loading && error && (
          <View style={styles.centered}>
            <Text style={{ color: theme.palette.error, padding: 16, textAlign: 'center' }}>{error}</Text>
          </View>
        )}

        {!loading && !error && hunks.length === 0 && (
          <View style={styles.centered}>
            <Text style={{ color: theme.palette.onSurfaceDim, padding: 16 }}>No changes to display</Text>
          </View>
        )}

        {!loading && !error && hunks.length > 0 && (
          <ScrollView style={{ maxHeight: 480 }}>
            <ScrollView horizontal>
              <View>
                {hunks.map((hunk, hunkIdx) => (
                  <View key={hunkIdx}>
                    {hunkIdx > 0 && (
                      <View style={[styles.hunkSeparator, { backgroundColor: theme.palette.surfaceContainer }]}>
                        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 10.5 }}>⋯</Text>
                      </View>
                    )}
                    {hunk.lines.map((line, lineIdx) => (
                      <DiffLineRow key={lineIdx} line={line} theme={theme} />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function DiffLineRow({ line, theme }) {
  const bgColor =
    line.type === 'add'
      ? `${theme.palette.git.added}22`
      : line.type === 'remove'
      ? `${theme.palette.git.deleted}22`
      : 'transparent';
  const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
  const markerColor =
    line.type === 'add' ? theme.palette.git.added : line.type === 'remove' ? theme.palette.git.deleted : theme.palette.onSurfaceDim;

  return (
    <View style={[styles.diffRow, { backgroundColor: bgColor }]}>
      <Text style={[styles.lineNumber, { color: theme.palette.onSurfaceDim }]}>{line.oldLineNumber ?? ''}</Text>
      <Text style={[styles.lineNumber, { color: theme.palette.onSurfaceDim }]}>{line.newLineNumber ?? ''}</Text>
      <Text style={{ color: markerColor, width: 16, fontFamily: 'monospace', fontSize: 12 }}>{marker}</Text>
      <Text style={{ color: theme.palette.onSurface, fontFamily: 'monospace', fontSize: 12 }}>{line.text || ' '}</Text>
    </View>
  );
}

/**
 * Reads the working-tree content for a status entry. Deleted files have
 * no working-tree content to read (the file is gone); everything else
 * reads live from SAF so the diff always reflects the actual current
 * on-disk state, not a possibly-stale git-mirror snapshot.
 */
async function resolveWorkingTreeContent(workspaceUri, fileStatus) {
  if (fileStatus.status === 'deleted') return '';
  // fileStatus.path is git-relative (e.g. "src/App.js"); resolve it to a
  // SAF URI by walking from the workspace root — mirrors the same
  // resolution GitFileSystemBridge does internally.
  const segments = fileStatus.path.split('/').filter(Boolean);
  let currentUri = workspaceUri;
  for (let i = 0; i < segments.length - 1; i++) {
    const entries = await FS.listDirectory(currentUri);
    const dir = entries.find((e) => e.name === segments[i] && e.isDirectory);
    if (!dir) throw new Error(`Path not found: ${fileStatus.path}`);
    currentUri = dir.uri;
  }
  const finalEntries = await FS.listDirectory(currentUri);
  const file = finalEntries.find((e) => e.name === segments[segments.length - 1] && !e.isDirectory);
  if (!file) throw new Error(`File not found: ${fileStatus.path}`);
  return FS.readFile(file.uri);
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', margin: 16 },
  card: { borderRadius: 12, overflow: 'hidden', maxHeight: '85%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  hunkSeparator: { paddingHorizontal: 12, paddingVertical: 4 },
  diffRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8 },
  lineNumber: { width: 34, fontSize: 10.5, fontFamily: 'monospace', textAlign: 'right', marginRight: 6 },
});
