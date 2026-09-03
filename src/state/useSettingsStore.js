import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

// A dedicated MMKV instance for settings. Using MMKV (not AsyncStorage)
// because it's synchronous and fast enough to read on every app boot
// without a loading flash, and because settings are small key-value data
// (not file content, which goes through the FileSystem layer instead).
export const settingsStorage = new MMKV({ id: 'codeforge-settings' });

const zustandMMKVStorage = {
  setItem: (name, value) => settingsStorage.set(name, value),
  getItem: (name) => settingsStorage.getString(name) ?? null,
  removeItem: (name) => settingsStorage.delete(name),
};

export const DEFAULT_KEYBINDINGS = {
  save: 'Ctrl+S',
  saveAll: 'Ctrl+Shift+S',
  find: 'Ctrl+F',
  findReplace: 'Ctrl+H',
  findInFiles: 'Ctrl+Shift+F',
  goToLine: 'Ctrl+G',
  commandPalette: 'Ctrl+Shift+P',
  newFile: 'Ctrl+N',
  closeTab: 'Ctrl+W',
  nextTab: 'Ctrl+Tab',
  prevTab: 'Ctrl+Shift+Tab',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  duplicateLine: 'Ctrl+D',
  deleteLine: 'Ctrl+Shift+K',
  moveLineUp: 'Alt+Up',
  moveLineDown: 'Alt+Down',
  toggleComment: 'Ctrl+/',
  toggleTerminal: 'Ctrl+`',
  toggleSidebar: 'Ctrl+B',
  splitEditor: 'Ctrl+\\',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  formatDocument: 'Shift+Alt+F',
};

const initialState = {
  // Appearance
  themeMode: 'dark', // 'light' | 'dark' | 'system'
  systemColorScheme: 'dark',
  accentColor: 'teal',

  // Editor
  fontFamily: 'mono-regular',
  fontSize: 14,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: true,
  showMinimap: true,
  showLineNumbers: true,
  relativeLineNumbers: false,
  highlightActiveLine: true,
  autoClosingBrackets: true,
  autoIndent: true,
  formatOnSave: false,
  trimTrailingWhitespaceOnSave: true,
  cursorBlink: true,
  renderWhitespace: false,

  // Files
  autoSave: 'off', // 'off' | 'afterDelay' | 'onFocusChange'
  autoSaveDelayMs: 1000,
  confirmBeforeDelete: true,
  excludePatterns: ['node_modules', '.git', 'build', 'dist', '.gradle'],

  // Keybindings (hardware keyboard)
  keybindings: DEFAULT_KEYBINDINGS,

  // Terminal
  terminalFontSize: 13,
  terminalBell: true,

  // AI
  aiProvider: 'anthropic', // 'anthropic' | 'openai' | 'custom'
  aiApiKey: '',
  aiApiBaseUrl: '',
  aiModel: 'claude-sonnet-4-6',

  // Misc
  hapticsEnabled: true,
  recentProjects: [], // [{ uri, name, lastOpenedAt }]
};

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      setSetting: (key, value) => set({ [key]: value }),

      setMultiple: (partial) => set(partial),

      setKeybinding: (action, combo) =>
        set((state) => ({
          keybindings: { ...state.keybindings, [action]: combo },
        })),

      resetKeybindings: () => set({ keybindings: DEFAULT_KEYBINDINGS }),

      addRecentProject: (project) =>
        set((state) => {
          const filtered = state.recentProjects.filter((p) => p.uri !== project.uri);
          return {
            recentProjects: [{ ...project, lastOpenedAt: Date.now() }, ...filtered].slice(0, 20),
          };
        }),

      removeRecentProject: (uri) =>
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.uri !== uri),
        })),

      setSystemColorScheme: (scheme) => set({ systemColorScheme: scheme }),

      resetAllSettings: () => set(initialState),
    }),
    {
      name: 'codeforge-settings-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
    }
  )
);
