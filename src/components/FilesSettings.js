import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, IconButton, Switch, RadioButton, TextInput as PaperTextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/useSettingsStore';

/**
 * Files settings section, rendered inside SettingsScreen. Every field
 * here is a real, already-consumed setting:
 *   - autoSave / autoSaveDelayMs now actually drive src/editor/autoSave.js
 *     (Part 11) — before this part they were declared in the store but
 *     never read anywhere.
 *   - confirmBeforeDelete already gated the real delete confirmation
 *     dialog since Part 2 (see ExplorerDialogs.js) — this is the first
 *     UI for it.
 *   - excludePatterns already filtered both the Explorer tree and
 *     global search since Part 2/5 (see FileExplorer.js's flattenTree
 *     and searchEngine.js) — same story, first UI for an existing,
 *     working filter.
 */
export default function FilesSettings() {
  const theme = useCodeForgeTheme();
  const autoSave = useSettingsStore((s) => s.autoSave);
  const autoSaveDelayMs = useSettingsStore((s) => s.autoSaveDelayMs);
  const confirmBeforeDelete = useSettingsStore((s) => s.confirmBeforeDelete);
  const excludePatterns = useSettingsStore((s) => s.excludePatterns);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const [newPattern, setNewPattern] = useState('');

  const handleAddPattern = () => {
    const trimmed = newPattern.trim();
    if (!trimmed || excludePatterns.includes(trimmed)) {
      setNewPattern('');
      return;
    }
    setSetting('excludePatterns', [...excludePatterns, trimmed]);
    setNewPattern('');
  };

  const handleRemovePattern = (pattern) => {
    setSetting(
      'excludePatterns',
      excludePatterns.filter((p) => p !== pattern)
    );
  };

  return (
    <View>
      <View style={styles.section}>
        <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 4 }}>Auto Save</Text>
        <RadioButton.Group onValueChange={(v) => setSetting('autoSave', v)} value={autoSave}>
          <Pressable onPress={() => setSetting('autoSave', 'off')} style={styles.radioRow}>
            <RadioButton value="off" color={theme.palette.primary} />
            <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>Off</Text>
          </Pressable>
          <Pressable onPress={() => setSetting('autoSave', 'afterDelay')} style={styles.radioRow}>
            <RadioButton value="afterDelay" color={theme.palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>After delay</Text>
              <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11.5 }}>
                Saves every dirty file automatically after you stop typing.
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setSetting('autoSave', 'onFocusChange')} style={styles.radioRow}>
            <RadioButton value="onFocusChange" color={theme.palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>On focus change</Text>
              <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11.5 }}>
                Saves every dirty file when CodeForge is backgrounded.
              </Text>
            </View>
          </Pressable>
        </RadioButton.Group>

        {autoSave === 'afterDelay' && (
          <View style={[styles.stepperRow, { marginTop: 4 }]}>
            <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>Delay</Text>
            <View style={styles.stepper}>
              <IconButton
                icon="minus"
                size={16}
                onPress={() => setSetting('autoSaveDelayMs', Math.max(300, autoSaveDelayMs - 250))}
              />
              <Text style={{ color: theme.palette.onSurface, minWidth: 56, textAlign: 'center' }}>
                {(autoSaveDelayMs / 1000).toFixed(2).replace(/\.?0+$/, '') || '0'}s
              </Text>
              <IconButton
                icon="plus"
                size={16}
                onPress={() => setSetting('autoSaveDelayMs', Math.min(10000, autoSaveDelayMs + 250))}
              />
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={{ color: theme.palette.onSurface, fontSize: 14, flex: 1 }}>Confirm Before Delete</Text>
          <Switch
            value={confirmBeforeDelete}
            onValueChange={(v) => setSetting('confirmBeforeDelete', v)}
            color={theme.palette.primary}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 6 }}>
          Excluded from Explorer &amp; Search
        </Text>
        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11.5, marginBottom: 8 }}>
          Exact file or folder names to hide — not patterns/wildcards (e.g. "node_modules", not "node_*").
        </Text>

        {excludePatterns.map((pattern) => (
          <View key={pattern} style={[styles.patternRow, { backgroundColor: theme.palette.surfaceContainer }]}>
            <MaterialCommunityIcons name="folder-off-outline" size={14} color={theme.palette.onSurfaceDim} />
            <Text style={{ color: theme.palette.onSurface, fontSize: 13, marginLeft: 8, flex: 1 }}>{pattern}</Text>
            <Pressable onPress={() => handleRemovePattern(pattern)} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={16} color={theme.palette.onSurfaceVariant} />
            </Pressable>
          </View>
        ))}

        <View style={styles.addPatternRow}>
          <PaperTextInput
            mode="outlined"
            value={newPattern}
            onChangeText={setNewPattern}
            placeholder="e.g. coverage"
            autoCapitalize="none"
            autoCorrect={false}
            dense
            onSubmitEditing={handleAddPattern}
            style={{ flex: 1, backgroundColor: theme.palette.surfaceContainer }}
          />
          <IconButton icon="plus" mode="contained" size={18} onPress={handleAddPattern} disabled={!newPattern.trim()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginBottom: 16 },
  radioRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  addPatternRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
