import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useWorkspaceStore } from '../state/useWorkspaceStore';

/**
 * PART 1 PLACEHOLDER.
 *
 * This screen becomes the main IDE shell: left sidebar (file explorer +
 * git + extensions + search icons), top tab bar, editor area (single or
 * split pane), bottom terminal panel, and status bar — per
 * ARCHITECTURE.md's layout diagram.
 *
 * It is intentionally minimal right now so that the navigation flow
 * (Welcome -> open folder -> Workspace) is real and testable at the end
 * of Part 1, rather than faked. The File Explorer + SAF read/write lands
 * in Part 2; the tab bar + code editor lands in Part 3; command
 * palette/status bar/split view lands in Part 4.
 */
export default function WorkspaceScreen({ navigation }) {
  const theme = useCodeForgeTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surface }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.palette.outlineVariant }]}>
        <IconButton
          icon="folder-outline"
          iconColor={theme.palette.primary}
          size={20}
          disabled
        />
        <Text style={{ color: theme.palette.onSurface, flex: 1 }} numberOfLines={1}>
          {workspace?.name || 'No workspace'}
        </Text>
        <IconButton
          icon="cog-outline"
          iconColor={theme.palette.onSurfaceVariant}
          size={20}
          onPress={() => navigation.navigate('Settings')}
        />
      </View>

      <View style={styles.center}>
        <MaterialCommunityIcons
          name="hammer-wrench"
          size={40}
          color={theme.palette.onSurfaceDim}
        />
        <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 12, textAlign: 'center' }}>
          Workspace opened: {workspace?.name}
        </Text>
        <Text
          style={{ color: theme.palette.onSurfaceDim, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
          variant="bodySmall"
        >
          File explorer, tabs, and the code editor are built out in Parts 2-4 of this delivery.
        </Text>
        <IconButton
          icon="arrow-left"
          mode="contained-tonal"
          onPress={() => {
            closeWorkspace();
            navigation.replace('Welcome');
          }}
          style={{ marginTop: 20 }}
        />
        <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim }}>
          Back to Welcome
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
