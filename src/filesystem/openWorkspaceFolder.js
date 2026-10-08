import * as FileSystem from 'expo-file-system';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { FS } from './FileSystemRouter';

const SAF = FileSystem.StorageAccessFramework;

/**
 * Opens (or reopens) a project folder as the active workspace, using
 * SAF's directory-permission flow — this is the API that grants full,
 * persisted read/write access to an entire folder tree (not just one
 * file), which is what a "workspace" needs.
 *
 * `requestDirectoryPermissionsAsync()` shows Android's native folder
 * picker and, on approval, returns a tree URI backed by a **persisted**
 * URI permission grant — meaning it survives app restarts and device
 * reboots without re-prompting, as long as the user doesn't revoke it
 * from Android's Settings. That persistence is what makes "Recent
 * Projects" reopen silently instead of re-picking every time.
 *
 * @param {{ existingUri?: string, name?: string }} [options]
 * @returns {Promise<{uri: string, name: string, openedAt: number} | null>}
 */
export async function openWorkspaceFolder(options = {}) {
  const { existingUri, name: existingName } = options;

  if (existingUri) {
    return reopenExistingWorkspace(existingUri, existingName);
  }

  return pickNewWorkspace();
}

async function pickNewWorkspace() {
  const permission = await SAF.requestDirectoryPermissionsAsync();

  if (!permission.granted) {
    return null; // User cancelled the picker — not an error, just a no-op.
  }

  const uri = permission.directoryUri;
  const name = deriveWorkspaceName(uri);
  const workspace = { uri, name, openedAt: Date.now() };

  useWorkspaceStore.getState().openWorkspace(workspace);
  useSettingsStore.getState().addRecentProject({ uri, name });

  return workspace;
}

async function reopenExistingWorkspace(uri, fallbackName) {
  // The permission grant from a previous session is persisted by Android
  // itself (SAF handles this at the OS level once granted) — we just need
  // to confirm the folder is still reachable before treating it as open,
  // since the user may have deleted it, moved it, or revoked access from
  // Android Settings > Apps > CodeForge > Permissions since we last saw it.
  const stillAccessible = await FS.exists(uri).catch(() => false);

  if (!stillAccessible) {
    // Fall back to a fresh pick rather than silently failing — the most
    // useful thing we can do is let the user re-grant access to the same
    // (or a replacement) folder immediately.
    useSettingsStore.getState().removeRecentProject(uri);
    return pickNewWorkspace();
  }

  const name = fallbackName || deriveWorkspaceName(uri);
  const workspace = { uri, name, openedAt: Date.now() };

  useWorkspaceStore.getState().openWorkspace(workspace);
  useSettingsStore.getState().addRecentProject({ uri, name });

  return workspace;
}

/**
 * SAF tree URIs encode the folder name in their document id, e.g.
 *   content://com.android.externalstorage.documents/tree/primary%3AMyProject
 * decodes to a doc id of "primary:MyProject" — we take the segment after
 * the last '/' or ':' as the display name.
 */
function deriveWorkspaceName(treeUri) {
  try {
    const decoded = decodeURIComponent(treeUri);
    const afterColon = decoded.split(':').pop() || decoded;
    const segments = afterColon.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'Project';
  } catch {
    return 'Project';
  }
}

/**
 * Returns the workspace's root document URI as a listable directory URI.
 * For SAF tree permissions, the tree URI itself is what listDirectory
 * expects (expo-file-system's SAF module accepts tree URIs directly as
 * the starting point for readDirectoryAsync).
 */
export function getWorkspaceRootUri(workspace) {
  return workspace?.uri || null;
}
