import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const extensionsStorage = new MMKV({ id: 'codeforge-extensions' });
const zustandMMKVStorage = {
  setItem: (name, value) => extensionsStorage.set(name, value),
  getItem: (name) => extensionsStorage.getString(name) ?? null,
  removeItem: (name) => extensionsStorage.delete(name),
};

/**
 * @typedef {Object} InstalledExtension
 * @property {string} id
 * @property {Object} manifest        the validated manifest (see manifestSchema.js)
 * @property {boolean} enabled
 * @property {string[]} grantedPermissions   permissions the user actually approved (subset of manifest.permissions)
 * @property {string} installedAt     ISO date string
 * @property {string} sourceDir       sandbox-relative directory containing extension.json/main.js
 */

export const useExtensionStore = create(
  persist(
    (set, get) => ({
      installed: [], // InstalledExtension[]
      registeredCommands: {}, // extensionId -> [{id, title}]
      statusBarItems: {}, // extensionId -> text

      isInstalled: (extensionId) => get().installed.some((e) => e.id === extensionId),

      getExtension: (extensionId) => get().installed.find((e) => e.id === extensionId) || null,

      install: (manifest, grantedPermissions, sourceDir) =>
        set((state) => {
          if (state.installed.some((e) => e.id === manifest.id)) {
            return state; // already installed — no-op, caller should check isInstalled first
          }
          const entry = {
            id: manifest.id,
            manifest,
            enabled: true,
            grantedPermissions,
            installedAt: new Date().toISOString(),
            sourceDir,
          };
          return { installed: [...state.installed, entry] };
        }),

      uninstall: (extensionId) =>
        set((state) => {
          const registeredCommands = { ...state.registeredCommands };
          delete registeredCommands[extensionId];
          const statusBarItems = { ...state.statusBarItems };
          delete statusBarItems[extensionId];
          return {
            installed: state.installed.filter((e) => e.id !== extensionId),
            registeredCommands,
            statusBarItems,
          };
        }),

      setEnabled: (extensionId, enabled) =>
        set((state) => ({
          installed: state.installed.map((e) => (e.id === extensionId ? { ...e, enabled } : e)),
          // Disabling an extension retracts anything it contributed to
          // the UI immediately, rather than leaving stale palette
          // entries/status bar items around for a now-inert extension.
          registeredCommands: enabled
            ? state.registeredCommands
            : { ...state.registeredCommands, [extensionId]: [] },
          statusBarItems: enabled
            ? state.statusBarItems
            : Object.fromEntries(Object.entries(state.statusBarItems).filter(([id]) => id !== extensionId)),
        })),

      updatePermissions: (extensionId, grantedPermissions) =>
        set((state) => ({
          installed: state.installed.map((e) => (e.id === extensionId ? { ...e, grantedPermissions } : e)),
        })),

      registerCommand: (extensionId, command) =>
        set((state) => {
          const existing = state.registeredCommands[extensionId] || [];
          if (existing.some((c) => c.id === command.id)) return state;
          return {
            registeredCommands: {
              ...state.registeredCommands,
              [extensionId]: [...existing, command],
            },
          };
        }),

      setStatusBarText: (extensionId, text) =>
        set((state) => ({
          statusBarItems: { ...state.statusBarItems, [extensionId]: text },
        })),

      getAllContributedCommands: () => {
        const state = get();
        const result = [];
        for (const ext of state.installed) {
          if (!ext.enabled) continue;
          const commands = state.registeredCommands[ext.id] || [];
          commands.forEach((cmd) => result.push({ ...cmd, extensionId: ext.id, extensionName: ext.manifest.displayName }));
        }
        return result;
      },
    }),
    {
      name: 'codeforge-extensions-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
    }
  )
);
