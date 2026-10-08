import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton, Switch } from 'react-native-paper';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/useSettingsStore';

/**
 * Terminal settings section, rendered inside SettingsScreen.
 * terminalFontSize and terminalBell existed in the store since Part 1
 * but, unlike most other settings fields, were never actually wired to
 * any real behavior until Part 11:
 *   - terminalFontSize now drives the real font size of terminal
 *     scrollback and the input line (TerminalLine.js / TerminalInputBar.js,
 *     threaded through from TerminalPanel.js) — session tab labels
 *     intentionally stay fixed-size, since that's UI chrome, not
 *     terminal content.
 *   - terminalBell now triggers a real haptic pulse
 *     (Haptics.notificationAsync, the same expo-haptics dependency
 *     FileTreeRow.js already uses) when a command exits non-zero — see
 *     useTerminalStore.js's runCommand. This virtual command
 *     interpreter doesn't stream raw bytes from a real process, so
 *     there's no literal BEL (\x07) byte to react to; a failed command
 *     is the closest real equivalent "something needs your attention"
 *     signal it has. Also gated on hapticsEnabled, since the bell is
 *     fundamentally a haptic preference.
 */
export default function TerminalSettings() {
  const theme = useCodeForgeTheme();
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const terminalBell = useSettingsStore((s) => s.terminalBell);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <View>
      <View style={styles.section}>
        <View style={styles.stepperRow}>
          <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>Font Size</Text>
          <View style={styles.stepper}>
            <IconButton
              icon="minus"
              size={16}
              onPress={() => setSetting('terminalFontSize', Math.max(9, terminalFontSize - 1))}
            />
            <Text style={{ color: theme.palette.onSurface, minWidth: 24, textAlign: 'center' }}>
              {terminalFontSize}
            </Text>
            <IconButton
              icon="plus"
              size={16}
              onPress={() => setSetting('terminalFontSize', Math.min(24, terminalFontSize + 1))}
            />
          </View>
        </View>
        <Text
          style={{
            color: theme.palette.onSurface,
            fontFamily: 'monospace',
            fontSize: terminalFontSize,
            marginTop: 4,
          }}
        >
          $ echo "preview"
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.palette.onSurface, fontSize: 14 }}>Terminal Bell</Text>
            <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11.5, marginTop: 2 }}>
              Haptic pulse when a command exits with an error.
              {!hapticsEnabled && terminalBell ? ' Currently silent — Haptics is off below.' : ''}
            </Text>
          </View>
          <Switch value={terminalBell} onValueChange={(v) => setSetting('terminalBell', v)} color={theme.palette.primary} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={{ color: theme.palette.onSurface, fontSize: 14, flex: 1 }}>Haptics</Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={(v) => setSetting('hapticsEnabled', v)}
            color={theme.palette.primary}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginBottom: 16 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
