import React, { memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { getFileIcon } from '../utils/pathUtils';
import { useSettingsStore } from '../state/useSettingsStore';

const INDENT_PER_DEPTH = 16;

/**
 * A single row in the File Explorer tree — either a folder (expandable)
 * or a file (opens in the editor on tap). Memoized since large project
 * trees can have thousands of rows; only re-renders when its own props
 * change, not on every store update elsewhere in the app.
 */
function FileTreeRow({
  entry,
  depth,
  isExpanded,
  isLoading,
  isSelected,
  isActive,
  gitStatus, // 'added' | 'modified' | 'deleted' | 'untracked' | 'conflict' | null — real values from useGitStore as of Part 6
  onPress,
  onLongPress,
}) {
  const theme = useCodeForgeTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleLongPress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onLongPress(entry);
  };

  const iconName = entry.isDirectory
    ? isExpanded
      ? 'folder-open'
      : 'folder'
    : getFileIcon(entry.name, false);

  const iconColor = entry.isDirectory
    ? theme.palette.primary
    : gitStatus
    ? theme.palette.git[gitStatus] || theme.palette.onSurfaceVariant
    : theme.palette.onSurfaceVariant;

  return (
    <Pressable
      onPress={() => onPress(entry)}
      onLongPress={handleLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        {
          paddingLeft: 8 + depth * INDENT_PER_DEPTH,
          backgroundColor: isSelected
            ? theme.palette.secondaryContainer
            : isActive
            ? theme.palette.surfaceContainerHigh
            : pressed
            ? theme.palette.surfaceContainer
            : 'transparent',
        },
      ]}
    >
      {entry.isDirectory ? (
        <MaterialCommunityIcons
          name={isExpanded ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={theme.palette.onSurfaceDim}
          style={styles.chevron}
        />
      ) : (
        <View style={styles.chevronSpacer} />
      )}

      {isLoading ? (
        <ActivityIndicator size={14} style={styles.icon} color={theme.palette.primary} />
      ) : (
        <MaterialCommunityIcons name={iconName} size={17} color={iconColor} style={styles.icon} />
      )}

      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: entry.unreadable ? theme.palette.onSurfaceDim : theme.palette.onSurface,
            fontStyle: entry.unreadable ? 'italic' : 'normal',
          },
        ]}
      >
        {entry.name}
      </Text>

      {gitStatus && (
        <View style={[styles.gitDot, { backgroundColor: theme.palette.git[gitStatus] }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingRight: 12,
  },
  chevron: { width: 16, marginRight: 2 },
  chevronSpacer: { width: 18 },
  icon: { marginRight: 6 },
  label: { flex: 1, fontSize: 13.5 },
  gitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
});

export default memo(FileTreeRow, (prev, next) => {
  return (
    prev.entry.uri === next.entry.uri &&
    prev.entry.name === next.entry.name &&
    prev.depth === next.depth &&
    prev.isExpanded === next.isExpanded &&
    prev.isLoading === next.isLoading &&
    prev.isSelected === next.isSelected &&
    prev.isActive === next.isActive &&
    prev.gitStatus === next.gitStatus
  );
});
