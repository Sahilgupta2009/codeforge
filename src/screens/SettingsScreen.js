import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton, List, RadioButton, Divider } from 'react-native-paper';
import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/useSettingsStore';

/**
 * Settings screen. The Appearance section below is fully functional
 * against real settings state (theme mode persists via MMKV and updates
 * the whole app live). Editor/Files/Keybindings/AI-provider sections are
 * added in Parts 3, 6, 8, and 9 respectively as those subsystems land —
 * this screen's section-list structure is designed to have those slot in
 * without restructuring.
 */
export default function SettingsScreen({ navigation }) {
  const theme = useCodeForgeTheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surface }]}>
      <View style={[styles.header, { borderBottomColor: theme.palette.outlineVariant }]}>
        <IconButton icon="close" onPress={() => navigation.goBack()} />
        <Text variant="titleLarge" style={{ color: theme.palette.onSurface }}>
          Settings
        </Text>
      </View>

      <ScrollView>
        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>Appearance</List.Subheader>
          <RadioButton.Group onValueChange={(v) => setSetting('themeMode', v)} value={themeMode}>
            <List.Item
              title="Dark"
              titleStyle={{ color: theme.palette.onSurface }}
              left={() => (
                <RadioButton value="dark" color={theme.palette.primary} />
              )}
              onPress={() => setSetting('themeMode', 'dark')}
            />
            <List.Item
              title="Light"
              titleStyle={{ color: theme.palette.onSurface }}
              left={() => <RadioButton value="light" color={theme.palette.primary} />}
              onPress={() => setSetting('themeMode', 'light')}
            />
            <List.Item
              title="Follow system"
              titleStyle={{ color: theme.palette.onSurface }}
              left={() => <RadioButton value="system" color={theme.palette.primary} />}
              onPress={() => setSetting('themeMode', 'system')}
            />
          </RadioButton.Group>
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.onSurfaceDim }}>
            Editor, Files, Keybindings, Terminal, and AI Provider settings
          </List.Subheader>
          <Text
            variant="bodySmall"
            style={{ color: theme.palette.onSurfaceDim, paddingHorizontal: 16, paddingBottom: 16 }}
          >
            These sections are added as their corresponding subsystems are built out (see
            ARCHITECTURE.md build order).
          </Text>
        </List.Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderBottomWidth: 1,
  },
});
