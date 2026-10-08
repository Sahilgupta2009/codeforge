import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

/**
 * Renders line numbers for the visible line range, plus a fold-toggle
 * chevron on any line that starts a fold range. Rendered as a separate
 * absolutely-positioned column so it can be pinned while the editor body
 * scrolls horizontally (word-wrap off) without the numbers scrolling too.
 */
function EditorGutter({
  visibleLineIndices, // array of actual (unfolded-file) line numbers to render, in order
  activeLine,
  foldStartLines, // Set<number> of line indices that begin a fold range
  foldedLines, // number[] currently-collapsed start lines
  onToggleFold,
  gutterWidth,
  lineHeight,
  fontSize,
  palette,
  relativeLineNumbers,
}) {
  return (
    <View style={[styles.gutter, { width: gutterWidth, backgroundColor: palette.editorGutter }]}>
      {visibleLineIndices.map((lineIndex) => {
        const isFoldStart = foldStartLines.has(lineIndex);
        const isFolded = foldedLines.includes(lineIndex);
        const displayNumber = relativeLineNumbers && activeLine !== lineIndex
          ? Math.abs(lineIndex - activeLine)
          : lineIndex + 1;

        return (
          <View key={lineIndex} style={[styles.row, { height: lineHeight }]}>
            <Text
              style={[
                styles.lineNumber,
                {
                  fontSize: fontSize * 0.85,
                  lineHeight,
                  color: lineIndex === activeLine ? palette.onSurface : palette.onSurfaceDim,
                },
              ]}
            >
              {displayNumber}
            </Text>
            {isFoldStart && (
              <Pressable
                onPress={() => onToggleFold(lineIndex)}
                hitSlop={6}
                style={[styles.foldToggle, { height: lineHeight }]}
              >
                <Text style={{ color: palette.onSurfaceDim, fontSize: fontSize * 0.7 }}>
                  {isFolded ? '▸' : '▾'}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: {
    paddingTop: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 6,
  },
  lineNumber: {
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  foldToggle: {
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});

export default memo(EditorGutter);
