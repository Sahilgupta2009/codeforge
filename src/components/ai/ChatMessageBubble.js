import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';

/**
 * Splits a message's raw text into an ordered sequence of prose and
 * fenced-code segments, so each code block can get its own Insert/Copy
 * action row instead of relying on Markdown's code-block renderer (which
 * has no concept of "insert into the editor"). Prose segments are still
 * rendered through react-native-markdown-display for bold/italic/lists/
 * inline-code formatting.
 */
function splitIntoSegments(text) {
  const segments = [];
  const fenceRe = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'prose', content: text.slice(lastIndex, match.index) });
    }
    let code = match[2];
    if (code.endsWith('\n')) code = code.slice(0, -1);
    segments.push({ type: 'code', language: match[1] || null, content: code });
    lastIndex = fenceRe.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'prose', content: text.slice(lastIndex) });
  }
  return segments;
}

function CodeBlock({ language, content, onInsert, theme }) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(content);
    Toast.show({ type: 'success', text1: 'Copied to clipboard' });
  };

  return (
    <View
      style={[
        styles.codeBlock,
        { backgroundColor: theme.palette.surfaceContainerLowest, borderColor: theme.palette.outlineVariant },
      ]}
    >
      <View style={[styles.codeBlockHeader, { borderBottomColor: theme.palette.outlineVariant }]}>
        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11 }}>{language || 'code'}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Pressable onPress={handleCopy} style={styles.headerAction} hitSlop={8}>
            <MaterialCommunityIcons name="content-copy" size={14} color={theme.palette.onSurfaceVariant} />
            <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 11, marginLeft: 4 }}>Copy</Text>
          </Pressable>
          {onInsert && (
            <Pressable onPress={() => onInsert(content)} style={[styles.headerAction, { marginLeft: 12 }]} hitSlop={8}>
              <MaterialCommunityIcons name="arrow-down-bold-box-outline" size={14} color={theme.palette.primary} />
              <Text style={{ color: theme.palette.primary, fontSize: 11, marginLeft: 4, fontWeight: '600' }}>
                Insert
              </Text>
            </Pressable>
          )}
        </View>
      </View>
      <Text
        selectable
        style={{
          color: theme.palette.onSurface,
          fontFamily: 'monospace',
          fontSize: 12.5,
          padding: 10,
          lineHeight: 18,
        }}
      >
        {content}
      </Text>
    </View>
  );
}

/**
 * Renders one message in the AI Chat conversation. User messages get a
 * simple right-aligned bubble; assistant messages render markdown prose
 * interleaved with code blocks that carry Copy/Insert actions, and show
 * a streaming cursor indicator while still receiving text.
 */
export default function ChatMessageBubble({ message, isStreaming, onInsertCode }) {
  const theme = useCodeForgeTheme();
  const isUser = message.role === 'user';

  const segments = useMemo(() => splitIntoSegments(message.content || ''), [message.content]);

  const markdownStyles = useMemo(
    () => ({
      body: { color: theme.palette.onSurface, fontSize: 14 },
      code_inline: {
        backgroundColor: theme.palette.surfaceContainerHigh,
        color: theme.palette.primary,
        fontFamily: 'monospace',
        fontSize: 12.5,
        paddingHorizontal: 4,
        borderRadius: 4,
      },
      link: { color: theme.palette.primary },
      bullet_list_icon: { color: theme.palette.onSurfaceVariant },
      ordered_list_icon: { color: theme.palette.onSurfaceVariant },
    }),
    [theme]
  );

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: theme.palette.primaryContainer }]}>
          <Text selectable style={{ color: theme.palette.onPrimaryContainer, fontSize: 14 }}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  const isEmpty = !message.content && isStreaming;

  return (
    <View style={styles.assistantRow}>
      <View style={[styles.assistantIcon, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <MaterialCommunityIcons name="robot-outline" size={14} color={theme.palette.primary} />
      </View>
      <View style={styles.assistantContent}>
        {isEmpty ? (
          <ActivityIndicator size={14} color={theme.palette.onSurfaceDim} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <>
            {segments.map((seg, i) =>
              seg.type === 'code' ? (
                <CodeBlock
                  key={i}
                  language={seg.language}
                  content={seg.content}
                  onInsert={onInsertCode}
                  theme={theme}
                />
              ) : seg.content.trim() ? (
                <Markdown key={i} style={markdownStyles}>
                  {seg.content}
                </Markdown>
              ) : null
            )}
            {isStreaming && (
              <View style={[styles.streamingCursor, { backgroundColor: theme.palette.primary }]} />
            )}
          </>
        )}
        {message.error && (
          <View style={styles.errorRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={13} color={theme.palette.error} />
            <Text style={{ color: theme.palette.error, fontSize: 11.5, marginLeft: 4 }}>
              This response may be incomplete.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', marginVertical: 6, paddingHorizontal: 10 },
  userBubble: { borderRadius: 14, borderTopRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '85%' },
  assistantRow: { flexDirection: 'row', marginVertical: 6, paddingHorizontal: 10 },
  assistantIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  assistantContent: { flex: 1 },
  codeBlock: { borderRadius: 8, borderWidth: 1, marginVertical: 6, overflow: 'hidden' },
  codeBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  headerAction: { flexDirection: 'row', alignItems: 'center' },
  streamingCursor: { width: 7, height: 14, marginTop: 4, borderRadius: 1, opacity: 0.8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
