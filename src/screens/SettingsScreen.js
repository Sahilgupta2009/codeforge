import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton, List, RadioButton, Divider, Switch } from 'react-native-paper';
import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/useSettingsStore';
import { ACCENT_COLOR_OPTIONS, applyAccentColor } from '../theme/tokens';
import KeybindingsSettings from '../components/KeybindingsSettings';
import AIProviderSettings from '../components/AIProviderSettings';
import FilesSettings from '../components/FilesSettings';
import TerminalSettings from '../components/TerminalSettings';
import RunnerSettings from '../components/RunnerSettings';

/**
 * Settings screen. Appearance and Editor sections are fully functional
 * against real settings state (all persist via MMKV and apply live to
 * any open CodeEditor instance, since CodeEditor reads these same
 * settings keys directly). Keybindings is fully functional as of Part 4
 * — capturing a hardware key combo here produces exactly the string
 * format useKeyboardShortcuts.js matches against.
 *
 * As of Part 11, every section is real: Files (auto-save, delete
 * confirmation, excluded names) and Terminal (font size, bell) are no
 * longer placeholders — see src/components/FilesSettings.js and
 * src/components/TerminalSettings.js, and src/editor/autoSave.js /
 * useTerminalStore.js for what now actually consumes autoSave and
 * terminalBell, both of which existed in the store since Part 1 but had
 * no real consumer until this part. AI Assistant settings are fully
 * functional as of Part 9 — see src/components/AIProviderSettings.js.
 */
export default function SettingsScreen({ navigation }) {
  const theme = useCodeForgeTheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const fontSize = useSettingsStore((s) => s.fontSize);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const showMinimap = useSettingsStore((s) => s.showMinimap);
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const relativeLineNumbers = useSettingsStore((s) => s.relativeLineNumbers);
  const highlightActiveLine = useSettingsStore((s) => s.highlightActiveLine);
  const autoClosingBrackets = useSettingsStore((s) => s.autoClosingBrackets);
  const autoIndent = useSettingsStore((s) => s.autoIndent);
  const renderWhitespace = useSettingsStore((s) => s.renderWhitespace);
  const formatOnSave = useSettingsStore((s) => s.formatOnSave);
  const trimTrailingWhitespaceOnSave = useSettingsStore((s) => s.trimTrailingWhitespaceOnSave);

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
              left={() => <RadioButton value="dark" color={theme.palette.primary} />}
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

          <View style={styles.accentRow}>
            <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 13, marginBottom: 8 }}>
              Accent Color
            </Text>
            <View style={styles.swatchRow}>
              {ACCENT_COLOR_OPTIONS.map((accent) => {
                const swatchColor = applyAccentColor(theme.palette, accent, theme.mode).primary;
                const selected = accentColor === accent;
                return (
                  <IconButton
                    key={accent}
                    icon={selected ? 'check' : undefined}
                    mode="contained"
                    size={18}
                    iconColor={selected ? theme.palette.onPrimary : 'transparent'}
                    containerColor={swatchColor}
                    onPress={() => setSetting('accentColor', accent)}
                    accessibilityLabel={`${accent} accent color${selected ? ', selected' : ''}`}
                  />
                );
              })}
            </View>
          </View>
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>Editor</List.Subheader>

          <StepperRow
            label="Font Size"
            value={fontSize}
            onDecrease={() => setSetting('fontSize', Math.max(9, fontSize - 1))}
            onIncrease={() => setSetting('fontSize', Math.min(32, fontSize + 1))}
            theme={theme}
          />
          <StepperRow
            label="Tab Size"
            value={tabSize}
            onDecrease={() => setSetting('tabSize', Math.max(1, tabSize - 1))}
            onIncrease={() => setSetting('tabSize', Math.min(8, tabSize + 1))}
            theme={theme}
          />
          <SwitchRow label="Insert Spaces (not tabs)" value={insertSpaces} onChange={(v) => setSetting('insertSpaces', v)} theme={theme} />
          <SwitchRow label="Word Wrap" value={wordWrap} onChange={(v) => setSetting('wordWrap', v)} theme={theme} />
          <SwitchRow label="Show Minimap" value={showMinimap} onChange={(v) => setSetting('showMinimap', v)} theme={theme} />
          <SwitchRow label="Show Line Numbers" value={showLineNumbers} onChange={(v) => setSetting('showLineNumbers', v)} theme={theme} />
          <SwitchRow label="Relative Line Numbers" value={relativeLineNumbers} onChange={(v) => setSetting('relativeLineNumbers', v)} theme={theme} />
          <SwitchRow label="Highlight Active Line" value={highlightActiveLine} onChange={(v) => setSetting('highlightActiveLine', v)} theme={theme} />
          <SwitchRow label="Auto-Close Brackets & Quotes" value={autoClosingBrackets} onChange={(v) => setSetting('autoClosingBrackets', v)} theme={theme} />
          <SwitchRow label="Auto Indent" value={autoIndent} onChange={(v) => setSetting('autoIndent', v)} theme={theme} />
          <SwitchRow label="Render Whitespace" value={renderWhitespace} onChange={(v) => setSetting('renderWhitespace', v)} theme={theme} />
          <SwitchRow
            label="Trim Trailing Whitespace on Save"
            value={trimTrailingWhitespaceOnSave}
            onChange={(v) => setSetting('trimTrailingWhitespaceOnSave', v)}
            theme={theme}
          />
          <SwitchRow
            label="Format on Save"
            value={formatOnSave}
            onChange={(v) => setSetting('formatOnSave', v)}
            theme={theme}
          />
          <Text
            variant="bodySmall"
            style={{ color: theme.palette.onSurfaceDim, paddingHorizontal: 16, paddingBottom: 8, marginTop: -4 }}
          >
            Normalizes indentation to the Tab Size/Insert Spaces settings above and ensures a single
            trailing newline. This is a whitespace-level formatter, not a full code reformatter like
            Prettier — it won't reflow long lines or reorder code.
          </Text>
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>Keyboard Shortcuts</List.Subheader>
          <KeybindingsSettings />
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>AI Assistant</List.Subheader>
          <AIProviderSettings />
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>Files</List.Subheader>
          <FilesSettings />
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>Terminal</List.Subheader>
          <TerminalSettings />
        </List.Section>

        <Divider style={{ backgroundColor: theme.palette.outlineVariant }} />

        <List.Section>
          <List.Subheader style={{ color: theme.palette.primary }}>Code Runner</List.Subheader>
          <RunnerSettings />
        </List.Section>
      </ScrollView>
    </View>
  );
}

function StepperRow({ label, value, onDecrease, onIncrease, theme }) {
  return (
    <List.Item
      title={label}
      titleStyle={{ color: theme.palette.onSurface, fontSize: 14 }}
      right={() => (
        <View style={styles.stepper}>
          <IconButton icon="minus" size={16} onPress={onDecrease} />
          <Text style={{ color: theme.palette.onSurface, minWidth: 24, textAlign: 'center' }}>{value}</Text>
          <IconButton icon="plus" size={16} onPress={onIncrease} />
        </View>
      )}
    />
  );
}

function SwitchRow({ label, value, onChange, theme }) {
  return (
    <List.Item
      title={label}
      titleStyle={{ color: theme.palette.onSurface, fontSize: 14 }}
      right={() => <Switch value={value} onValueChange={onChange} color={theme.palette.primary} />}
      onPress={() => onChange(!value)}
    />
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
  stepper: { flexDirection: 'row', alignItems: 'center' },
  accentRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  swatchRow: { flexDirection: 'row', gap: 8 },
});
