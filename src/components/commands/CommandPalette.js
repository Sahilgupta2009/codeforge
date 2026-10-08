import React, { useMemo, useState } from 'react';
import { View, TextInput as RNTextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useSettingsStore } from '../../state/useSettingsStore';
import { useExtensionStore } from '../../state/useExtensionStore';
import { useExtensionInvokeStore } from '../../state/useExtensionInvokeStore';
import { COMMANDS } from '../../commands/commandRegistry';
import { fuzzySearch } from '../../utils/fuzzyMatch';

/**
 * The Command Palette — a searchable list of every registered command,
 * reachable via Ctrl+Shift+P or the toolbar, PLUS any command an
 * enabled extension has registered via codeforge.commands.register
 * (Part 8) — both sources are merged into one fuzzy-searchable list so
 * there's no separate "extension commands" surface to remember to
 * check. Filters/ranks commands with the same fuzzy matcher Global
 * Search uses, so both surfaces feel consistent. Disabled built-in
 * commands (per their `isEnabled(ctx)` check) are shown but dimmed and
 * non-actionable rather than hidden entirely — hiding them would make
 * the palette feel inconsistent as context changes (e.g. "Save"
 * flickering in and out as you type). Extension commands are always
 * enabled while their extension is running (ExtensionHost only mounts
 * enabled extensions in the first place, so a registered command
 * appearing here already implies its owner is live).
 */
export default function CommandPalette({ visible, commandContext, onDismiss }) {
  const theme = useCodeForgeTheme();
  const keybindings = useSettingsStore((s) => s.keybindings);
  const installedExtensions = useExtensionStore((s) => s.installed);
  const registeredCommands = useExtensionStore((s) => s.registeredCommands);
  const [query, setQuery] = useState('');

  const extensionCommands = useMemo(() => {
    const result = [];
    for (const ext of installedExtensions) {
      if (!ext.enabled) continue;
      const commands = registeredCommands[ext.id] || [];
      commands.forEach((cmd) => result.push({ ...cmd, extensionId: ext.id, extensionName: ext.manifest.displayName }));
    }
    return result;
  }, [installedExtensions, registeredCommands]);

  const allCommands = useMemo(() => {
    const normalizedExtensionCommands = extensionCommands.map((cmd) => ({
      id: `ext:${cmd.extensionId}:${cmd.id}`,
      label: cmd.title,
      category: cmd.extensionName,
      keybindingId: null,
      isExtensionCommand: true,
      extensionId: cmd.extensionId,
      commandId: cmd.id,
      isEnabled: () => true,
      run: () => useExtensionInvokeStore.getState().invokeCommand(cmd.extensionId, cmd.id),
    }));
    return [...COMMANDS, ...normalizedExtensionCommands];
  }, [extensionCommands]);

  const results = useMemo(() => {
    return fuzzySearch(query, allCommands, (cmd) => cmd.label);
  }, [query, allCommands]);

  const handleSelect = (command) => {
    const enabled = !command.isEnabled || command.isEnabled(commandContext);
    if (!enabled) return;
    onDismiss();
    // Defer execution until after the modal's dismiss animation starts,
    // so commands that open another modal (Find, Go to Line) don't
    // visually collide with this one closing.
    setTimeout(() => command.run(commandContext), 50);
  };

  const handleModalHide = () => {
    setQuery('');
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onDismiss}
      onModalHide={handleModalHide}
      style={styles.modal}
      avoidKeyboard
      backdropOpacity={0.5}
    >
      <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={[styles.searchRow, { borderBottomColor: theme.palette.outlineVariant }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.palette.onSurfaceDim} />
          <RNTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Type a command..."
            placeholderTextColor={theme.palette.onSurfaceDim}
            style={[styles.searchInput, { color: theme.palette.onSurface }]}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={({ item }) => item.id}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 360 }}
          ListEmptyComponent={
            <Text style={{ color: theme.palette.onSurfaceDim, padding: 16, textAlign: 'center' }}>
              No matching commands
            </Text>
          }
          renderItem={({ item: { item: command } }) => {
            const enabled = !command.isEnabled || command.isEnabled(commandContext);
            const binding = command.keybindingId ? keybindings[command.keybindingId] : null;
            return (
              <Pressable
                onPress={() => handleSelect(command)}
                disabled={!enabled}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed && enabled ? theme.palette.surfaceContainerHighest : 'transparent' },
                ]}
              >
                <Text
                  style={{
                    color: enabled ? theme.palette.onSurface : theme.palette.onSurfaceDim,
                    fontSize: 13.5,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  <Text style={{ color: theme.palette.primary, fontSize: 11 }}>{command.category}: </Text>
                  {command.label}
                </Text>
                {binding && (
                  <View style={[styles.kbdBadge, { borderColor: theme.palette.outline }]}>
                    <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 10.5 }}>{binding}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-start', margin: 0, paddingTop: 60, paddingHorizontal: 16 },
  card: { borderRadius: 12, overflow: 'hidden' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 48,
    borderBottomWidth: 1,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, height: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  kbdBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
});
