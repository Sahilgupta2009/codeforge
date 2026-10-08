import React from 'react';
import { useExtensionStore } from '../state/useExtensionStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import ExtensionRuntime from './ExtensionRuntime';

/**
 * Mounted once near the root of the Workspace screen. Renders one
 * (invisible, 0x0) ExtensionRuntime WebView per enabled installed
 * extension — this is what actually keeps an extension "running": its
 * main.js has executed, its event listeners (onSelectionChanged, etc.)
 * are live, and its registered commands are ready to be invoked from
 * the Command Palette. Disabling an extension (via the Installed
 * Extensions view) or uninstalling it un-mounts its ExtensionRuntime,
 * which tears down its WebView entirely — a disabled extension is not
 * running in any sense, not just hidden.
 *
 * Extensions only run while a workspace is open (most bridge methods,
 * like workspace.readFile, are meaningless without one), matching how
 * the rest of CodeForge's workspace-scoped features behave.
 */
export default function ExtensionHost() {
  const installed = useExtensionStore((s) => s.installed);
  const workspace = useWorkspaceStore((s) => s.workspace);

  if (!workspace) return null;

  const enabledExtensions = installed.filter((e) => e.enabled);

  return (
    <>
      {enabledExtensions.map((extension) => (
        <ExtensionRuntime key={extension.id} extension={extension} />
      ))}
    </>
  );
}
