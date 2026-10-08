import { create } from 'zustand';
import uuid from 'react-native-uuid';

import { streamChat, runOneOffAction } from '../ai/aiService';
import { useSettingsStore } from './useSettingsStore';
import { SandboxFileSystem, SANDBOX_DIRS } from '../filesystem/SandboxFileSystem';

const HISTORY_FILE = `${SANDBOX_DIRS.aiLogs}/conversation.json`;

// Only the last N turns are sent to the provider on each request, to
// keep token usage/cost bounded on long-running conversations. The full
// history is still kept in the store/on disk for display and scrollback
// — this only trims what's SENT, not what's shown.
const MAX_HISTORY_TURNS_SENT = 30;

function createMessage(role, content) {
  return {
    id: uuid.v4(),
    role, // 'user' | 'assistant'
    content,
    createdAt: Date.now(),
    error: false,
  };
}

/**
 * @typedef {Object} AIMessage
 * @property {string} id
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {number} createdAt
 * @property {boolean} error
 */

export const useAIStore = create((set, get) => ({
  messages: /** @type {AIMessage[]} */ ([]),
  isStreaming: false,
  streamingMessageId: null,
  errorMessage: null,
  historyLoaded: false,
  historyLoading: false,

  // One-off code-action state, kept separate from chat messages so the
  // Chat panel and the Code Actions sheet never interfere with each
  // other's streaming state.
  actionResult: null, // { actionId, text, isStreaming, error }

  _abortStream: null,
  _abortAction: null,

  // --- Persistence ---

  /** Loads conversation history from SandboxFileSystem (called once, e.g. on Chat panel mount). */
  loadHistory: async () => {
    if (get().historyLoaded || get().historyLoading) return;
    set({ historyLoading: true });
    try {
      const exists = await SandboxFileSystem.exists(HISTORY_FILE);
      if (!exists) {
        set({ messages: [], historyLoaded: true, historyLoading: false });
        return;
      }
      const raw = await SandboxFileSystem.readFile(HISTORY_FILE);
      const parsed = JSON.parse(raw);
      const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
      set({ messages, historyLoaded: true, historyLoading: false });
    } catch (err) {
      // A corrupt or unreadable history file shouldn't block the chat
      // panel from working — start fresh rather than surfacing a
      // confusing error for something the user didn't cause directly.
      set({ messages: [], historyLoaded: true, historyLoading: false });
    }
  },

  /** Persists the current message list to SandboxFileSystem (app-private storage, never the user's workspace). */
  _persistHistory: async () => {
    try {
      const { messages } = get();
      await SandboxFileSystem.ensureSandboxDirs();
      await SandboxFileSystem.writeFile(HISTORY_FILE, JSON.stringify({ messages }, null, 2));
    } catch {
      // Persistence failures are non-fatal to the live conversation;
      // the user can keep chatting even if the write failed (e.g.
      // transient storage issue). Nothing to surface here that the
      // user could act on mid-conversation.
    }
  },

  clearConversation: async () => {
    const abort = get()._abortStream;
    if (abort) abort();
    set({ messages: [], isStreaming: false, streamingMessageId: null, errorMessage: null, _abortStream: null });
    try {
      await SandboxFileSystem.ensureSandboxDirs();
      const exists = await SandboxFileSystem.exists(HISTORY_FILE);
      if (exists) await SandboxFileSystem.delete(HISTORY_FILE);
    } catch {
      // Best-effort: in-memory conversation is already cleared regardless.
    }
  },

  // --- Chat ---

  /**
   * Sends a user message and streams the assistant's reply.
   * `activeFileContext` (optional) is `{ fileName, language }` for
   * whatever tab is currently focused, so the system prompt can
   * mention it without the chat needing to always be "about" that file.
   */
  sendMessage: (text, activeFileContext) => {
    const trimmed = (text || '').trim();
    if (!trimmed || get().isStreaming) return;

    const userMessage = createMessage('user', trimmed);
    const assistantMessage = createMessage('assistant', '');

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      streamingMessageId: assistantMessage.id,
      errorMessage: null,
    }));

    const settings = useSettingsStore.getState();
    const historyForRequest = get()
      .messages.filter((m) => m.id !== assistantMessage.id && !m.error)
      .slice(-MAX_HISTORY_TURNS_SENT)
      .map((m) => ({ role: m.role, content: m.content }));

    const updateAssistantContent = (updater) => {
      set((state) => ({
        messages: state.messages.map((m) => (m.id === assistantMessage.id ? { ...m, content: updater(m.content) } : m)),
      }));
    };

    const abort = streamChat(
      { settings, history: historyForRequest, activeFileContext },
      {
        onTextDelta: (delta) => {
          updateAssistantContent((prev) => prev + delta);
        },
        onDone: () => {
          set({ isStreaming: false, streamingMessageId: null, _abortStream: null });
          get()._persistHistory();
        },
        onAborted: () => {
          set({ isStreaming: false, streamingMessageId: null, _abortStream: null });
          get()._persistHistory();
        },
        onError: (err) => {
          set((state) => ({
            isStreaming: false,
            streamingMessageId: null,
            errorMessage: err?.message || 'The AI request failed.',
            _abortStream: null,
            messages: state.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, error: true, content: m.content || '(No response — see error above.)' }
                : m
            ),
          }));
        },
      }
    );

    set({ _abortStream: abort });
  },

  /** Cancels the in-flight assistant reply, if any. */
  stopStreaming: () => {
    const abort = get()._abortStream;
    if (abort) abort();
  },

  // --- One-off code actions (Explain / Generate / Fix / Refactor / Comment / Continue) ---

  /**
   * Runs a code action against the given params (see
   * promptTemplates.buildCodeActionPrompt for the expected shape per
   * action). Streams into `actionResult` rather than the chat message
   * list, since these are one-off and shown in AICodeActionsSheet, not
   * the conversation.
   */
  runOneOffAction: (actionId, params) => {
    const existingAbort = get()._abortAction;
    if (existingAbort) existingAbort();

    set({ actionResult: { actionId, text: '', isStreaming: true, error: null } });

    const settings = useSettingsStore.getState();
    const abort = runOneOffAction(
      { settings, actionId, params },
      {
        onTextDelta: (delta) => {
          set((state) => ({
            actionResult: state.actionResult
              ? { ...state.actionResult, text: state.actionResult.text + delta }
              : state.actionResult,
          }));
        },
        onDone: () => {
          set((state) => ({
            actionResult: state.actionResult ? { ...state.actionResult, isStreaming: false } : state.actionResult,
            _abortAction: null,
          }));
        },
        onAborted: () => {
          set((state) => ({
            actionResult: state.actionResult ? { ...state.actionResult, isStreaming: false } : state.actionResult,
            _abortAction: null,
          }));
        },
        onError: (err) => {
          set((state) => ({
            actionResult: state.actionResult
              ? { ...state.actionResult, isStreaming: false, error: err?.message || 'The AI request failed.' }
              : state.actionResult,
            _abortAction: null,
          }));
        },
      }
    );

    set({ _abortAction: abort });
  },

  stopAction: () => {
    const abort = get()._abortAction;
    if (abort) abort();
  },

  clearActionResult: () => {
    const abort = get()._abortAction;
    if (abort) abort();
    set({ actionResult: null, _abortAction: null });
  },
}));

export default useAIStore;
