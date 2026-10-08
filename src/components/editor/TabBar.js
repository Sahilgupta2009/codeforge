import React, { useCallback } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useEditorStore } from '../../state/useEditorStore';
import { getFileIcon } from '../../utils/pathUtils';

/**
 * Horizontal tab strip for one editor pane. Tabs opened via single-tap
 * in the Explorer arrive here as "preview" tabs (italic label, replaced
 * by the next preview open); editing a file or double-tapping it "pins"
 * the tab so it survives future preview-opens — this mirrors VS Code's
 * peek-tab behavior, which keeps casual file browsing from flooding the
 * tab bar with dozens of tabs.
 */
export default function TabBar({ paneId, tabs, activeTabId, onSelectTab, onCloseTab, onLongPressTab }) {
  const theme = useCodeForgeTheme();
  const pinTab = useEditorStore((s) => s.pinTab);

  const handleDoublePress = useCallback(
    (tabId) => {
      pinTab(paneId, tabId);
    },
    [paneId, pinTab]
  );

  if (tabs.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow, borderBottomColor: theme.palette.outlineVariant }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onSelectTab(tab.id)}
              onLongPress={() => onLongPressTab(tab)}
              delayLongPress={350}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? theme.palette.surface : 'transparent',
                  borderBottomColor: isActive ? theme.palette.primary : 'transparent',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={getFileIcon(tab.name, false)}
                size={14}
                color={isActive ? theme.palette.primary : theme.palette.onSurfaceVariant}
                style={{ marginRight: 6 }}
              />
              <Text
                numberOfLines={1}
                style={{
                  color: isActive ? theme.palette.onSurface : theme.palette.onSurfaceVariant,
                  fontStyle: tab.isPreview ? 'italic' : 'normal',
                  fontSize: 13,
                  maxWidth: 140,
                }}
              >
                {tab.name}
              </Text>

              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onCloseTab(tab.id);
                }}
                hitSlop={8}
                style={styles.closeButton}
              >
                {tab.isDirty ? (
                  <View style={[styles.dirtyDot, { backgroundColor: theme.palette.onSurface }]} />
                ) : (
                  <MaterialCommunityIcons name="close" size={14} color={theme.palette.onSurfaceDim} />
                )}
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 38,
    borderBottomWidth: 2,
  },
  closeButton: {
    marginLeft: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirtyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
