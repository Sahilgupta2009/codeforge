import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { LANGUAGE_DISPLAY_NAMES } from '../editor/languages';
import { useExtensionStore } from '../state/useExtensionStore';

/**
 * Bottom status bar, VS Code-style: cursor position, active file's
 * language, tab size, encoding, git branch + dirty indicator, and any
 * segments contributed by enabled extensions via the ui.statusbar
 * permission (see ExtensionRuntime.js's UI_SET_STATUSBAR_TEXT handler).
 * Segments are tappable where it makes sense (tapping cursor position
 * opens Go to Line; the language segment is wired for a future
 * language-picker action).
 */
export default function StatusBar({ activeTab, workspace, onGoToLine, onOpenLanguagePicker, tabSize, gitBranch, gitDirty }) {
  const theme = useCodeForgeTheme();
  const statusBarItems = useExtensionStore((s) => s.statusBarItems);
  const extensionSegments = Object.entries(statusBarItems).filter(([, text]) => !!text);

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.primaryContainer }]}>
      <View style={styles.leftGroup}>
        {workspace && (
          <View style={styles.segment}>
            <MaterialCommunityIcons name="source-branch" size={13} color={theme.palette.onPrimaryContainer} />
            <Text style={[styles.text, { color: theme.palette.onPrimaryContainer }]}>
              {gitBranch || '—'}
              {gitDirty ? '*' : ''}
            </Text>
          </View>
        )}
        {extensionSegments.map(([extensionId, text]) => (
          <View key={extensionId} style={styles.segment}>
            <Text style={[styles.text, { color: theme.palette.onPrimaryContainer }]} numberOfLines={1}>
              {text}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.rightGroup}>
        {activeTab && (
          <>
            <Pressable onPress={onGoToLine} style={styles.segment} hitSlop={6}>
              <Text style={[styles.text, { color: theme.palette.onPrimaryContainer }]}>
                Ln {(activeTab.cursor?.line ?? 0) + 1}, Col {(activeTab.cursor?.column ?? 0) + 1}
              </Text>
            </Pressable>

            <Pressable onPress={onOpenLanguagePicker} style={styles.segment} hitSlop={6}>
              <Text style={[styles.text, { color: theme.palette.onPrimaryContainer }]}>
                {LANGUAGE_DISPLAY_NAMES[activeTab.language] || activeTab.language}
              </Text>
            </Pressable>

            <View style={styles.segment}>
              <Text style={[styles.text, { color: theme.palette.onPrimaryContainer }]}>
                Spaces: {tabSize}
              </Text>
            </View>

            <View style={styles.segment}>
              <Text style={[styles.text, { color: theme.palette.onPrimaryContainer }]}>UTF-8</Text>
            </View>

            {activeTab.isDirty && (
              <View style={styles.segment}>
                <MaterialCommunityIcons name="circle-medium" size={16} color={theme.palette.onPrimaryContainer} />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 26,
    paddingHorizontal: 10,
  },
  leftGroup: { flexDirection: 'row', alignItems: 'center' },
  rightGroup: { flexDirection: 'row', alignItems: 'center' },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
  },
  text: { fontSize: 11 },
});
