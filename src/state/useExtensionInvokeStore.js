import { create } from 'zustand';

/**
 * Registers each running extension's imperative "invoke a command"
 * function (which posts a 'commands.invoked' event into that
 * extension's own WebView — see ExtensionRuntime.js) so the Command
 * Palette can trigger an extension-contributed command without needing
 * a direct reference to that extension's WebView instance. Same
 * bridging pattern Part 3/4 established with useEditorHandlersStore for
 * undo/redo — a small reactive registry rather than prop-drilling an
 * imperative ref through the whole component tree.
 */
export const useExtensionInvokeStore = create((set, get) => ({
  invokers: {}, // extensionId -> (commandId: string) => void

  registerInvoker: (extensionId, invoke) =>
    set((state) => ({ invokers: { ...state.invokers, [extensionId]: invoke } })),

  unregisterInvoker: (extensionId) =>
    set((state) => {
      const next = { ...state.invokers };
      delete next[extensionId];
      return { invokers: next };
    }),

  invokeCommand: (extensionId, commandId) => {
    const invoke = get().invokers[extensionId];
    if (invoke) invoke(commandId);
  },
}));
