import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput as RNTextInput, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useAIStore } from '../../state/useAIStore';
import { useSettingsStore } from '../../state/useSettingsStore';
import { useEditorStore } from '../../state/useEditorStore';
import { useEditorHandlersStore } from '../../state/useEditorHandlersStore';
import ChatMessageBubble from './ChatMessageBubble';

/**
 * The AI Assistant sidebar panel: a persistent chat conversation with
 * the configured provider. History loads once from SandboxFileSystem on
 * mount (see useAIStore.loadHistory). Code blocks in assistant replies
 * carry an "Insert" action that writes directly into whichever editor
 * tab is currently active, via the same imperative handler-registration
 * pattern used throughout the editor (useEditorHandlersStore).
 */
export default function AIChatPanel() {
  const theme = useCodeForgeTheme();
  const messages = useAIStore((s) => s.messages);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const streamingMessageId = useAIStore((s) => s.streamingMessageId);
  const errorMessage = useAIStore((s) => s.errorMessage);
  const historyLoaded = useAIStore((s) => s.historyLoaded);
  const loadHistory = useAIStore((s) => s.loadHistory);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const stopStreaming = useAIStore((s) => s.stopStreaming);
  const clearConversation = useAIStore((s) => s.clearConversation);

  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);

  const panes = useEditorStore((s) => s.panes);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId) || null;

  const [input, setInput] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const isConfigured = aiProvider === 'anthropic' || aiProvider === 'openai' ? !!aiApiKey : true;

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    const activeFileContext = activeTab ? { fileName: activeTab.name, language: activeTab.language } : null;
    sendMessage(text, activeFileContext);
  }, [input, isStreaming, sendMessage, activeTab]);

  const handleInsertCode = useCallback(
    (code) => {
      if (!activeTab) return;
      const handlers = useEditorHandlersStore.getState().getHandlers(activeTab.id);
      if (handlers?.insertTextAtCursor) {
        handlers.insertTextAtCursor(code);
      }
    },
    [activeTab]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: theme.palette.outlineVariant }]}>
        <MaterialCommunityIcons name="robot-outline" size={16} color={theme.palette.primary} />
        <Text style={{ color: theme.palette.onSurface, fontSize: 13, fontWeight: '600', marginLeft: 6, flex: 1 }}>
          AI Assistant
        </Text>
        <IconButton
          icon="delete-outline"
          size={16}
          onPress={clearConversation}
          disabled={messages.length === 0}
          accessibilityLabel="Clear conversation"
        />
      </View>

      {!isConfigured ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="key-outline" size={28} color={theme.palette.onSurfaceDim} />
          <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 }}>
            Add an API key in Settings → AI Assistant to start chatting.
          </Text>
        </View>
      ) : !historyLoaded ? (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.palette.onSurfaceDim }}>Loading conversation…</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="chat-outline" size={28} color={theme.palette.onSurfaceDim} />
          <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 }}>
            Ask about your code, request a change, or paste an error to debug.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <ChatMessageBubble
              message={item}
              isStreaming={isStreaming && item.id === streamingMessageId}
              onInsertCode={activeTab ? handleInsertCode : null}
            />
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {errorMessage && !isStreaming && (
        <View style={[styles.errorBanner, { backgroundColor: theme.palette.errorContainer }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.palette.onErrorContainer} />
          <Text style={{ color: theme.palette.onErrorContainer, fontSize: 12, marginLeft: 6, flex: 1 }} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>
      )}

      <View style={[styles.inputRow, { borderTopColor: theme.palette.outlineVariant }]}>
        <RNTextInput
          value={input}
          onChangeText={setInput}
          placeholder={isConfigured ? 'Message the AI Assistant…' : 'Configure a provider in Settings first'}
          placeholderTextColor={theme.palette.onSurfaceDim}
          editable={isConfigured}
          multiline
          style={[
            styles.input,
            { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer },
          ]}
        />
        {isStreaming ? (
          <Pressable onPress={stopStreaming} style={[styles.sendButton, { backgroundColor: theme.palette.error }]}>
            <MaterialCommunityIcons name="stop" size={16} color={theme.palette.onError} />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || !isConfigured}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  input.trim() && isConfigured ? theme.palette.primary : theme.palette.surfaceContainerHigh,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="arrow-up"
              size={16}
              color={input.trim() && isConfigured ? theme.palette.onPrimary : theme.palette.onSurfaceDim}
            />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 40,
    borderBottomWidth: 1,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 13.5,
  },
  sendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});
