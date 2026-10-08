import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Text, TextInput, Button } from 'react-native-paper';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';

/**
 * Simple "Go to Line[:Column]" dialog. Accepts "42" or "42:10" syntax.
 * Calls onGoToLine(lineNumber0Indexed, column0Indexed) on submit.
 */
export default function GoToLineDialog({ visible, totalLines, onGoToLine, onDismiss }) {
  const theme = useCodeForgeTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = () => {
    const match = value.trim().match(/^(\d+)(?::(\d+))?$/);
    if (!match) {
      setError('Enter a line number, e.g. 42 or 42:10');
      return;
    }
    const line = parseInt(match[1], 10);
    const column = match[2] ? parseInt(match[2], 10) : 1;
    if (line < 1 || line > totalLines) {
      setError(`Line must be between 1 and ${totalLines}`);
      return;
    }
    onGoToLine(line - 1, Math.max(0, column - 1));
    setValue('');
    setError(null);
  };

  return (
    <Modal isVisible={visible} onBackdropPress={onDismiss} style={styles.modal}>
      <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <Text variant="titleMedium" style={{ color: theme.palette.onSurface, marginBottom: 4 }}>
          Go to Line
        </Text>
        <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, marginBottom: 12 }}>
          Line 1 – {totalLines}. Use "line:column" to target a column too.
        </Text>
        <TextInput
          mode="outlined"
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          placeholder="42 or 42:10"
          keyboardType="numbers-and-punctuation"
          autoFocus
          error={!!error}
          onSubmitEditing={handleSubmit}
        />
        {error && <Text style={{ color: theme.palette.error, marginTop: 4, fontSize: 12 }}>{error}</Text>}
        <View style={styles.buttonRow}>
          <Button onPress={onDismiss} textColor={theme.palette.onSurfaceVariant}>
            Cancel
          </Button>
          <Button onPress={handleSubmit} mode="contained">
            Go
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', alignItems: 'center' },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 20 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 8 },
});
