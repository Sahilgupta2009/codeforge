import React from 'react';
import { View, StyleSheet } from 'react-native';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import HtmlPreview from './HtmlPreview';
import MarkdownPreview from './MarkdownPreview';

/**
 * Dispatches to the right live preview renderer for whichever text tab
 * is currently open, based on its already-detected language id. Used by
 * EditorPane as the right-hand (or full-width, in "preview only" mode)
 * half of the live-preview split for HTML and Markdown files — see
 * EditorPane.js for the split/full-width layout logic and
 * EditorToolbar.js for the toggle that shows/hides this.
 *
 * Both HtmlPreview and MarkdownPreview read `tab.content` directly (the
 * real in-memory, possibly-unsaved buffer), so the preview reflects
 * live edits exactly the same way it would in a desktop IDE's preview
 * pane — not just the last-saved-to-disk version.
 */
export default function PreviewPane({ tab }) {
  const theme = useCodeForgeTheme();

  if (!tab) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.editorBackground }]}>
      {tab.language === 'html' ? (
        <HtmlPreview content={tab.content} uri={tab.uri} />
      ) : tab.language === 'markdown' ? (
        <MarkdownPreview content={tab.content} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
