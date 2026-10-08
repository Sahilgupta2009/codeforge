import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { getPreviewDebounceMs } from '../../preview/previewUtils';

/**
 * Live preview of a Markdown tab's in-memory content, rendered with
 * react-native-markdown-display (already a dependency since Part 9's
 * AI Chat panel uses it for assistant replies) — this gets a fuller
 * style set than the chat bubble does, since a whole document benefits
 * from real heading hierarchy, tables, code blocks, and blockquotes
 * rather than just the compact inline/list/link styling a chat message
 * needs.
 *
 * Debounced the same way HtmlPreview is, so retyping a long doc doesn't
 * force a full re-parse on every keystroke.
 */
export default function MarkdownPreview({ content }) {
  const theme = useCodeForgeTheme();
  const [debouncedContent, setDebouncedContent] = useState(content);

  useEffect(() => {
    const delay = getPreviewDebounceMs(content.length);
    const timer = setTimeout(() => setDebouncedContent(content), delay);
    return () => clearTimeout(timer);
  }, [content]);

  const markdownStyles = useMemo(
    () => ({
      body: { color: theme.palette.onSurface, fontSize: 14, lineHeight: 21 },
      heading1: {
        color: theme.palette.onSurface,
        fontSize: 26,
        fontWeight: '700',
        marginTop: 12,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.palette.outlineVariant,
        paddingBottom: 6,
      },
      heading2: {
        color: theme.palette.onSurface,
        fontSize: 21,
        fontWeight: '700',
        marginTop: 12,
        marginBottom: 6,
      },
      heading3: { color: theme.palette.onSurface, fontSize: 17.5, fontWeight: '600', marginTop: 10, marginBottom: 4 },
      heading4: { color: theme.palette.onSurface, fontSize: 15.5, fontWeight: '600', marginTop: 8, marginBottom: 4 },
      heading5: { color: theme.palette.onSurfaceVariant, fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 4 },
      heading6: { color: theme.palette.onSurfaceDim, fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 4 },
      link: { color: theme.palette.primary },
      strong: { color: theme.palette.onSurface, fontWeight: '700' },
      em: { color: theme.palette.onSurface, fontStyle: 'italic' },
      code_inline: {
        backgroundColor: theme.palette.surfaceContainerHigh,
        color: theme.palette.primary,
        fontFamily: 'monospace',
        fontSize: 12.5,
        paddingHorizontal: 4,
        borderRadius: 4,
      },
      code_block: {
        backgroundColor: theme.palette.surfaceContainerLowest,
        borderColor: theme.palette.outlineVariant,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
      },
      fence: {
        backgroundColor: theme.palette.surfaceContainerLowest,
        borderColor: theme.palette.outlineVariant,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
      },
      code_block_text: { color: theme.palette.onSurface, fontFamily: 'monospace', fontSize: 12.5 },
      fence_text: { color: theme.palette.onSurface, fontFamily: 'monospace', fontSize: 12.5 },
      blockquote: {
        backgroundColor: theme.palette.surfaceContainer,
        borderLeftWidth: 3,
        borderLeftColor: theme.palette.primary,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginVertical: 6,
      },
      bullet_list_icon: { color: theme.palette.onSurfaceVariant },
      ordered_list_icon: { color: theme.palette.onSurfaceVariant },
      hr: { backgroundColor: theme.palette.outlineVariant, height: 1, marginVertical: 12 },
      table: { borderColor: theme.palette.outlineVariant, borderWidth: 1, borderRadius: 6, marginVertical: 8 },
      th: {
        backgroundColor: theme.palette.surfaceContainer,
        color: theme.palette.onSurface,
        fontWeight: '700',
        padding: 6,
      },
      td: { color: theme.palette.onSurface, padding: 6, borderColor: theme.palette.outlineVariant },
      image: { borderRadius: 4 },
    }),
    [theme]
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.palette.editorBackground }]}
      contentContainerStyle={styles.content}
    >
      <Markdown style={markdownStyles}>{debouncedContent || ''}</Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14 },
});
