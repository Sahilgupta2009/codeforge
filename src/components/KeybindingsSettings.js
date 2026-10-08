import React, { useState } from 'react';
import { View, StyleSheet, TextInput as RNTextInput } from 'react-native';
import { Text, List, Button } from 'react-native-paper';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore, DEFAULT_KEYBINDINGS } from '../state/useSettingsStore';
import { COMMANDS } from '../commands/commandRegistry';
import { formatKeybinding } from '../commands/keybindingUtils';

/**
 * Lets the user rebind any command that has a keybindingId. Tapping a
 * binding puts it into "listening" mode — the next hardware key combo
 * pressed while listening is captured and formatted back into a
 * canonical "Ctrl+Shift+X" string via the same parse/format round-trip
 * used by the shortcut dispatcher itself, guaranteeing whatever gets
 * saved here is exactly what useKeyboardShortcuts will later match
 * against.
 */
export default function KeybindingsSettings() {
  const theme = useCodeForgeTheme();
  const keybindings = useSettingsStore((s) => s.keybindings);
  const setKeybinding = useSettingsStore((s) => s.setKeybinding);
  const resetKeybindings = useSettingsStore((s) => s.resetKeybindings);
  const [listeningFor, setListeningFor] = useState(null); // action id currently capturing input

  const bindableCommands = COMMANDS.filter((c) => c.keybindingId);

  const handleCapture = (actionId) => (e) => {
    const { key, ctrlKey, shiftKey, altKey } = e.nativeEvent;
    // Ignore bare modifier presses themselves (Ctrl alone firing before
    // the real key) — only commit once a non-modifier key arrives.
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
    if (!ctrlKey && !altKey) return; // require at least one modifier, consistent with useKeyboardShortcuts

    const descriptor = { ctrl: !!ctrlKey, shift: !!shiftKey, alt: !!altKey, key: key.toLowerCase() };
    const formatted = formatKeybinding(descriptor);
    setKeybinding(actionId, formatted);
    setListeningFor(null);
  };

  return (
    <View>
      <View style={styles.header}>
        <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, flex: 1 }}>
          Tap a binding, then press a key combo on a connected hardware keyboard. Requires Ctrl or Alt.
        </Text>
        <Button compact onPress={resetKeybindings} textColor={theme.palette.error}>
          Reset All
        </Button>
      </View>

      {bindableCommands.map((command) => {
        const isListening = listeningFor === command.keybindingId;
        const binding = keybindings[command.keybindingId] || DEFAULT_KEYBINDINGS[command.keybindingId];

        return (
          <List.Item
            key={command.id}
            title={command.label}
            titleStyle={{ color: theme.palette.onSurface, fontSize: 14 }}
            description={command.category}
            descriptionStyle={{ color: theme.palette.onSurfaceDim, fontSize: 11 }}
            right={() =>
              isListening ? (
                <RNTextInput
                  autoFocus
                  onKeyPress={handleCapture(command.keybindingId)}
                  onBlur={() => setListeningFor(null)}
                  value=""
                  onChangeText={() => {}}
                  placeholder="Press keys..."
                  placeholderTextColor={theme.palette.primary}
                  style={[
                    styles.captureInput,
                    { borderColor: theme.palette.primary, color: theme.palette.primary },
                  ]}
                />
              ) : (
                <View
                  style={[styles.bindingChip, { borderColor: theme.palette.outline }]}
                  onTouchEnd={() => setListeningFor(command.keybindingId)}
                >
                  <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 12 }}>{binding}</Text>
                </View>
              )
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  bindingChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'center',
  },
  captureInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    minWidth: 110,
    textAlign: 'center',
  },
});
