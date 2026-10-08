import React, { memo } from 'react';
import { Text } from 'react-native';

const WHITESPACE_DIM_OPACITY = 0.35;

/**
 * Renders one already-tokenized line as a sequence of colored <Text>
 * spans. Kept as its own memoized component so that editing one line
 * only re-renders that line's spans, not the whole visible viewport.
 *
 * When `renderWhitespace` is on, whitespace tokens are rendered with
 * visible middle-dot/arrow glyphs (VS Code's "Render Whitespace"
 * convention) instead of the tokenizer's literal space/tab characters,
 * dimmed so they don't compete visually with real code.
 */
function HighlightedLine({ tokens, syntaxColors, plainColor, fontFamily, fontSize, lineHeight, renderWhitespace }) {
  if (!tokens || tokens.length === 0) {
    // Preserve line height for empty lines so the gutter/cursor stay aligned.
    return <Text style={{ fontFamily, fontSize, lineHeight }}> </Text>;
  }

  return (
    <Text style={{ fontFamily, fontSize, lineHeight }}>
      {tokens.map((token, idx) => {
        if (renderWhitespace && token.type === 'whitespace') {
          const glyphs = token.text.replace(/ /g, '\u00B7').replace(/\t/g, '\u2192   ');
          return (
            <Text key={idx} style={{ color: plainColor, opacity: WHITESPACE_DIM_OPACITY }}>
              {glyphs}
            </Text>
          );
        }
        return (
          <Text key={idx} style={{ color: syntaxColors[token.type] || plainColor }}>
            {token.text}
          </Text>
        );
      })}
    </Text>
  );
}

export default memo(HighlightedLine, (prev, next) => {
  return (
    prev.tokens === next.tokens &&
    prev.fontSize === next.fontSize &&
    prev.lineHeight === next.lineHeight &&
    prev.plainColor === next.plainColor &&
    prev.renderWhitespace === next.renderWhitespace
  );
});
