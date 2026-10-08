import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import Modal from 'react-native-modal';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useGitStore } from '../state/useGitStore';

/**
 * Shows the commit log for the current branch (up to 50 commits, see
 * GitService.getCommitHistory's depth option). Each row shows the
 * commit message, author, and a relative timestamp — tapping a commit
 * is reserved for a future "view commit diff" action once the diff
 * viewer supports comparing two arbitrary commits rather than only
 * working-tree-vs-HEAD (documented here rather than silently omitted).
 */
export default function CommitHistory({ visible, onDismiss }) {
  const theme = useCodeForgeTheme();
  const history = useGitStore((s) => s.history);

  return (
    <Modal isVisible={visible} onBackdropPress={onDismiss} onSwipeComplete={onDismiss} swipeDirection="down" style={styles.modal} backdropOpacity={0.4}>
      <View style={[styles.sheet, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={styles.handle} />
        <Text variant="titleMedium" style={{ color: theme.palette.onSurface, paddingHorizontal: 20, marginBottom: 8 }}>
          Commit History
        </Text>

        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="history" size={28} color={theme.palette.onSurfaceDim} />
            <Text style={{ color: theme.palette.onSurfaceDim, marginTop: 8 }}>No commits yet</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(c) => c.oid}
            style={{ maxHeight: 420 }}
            renderItem={({ item, index }) => (
              <View style={styles.commitRow}>
                <View style={styles.timelineColumn}>
                  <View style={[styles.dot, { backgroundColor: theme.palette.primary }]} />
                  {index < history.length - 1 && (
                    <View style={[styles.line, { backgroundColor: theme.palette.outlineVariant }]} />
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <Text numberOfLines={2} style={{ color: theme.palette.onSurface, fontSize: 13.5 }}>
                    {item.message.split('\n')[0]}
                  </Text>
                  <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11, marginTop: 3 }}>
                    {item.authorName} · {formatRelativeTime(item.timestamp)} · {item.oid.slice(0, 7)}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function formatRelativeTime(timestampMs) {
  const diffMs = Date.now() - timestampMs;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24, paddingTop: 8 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.4)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  emptyState: { alignItems: 'center', padding: 32 },
  commitRow: { flexDirection: 'row', paddingHorizontal: 20 },
  timelineColumn: { width: 20, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  line: { width: 1.5, flex: 1, marginTop: 2 },
});
