import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../theme/ThemeProvider';

/**
 * A narrow vertical icon rail (VS Code's "Activity Bar" equivalent)
 * along the left edge of the sidebar, switching which panel the
 * sidebar shows. All five views (Explorer, Search, Source Control,
 * Extensions, AI Assistant) are real and enabled as of Part 9.
 */
const VIEWS = [
  { id: 'explorer', icon: 'file-tree-outline', label: 'Explorer', enabled: true },
  { id: 'search', icon: 'magnify', label: 'Search', enabled: true },
  { id: 'git', icon: 'source-branch', label: 'Source Control', enabled: true },
  { id: 'extensions', icon: 'puzzle-outline', label: 'Extensions', enabled: true },
  { id: 'ai', icon: 'robot-outline', label: 'AI Assistant', enabled: true },
];

export default function SidebarViewSwitcher({ activeView, onSelectView }) {
  const theme = useCodeForgeTheme();

  return (
    <View style={[styles.rail, { backgroundColor: theme.palette.surfaceContainerLowest, borderRightColor: theme.palette.outlineVariant }]}>
      {VIEWS.map((view) => {
        const isActive = activeView === view.id;
        return (
          <Pressable
            key={view.id}
            onPress={() => view.enabled && onSelectView(view.id)}
            disabled={!view.enabled}
            style={[styles.iconButton, isActive && { borderLeftColor: theme.palette.primary }]}
            accessibilityLabel={view.label}
          >
            <MaterialCommunityIcons
              name={view.icon}
              size={20}
              color={
                !view.enabled
                  ? theme.palette.onSurfaceDim
                  : isActive
                  ? theme.palette.primary
                  : theme.palette.onSurfaceVariant
              }
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 44,
    borderRightWidth: 1,
    paddingTop: 8,
  },
  iconButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
});
