import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from 'react-native-paper';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/useSettingsStore';
import { DEFAULT_RUNNER_URL } from '../runner/runnerService';

/** Settings → Code Runner: where Python/C/C++/Java/JS code is executed. */
export default function RunnerSettings() {
  const theme = useCodeForgeTheme();
  const runnerUrl = useSettingsStore((s) => s.runnerUrl);
  const runnerAuthToken = useSettingsStore((s) => s.runnerAuthToken);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <View style={styles.section}>
      <TextInput
        mode="outlined"
        dense
        label="Runner URL (Judge0)"
        value={runnerUrl}
        placeholder={DEFAULT_RUNNER_URL}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(v) => setSetting('runnerUrl', v)}
        style={{ marginBottom: 12 }}
      />
      <TextInput
        mode="outlined"
        dense
        label="Auth token (optional)"
        value={runnerAuthToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        onChangeText={(v) => setSetting('runnerAuthToken', v)}
      />
      <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, marginTop: 8 }}>
        Code runs on a Judge0 server (internet required). Leave the URL as {DEFAULT_RUNNER_URL} to use the free public
        instance, or point it at your own Judge0.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ section: { paddingHorizontal: 16, paddingBottom: 8 } });
