import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { formatPromptPath } from '../../terminal/virtualPathResolver';

function TerminalLine({ line, theme, fontSize = 12.5 }) {
  if (line.type === 'input') {
    return (
      <View style={styles.row}>
        <Text style={{ color: theme.palette.primary, fontFamily: 'monospace', fontSize }}>
          {formatPromptPath(line.promptPath)}${' '}
        </Text>
        <Text style={{ color: theme.palette.onSurface, fontFamily: 'monospace', fontSize, flex: 1 }}>
          {line.text}
        </Text>
      </View>
    );
  }

  const color =
    line.type === 'error'
      ? theme.palette.error
      : line.type === 'system'
      ? theme.palette.onSurfaceDim
      : theme.palette.onSurfaceVariant;

  return (
    <Text
      style={{
        color,
        fontFamily: 'monospace',
        fontSize,
        fontStyle: line.type === 'system' ? 'italic' : 'normal',
        lineHeight: fontSize * 1.44,
      }}
    >
      {line.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});

export default memo(
  TerminalLine,
  (prev, next) => prev.line === next.line && prev.theme === next.theme && prev.fontSize === next.fontSize
);
