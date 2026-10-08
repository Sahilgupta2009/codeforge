import React, { useState, useCallback } from 'react';
import { View, TextInput as RNTextInput, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTerminalStore } from '../../state/useTerminalStore';
import { formatPromptPath } from '../../terminal/virtualPathResolver';

/**
 * The command entry row at the bottom of a terminal session. Hardware
 * keyboard Up/Down arrows recall history (via onKeyPress, matching the
 * same real-hardware-key detection pattern used by
 * useKeyboardShortcuts.js in Part 4); on-screen affordances (the
 * up/down chevrons) provide the same recall for touch-only users, since
 * arrow keys aren't otherwise reachable without a physical keyboard.
 */
export default function TerminalInputBar({ sessionId, theme, cwdDisplayPath, isRunning, onSubmitOverride, fontSize = 12.5 }) {
  const [value, setValue] = useState('');
  const runCommand = useTerminalStore((s) => s.runCommand);
  const recallHistory = useTerminalStore((s) => s.recallHistory);
  const appendLine = useTerminalStore((s) => s.appendLine);

  const handleSubmit = useCallback(() => {
    if (isRunning) return;
    const line = value;
    setValue('');
    if (onSubmitOverride) {
      // Termux-mode sessions still want the input echoed into scrollback
      // (matching the normal virtual-mode UX) before dispatching
      // elsewhere, but skip the built-in command table entirely.
      appendLine(sessionId, { type: 'input', text: line, promptPath: cwdDisplayPath });
      onSubmitOverride(line);
      return;
    }
    runCommand(sessionId, line);
  }, [value, sessionId, runCommand, isRunning, onSubmitOverride, appendLine, cwdDisplayPath]);

  const handleRecall = useCallback(
    (direction) => {
      const recalled = recallHistory(sessionId, direction);
      if (recalled !== null) setValue(recalled);
    },
    [sessionId, recallHistory]
  );

  const handleKeyPress = useCallback(
    (e) => {
      const key = e.nativeEvent.key;
      if (key === 'ArrowUp') {
        e.preventDefault?.();
        handleRecall('up');
      } else if (key === 'ArrowDown') {
        e.preventDefault?.();
        handleRecall('down');
      }
    },
    [handleRecall]
  );

  return (
    <View style={[styles.container, { borderTopColor: theme.palette.outlineVariant }]}>
      <Text style={{ color: theme.palette.primary, fontFamily: 'monospace', fontSize }}>
        {formatPromptPath(cwdDisplayPath)}${' '}
      </Text>
      <RNTextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={handleSubmit}
        onKeyPress={handleKeyPress}
        editable={!isRunning}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        style={[styles.input, { color: theme.palette.onSurface, fontSize }]}
        placeholder={isRunning ? 'running…' : ''}
        placeholderTextColor={theme.palette.onSurfaceDim}
      />
      <Pressable onPress={() => handleRecall('up')} hitSlop={8} style={styles.chevron}>
        <MaterialCommunityIcons name="chevron-up" size={16} color={theme.palette.onSurfaceVariant} />
      </Pressable>
      <Pressable onPress={() => handleRecall('down')} hitSlop={8} style={styles.chevron}>
        <MaterialCommunityIcons name="chevron-down" size={16} color={theme.palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: 8,
    height: 36,
  },
  input: {
    flex: 1,
    fontFamily: 'monospace',
    height: '100%',
    padding: 0,
    marginLeft: 2,
  },
  chevron: { paddingHorizontal: 4 },
});
