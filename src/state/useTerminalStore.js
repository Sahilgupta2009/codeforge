import { create } from 'zustand';
import uuid from 'react-native-uuid';
import * as Haptics from 'expo-haptics';
import { executeLine } from '../terminal/commandDispatcher';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useSettingsStore } from './useSettingsStore';

const MAX_SCROLLBACK_LINES = 2000;
const MAX_HISTORY_ENTRIES = 200;

/**
 * @typedef {Object} TerminalLine
 * @property {string} id
 * @property {'input'|'output'|'error'|'system'} type
 * @property {string} text
 * @property {string} [promptPath]  only for 'input' lines, the cwd shown in the prompt when this was typed
 *
 * @typedef {Object} TerminalSession
 * @property {string} id
 * @property {string} title
 * @property {{uri: string, displayPath: string}} cwd
 * @property {TerminalLine[]} scrollback
 * @property {string[]} history       command history for up/down arrow recall
 * @property {number} historyIndex    -1 = not currently recalling
 * @property {boolean} isRunning      true while a command is executing
 * @property {'virtual'|'termux'} mode
 */

function createSession(workspace, index) {
  return {
    id: uuid.v4(),
    title: `Terminal ${index}`,
    cwd: { uri: workspace?.uri || '', displayPath: '' },
    scrollback: [
      {
        id: uuid.v4(),
        type: 'system',
        text: 'CodeForge terminal. Type "help" for a list of built-in commands.',
      },
    ],
    history: [],
    historyIndex: -1,
    isRunning: false,
    mode: 'virtual',
  };
}

export const useTerminalStore = create((set, get) => ({
  sessions: [],
  activeSessionId: null,
  panelVisible: false,
  panelHeight: 260, // px, draggable in the UI

  getActiveSession: () => {
    const state = get();
    return state.sessions.find((s) => s.id === state.activeSessionId) || null;
  },

  createSession: () => {
    const workspace = useWorkspaceStore.getState().workspace;
    const index = get().sessions.length + 1;
    const session = createSession(workspace, index);
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
      panelVisible: true,
    }));
    return session.id;
  },

  closeSession: (sessionId) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      let activeSessionId = state.activeSessionId;
      if (activeSessionId === sessionId) {
        activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null;
      }
      return { sessions, activeSessionId, panelVisible: sessions.length > 0 && state.panelVisible };
    }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  togglePanel: () =>
    set((state) => {
      // Opening the panel with zero sessions creates one automatically —
      // matches the expectation that "toggle terminal" always gets you
      // to a usable prompt, not an empty panel.
      if (!state.panelVisible && state.sessions.length === 0) {
        const workspace = useWorkspaceStore.getState().workspace;
        const session = createSession(workspace, 1);
        return { sessions: [session], activeSessionId: session.id, panelVisible: true };
      }
      return { panelVisible: !state.panelVisible };
    }),

  setPanelHeight: (height) => set({ panelHeight: Math.max(120, Math.min(600, height)) }),

  appendLine: (sessionId, line) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const scrollback = [...s.scrollback, { id: uuid.v4(), ...line }].slice(-MAX_SCROLLBACK_LINES);
        return { ...s, scrollback };
      }),
    })),

  clearScrollback: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id !== sessionId ? s : { ...s, scrollback: [] })),
    })),

  /**
   * Runs one input line against the given session: appends it to
   * scrollback as an 'input' line, dispatches it through the virtual
   * command system (or the Termux bridge if the session is in 'termux'
   * mode — see TerminalPanel.js for the mode switch UI), and appends the
   * result. Updates cwd if the command was `cd`.
   */
  runCommand: async (sessionId, rawLine) => {
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const workspace = useWorkspaceStore.getState().workspace;
    const promptPath = session.cwd.displayPath;

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id !== sessionId
          ? sess
          : {
              ...sess,
              isRunning: true,
              scrollback: [...sess.scrollback, { id: uuid.v4(), type: 'input', text: rawLine, promptPath }],
              history:
                rawLine.trim() && rawLine.trim() !== sess.history[sess.history.length - 1]
                  ? [...sess.history, rawLine.trim()].slice(-MAX_HISTORY_ENTRIES)
                  : sess.history,
              historyIndex: -1,
            }
      ),
    }));

    if (session.mode === 'termux') {
      // Termux execution is handled by the UI layer calling into
      // termuxBridge.js directly (it needs to show a "waiting for
      // Termux" state and handle the intent round-trip) rather than
      // through this store — see TerminalPanel.js's handleSubmit.
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id !== sessionId ? sess : { ...sess, isRunning: false })),
      }));
      return;
    }

    const trimmed = rawLine.trim();
    if (trimmed === 'clear') {
      get().clearScrollback(sessionId);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id !== sessionId ? sess : { ...sess, isRunning: false })),
      }));
      return;
    }
    if (trimmed === 'history') {
      const lines = session.history.map((h, i) => ({ type: 'output', text: `  ${i + 1}  ${h}` }));
      lines.forEach((line) => get().appendLine(sessionId, line));
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id !== sessionId ? sess : { ...sess, isRunning: false })),
      }));
      return;
    }

    const excludePatterns = useSettingsStore.getState().excludePatterns;
    const result = await executeLine(
      { cwd: session.cwd, rootUri: workspace?.uri, workspaceUri: workspace?.uri, excludePatterns },
      rawLine
    );

    result.output.forEach((text) => {
      get().appendLine(sessionId, { type: result.exitCode === 0 ? 'output' : 'error', text });
    });

    if (result.exitCode !== 0) {
      const { terminalBell, hapticsEnabled } = useSettingsStore.getState();
      if (terminalBell && hapticsEnabled) {
        // A real terminal bell is a BEL (\x07) byte in raw process
        // output; this virtual command interpreter doesn't stream raw
        // bytes from a real process, so a non-zero exit code — the
        // closest equivalent "something needs your attention" signal
        // this interpreter actually has — is what triggers it. Haptic
        // feedback (not a system sound) is the right mobile equivalent
        // for a background terminal panel, and it reuses the exact
        // Haptics.impactAsync(...).catch(() => {}) pattern already
        // established in FileTreeRow.js rather than introducing a new
        // convention. Gated on hapticsEnabled too, since the terminal
        // bell is fundamentally a haptic/alert preference and a user
        // who's turned haptics off app-wide shouldn't feel one from
        // here regardless of the terminalBell toggle's own state.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id !== sessionId
          ? sess
          : {
              ...sess,
              isRunning: false,
              cwd: result.newCwd || sess.cwd,
            }
      ),
    }));
  },

  recallHistory: (sessionId, direction) => {
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session || session.history.length === 0) return null;

    let newIndex = session.historyIndex;
    if (direction === 'up') {
      newIndex = newIndex === -1 ? session.history.length - 1 : Math.max(0, newIndex - 1);
    } else {
      newIndex = newIndex === -1 ? -1 : newIndex + 1 >= session.history.length ? -1 : newIndex + 1;
    }

    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id !== sessionId ? sess : { ...sess, historyIndex: newIndex })),
    }));

    return newIndex === -1 ? '' : session.history[newIndex];
  },

  setSessionMode: (sessionId, mode) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id !== sessionId ? s : { ...s, mode })),
    })),
}));
