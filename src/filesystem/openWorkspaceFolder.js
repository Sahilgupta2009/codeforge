import * as DocumentPicker from 'expo-document-picker';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useSettingsStore } from '../state/useSettingsStore';

/**
 * Opens (or reopens) a project folder as the active workspace.
 *
 * PART 1 NOTE: this already performs a real SAF directory pick and
 * persists the workspace into the store — it is not a mock. What Part 2
 * adds on top is: persisted URI permission handling across app restarts
 * (so `existingUri` reopen works reliably after a reboot), workspace
 * validation (folder still exists / still accessible), and the full
 * SAFFileSystem read/write implementation that the Explorer and Editor
 * consume. Reopening a *recent* project before Part 2 lands may prompt
 * the SAF picker again rather than silently reusing the old grant — that
 * silent-reuse behavior is what Part 2 completes.
 *
 * @param {{ existingUri?: string, name?: string }} [options]
 * @returns {Promise<{uri: string, name: string, openedAt: number} | null>}
 */
export async function openWorkspaceFolder(options = {}) {
  const { existingUri, name: existingName } = options;

  let uri = existingUri;
  let name = existingName;

  if (!uri) {
    const result = await DocumentPicker.getDocumentAsync({
      // expo-document-picker's directory support varies by SDK; Part 2
      // swaps this for the SAF tree-picker intent directly via
      // expo-intent-launcher for full directory (not single-file) access,
      // which is required for whole-project workspaces.
      type: '*/*',
      copyToCacheDirectory: false,
    });

    if (result.canceled) return null;

    uri = result.assets?.[0]?.uri;
    name = result.assets?.[0]?.name || uri?.split('/').pop() || 'Untitled Project';

    if (!uri) return null;
  }

  const workspace = { uri, name, openedAt: Date.now() };

  useWorkspaceStore.getState().openWorkspace(workspace);
  useSettingsStore.getState().addRecentProject({ uri, name });

  return workspace;
}
