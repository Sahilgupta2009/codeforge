import React, { useCallback } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text, IconButton, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '../state/useSettingsStore';
import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { openWorkspaceFolder } from '../filesystem/openWorkspaceFolder';

/**
 * Landing screen. Two entry points into the app:
 *   1. "Open Folder" — SAF directory picker, the primary flow
 *   2. Tapping a recent project — reopens a previously-granted SAF tree
 *      (persisted permission, so no re-picking needed)
 *
 * Full SAF wiring (openWorkspaceFolder) lands in Part 2; this screen's UI
 * and interaction contract are final now so later parts don't need to
 * touch this file's structure.
 */
export default function WelcomeScreen({ navigation }) {
  const theme = useCodeForgeTheme();
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const removeRecentProject = useSettingsStore((s) => s.removeRecentProject);

  const handleOpenFolder = useCallback(async () => {
    const workspace = await openWorkspaceFolder();
    if (workspace) {
      navigation.replace('Workspace');
    }
  }, [navigation]);

  const handleOpenRecent = useCallback(
    async (project) => {
      const workspace = await openWorkspaceFolder({ existingUri: project.uri, name: project.name });
      if (workspace) {
        navigation.replace('Workspace');
      }
    },
    [navigation]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surface }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <MaterialCommunityIcons name="code-braces-box" size={40} color={theme.palette.primary} />
          <Text variant="headlineMedium" style={{ color: theme.palette.onSurface, marginLeft: 12 }}>
            CodeForge
          </Text>
        </View>
        <IconButton
          icon="cog-outline"
          size={24}
          iconColor={theme.palette.onSurfaceVariant}
          onPress={() => navigation.navigate('Settings')}
          accessibilityLabel="Settings"
        />
      </View>

      <Text variant="bodyMedium" style={{ color: theme.palette.onSurfaceVariant, marginBottom: 24 }}>
        A mobile-first code editor for Android.
      </Text>

      <Button
        mode="contained"
        icon="folder-open-outline"
        onPress={handleOpenFolder}
        contentStyle={{ paddingVertical: 6 }}
        style={{ marginBottom: 28 }}
      >
        Open Folder
      </Button>

      <Text variant="labelLarge" style={{ color: theme.palette.onSurfaceVariant, marginBottom: 8 }}>
        RECENT PROJECTS
      </Text>

      {recentProjects.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="history"
            size={32}
            color={theme.palette.onSurfaceDim}
          />
          <Text style={{ color: theme.palette.onSurfaceDim, marginTop: 8 }}>
            No recent projects yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={recentProjects}
          keyExtractor={(item) => item.uri}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleOpenRecent(item)}
              style={({ pressed }) => [
                styles.recentRow,
                {
                  backgroundColor: pressed
                    ? theme.palette.surfaceContainerHigh
                    : theme.palette.surfaceContainer,
                  borderColor: theme.palette.outlineVariant,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="folder-outline"
                size={22}
                color={theme.palette.primary}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: theme.palette.onSurface }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.palette.onSurfaceDim }}
                  numberOfLines={1}
                >
                  {item.uri}
                </Text>
              </View>
              <IconButton
                icon="close"
                size={18}
                iconColor={theme.palette.onSurfaceDim}
                onPress={() => removeRecentProject(item.uri)}
                accessibilityLabel={`Remove ${item.name} from recent projects`}
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
});
