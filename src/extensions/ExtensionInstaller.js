import { validateManifest } from './manifestSchema';
import { SandboxFileSystem, SANDBOX_DIRS } from '../filesystem/SandboxFileSystem';
import { useExtensionStore } from '../state/useExtensionStore';

/**
 * Installs an extension: validates its manifest, writes extension.json
 * and main.js into the sandbox filesystem under
 * SANDBOX_DIRS.extensions/<sourceDir>/, and registers it in
 * useExtensionStore with the permissions the user approved.
 *
 * `files` is a map of relative-path -> content (e.g. {'main.js': '...'})
 * — for the bundled example extensions (Part 8's src/extensions/examples/),
 * the marketplace UI passes their real source directly; a future
 * "install from URL/file" flow would populate this the same way after
 * fetching/unzipping elsewhere, without this function needing to change.
 */
export async function installExtension(manifest, files, grantedPermissions) {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    return { success: false, error: `Invalid extension manifest: ${validation.errors.join('; ')}` };
  }

  if (useExtensionStore.getState().isInstalled(manifest.id)) {
    return { success: false, error: 'This extension is already installed.' };
  }

  // Only grant permissions that are both requested by the manifest AND
  // approved by the user — this is what makes updatePermissions later
  // meaningful (a user could, in principle, approve a subset), and
  // guards against a manifest listing a permission the approval UI
  // never actually presented.
  const effectiveGrants = grantedPermissions.filter((p) => manifest.permissions.includes(p));

  const sourceDir = manifest.id;
  const extDirUri = `${SANDBOX_DIRS.extensions}/${sourceDir}`;

  try {
    await SandboxFileSystem.createDirectory(SANDBOX_DIRS.extensions, sourceDir);
  } catch (err) {
    // Directory may already exist from a previous failed install attempt — continue.
  }

  try {
    await SandboxFileSystem.writeFile(`${extDirUri}/extension.json`, JSON.stringify(manifest, null, 2));
    for (const [relativePath, content] of Object.entries(files)) {
      await SandboxFileSystem.writeFile(`${extDirUri}/${relativePath}`, content);
    }
  } catch (err) {
    return { success: false, error: `Failed to write extension files: ${err.message}` };
  }

  useExtensionStore.getState().install(manifest, effectiveGrants, sourceDir);
  return { success: true };
}

/** Uninstalls an extension: removes it from the store and deletes its sandbox files. */
export async function uninstallExtension(extensionId) {
  const extension = useExtensionStore.getState().getExtension(extensionId);
  if (!extension) return { success: false, error: 'Extension is not installed.' };

  try {
    await SandboxFileSystem.delete(`${SANDBOX_DIRS.extensions}/${extension.sourceDir}`);
  } catch (err) {
    // If the directory is already gone (e.g. manually cleared), that's
    // fine — the goal state (files gone) is already achieved. Still
    // proceed to remove the store entry either way.
  }

  useExtensionStore.getState().uninstall(extensionId);
  return { success: true };
}
