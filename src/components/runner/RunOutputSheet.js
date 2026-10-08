import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, ScrollView, StyleSheet, TextInput, Pressable } from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useSettingsStore } from '../../state/useSettingsStore';
import { runCode, formatRunResult } from '../../runner/runnerService';
import { RUNNABLE } from '../../runner/languages';

/**
 * Bottom sheet that runs the active tab's CURRENT (even unsaved) content
 * and shows real output. Programs that read input (input(), scanf, cin)
 * get their data from the "Input" box — there is no interactive stdin
 * because the code runs as one batch job on the runner server.
 */
export default function RunOutputSheet({ visible, tab, runRequestId, onDismiss }) {
  const theme = useCodeForgeTheme();
  const insets = useSafeAreaInsets();
  const runnerUrl = useSettingsStore((s) => s.runnerUrl);
  const runnerAuthToken = useSettingsStore((s) => s.runnerAuthToken);

  const [stdin, setStdin] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const runIdRef = useRef(0);

  const execute = useCallback(async () => {
    if (!tab) return;
    const myRun = ++runIdRef.current;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const r = await runCode({
        language: tab.language,
        code: tab.content,
        stdin,
        baseUrl: runnerUrl,
        authToken: runnerAuthToken,
      });
      if (runIdRef.current === myRun) setResult(r);
    } catch (err) {
      if (runIdRef.current === myRun) setError(err.message);
    } finally {
      if (runIdRef.current === myRun) setRunning(false);
    }
  }, [tab, stdin, runnerUrl, runnerAuthToken]);

  // Auto-run each time the Run button is pressed.
  useEffect(() => {
    if (visible && runRequestId > 0) execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRequestId, visible]);

  const output = result ? formatRunResult(result) : '';
  const langLabel = tab ? RUNNABLE[tab.language]?.label : '';
  const statusColor = result ? (result.ok ? '#4caf50' : theme.palette.error) : theme.palette.onSurfaceVariant;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.palette.surfaceContainer, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.palette.onSurface, fontWeight: '600' }} numberOfLines={1}>
              {tab?.name} {langLabel ? `· ${langLabel}` : ''}
            </Text>
            <Text style={{ color: statusColor, fontSize: 12 }}>
              {running
                ? 'Running…'
                : error
                ? 'Failed to run'
                : result
                ? `${result.status}${result.time ? ` · ${result.time}s` : ''}`
                : 'Ready'}
            </Text>
          </View>
          <IconButton
            icon={showInput ? 'keyboard-close' : 'keyboard-outline'}
            size={20}
            onPress={() => setShowInput((v) => !v)}
            accessibilityLabel="Toggle program input"
          />
          <IconButton icon="play" size={22} iconColor="#4caf50" onPress={execute} disabled={running} accessibilityLabel="Run again" />
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>

        {showInput && (
          <TextInput
            value={stdin}
            onChangeText={setStdin}
            multiline
            placeholder="Program input (what input() / scanf / cin will read), one line per entry"
            placeholderTextColor={theme.palette.onSurfaceDim}
            style={[
              styles.stdin,
              { color: theme.palette.onSurface, borderColor: theme.palette.outlineVariant, backgroundColor: theme.palette.surface },
            ]}
          />
        )}

        <ScrollView style={[styles.output, { backgroundColor: theme.palette.surface }]} contentContainerStyle={{ padding: 12 }}>
          {running && <ActivityIndicator size={20} color={theme.palette.primary} style={{ alignSelf: 'flex-start' }} />}
          {error && <Text selectable style={{ color: theme.palette.error }}>{error}</Text>}
          {result && (
            <Text
              selectable
              style={{
                color: result.ok ? theme.palette.onSurface : theme.palette.error,
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              {output || '(no output)'}
            </Text>
          )}
          {!running && !result && !error && (
            <Text style={{ color: theme.palette.onSurfaceDim }}>Press ▶ to run.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', minHeight: '40%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 },
  stdin: { marginHorizontal: 12, marginBottom: 8, minHeight: 56, maxHeight: 120, borderWidth: 1, borderRadius: 8, padding: 8, fontFamily: 'monospace', fontSize: 13, textAlignVertical: 'top' },
  output: { marginHorizontal: 12, borderRadius: 8, flexGrow: 1 },
});
