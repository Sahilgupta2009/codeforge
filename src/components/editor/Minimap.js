import React, { memo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { MINIMAP_WIDTH, MINIMAP_LINE_HEIGHT } from '../../editor/editorMetrics';

/**
 * A scaled-down overview of the entire file. Rather than re-rendering
 * full syntax-highlighted text at tiny scale (expensive and illegible at
 * that size anyway), each line is drawn as a set of colored bars whose
 * widths approximate token lengths — the same visual technique VS Code's
 * minimap uses, simplified to flat rectangles since illegible glyph
 * rendering at 2px line-height provides no real benefit over bars.
 *
 * Tapping/dragging the minimap scrolls the main editor to that position.
 */
function Minimap({ lines, tokensByLine, syntaxColors, scrollRatio, viewportRatio, onScrollToRatio, palette }) {
  const totalHeight = lines.length * MINIMAP_LINE_HEIGHT;

  const handlePress = useCallback(
    (evt) => {
      const y = evt.nativeEvent.locationY;
      const ratio = totalHeight > 0 ? y / totalHeight : 0;
      onScrollToRatio(Math.max(0, Math.min(1, ratio)));
    },
    [totalHeight, onScrollToRatio]
  );

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, { width: MINIMAP_WIDTH, backgroundColor: palette.editorGutter }]}
    >
      <View style={{ height: totalHeight }}>
        {lines.map((line, idx) => {
          const tokens = tokensByLine[idx];
          if (!line.trim() || !tokens) return null;
          return (
            <View
              key={idx}
              style={{
                position: 'absolute',
                top: idx * MINIMAP_LINE_HEIGHT,
                left: 2,
                right: 2,
                height: MINIMAP_LINE_HEIGHT,
                flexDirection: 'row',
              }}
            >
              {tokens.slice(0, 40).map((token, tIdx) => {
                if (token.type === 'whitespace') {
                  return <View key={tIdx} style={{ width: token.text.length * 1.1 }} />;
                }
                return (
                  <View
                    key={tIdx}
                    style={{
                      width: Math.max(1, token.text.length * 1.1),
                      height: MINIMAP_LINE_HEIGHT,
                      backgroundColor: syntaxColors[token.type] || palette.onSurfaceDim,
                      opacity: 0.55,
                      marginRight: 0.3,
                    }}
                  />
                );
              })}
            </View>
          );
        })}

        {/* Viewport indicator */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: scrollRatio * totalHeight,
            left: 0,
            right: 0,
            height: Math.max(20, viewportRatio * totalHeight),
            backgroundColor: palette.onSurface,
            opacity: 0.08,
          }}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});

export default memo(Minimap);
