/**
 * Extension Manifest Schema
 * --------------------------
 * Every extension is a folder containing at minimum:
 *   extension.json   <- this manifest
 *   main.js          <- the extension's entry point, run inside a
 *                        sandboxed WebView (see ExtensionRuntime.js)
 *   (optional) icon.png, README.md
 *
 * The manifest is intentionally close to VS Code's package.json
 * extension fields (name, displayName, permissions-as-capabilities)
 * since that's a well-understood shape for anyone who's built an editor
 * extension before, adapted to CodeForge's own capability names.
 *
 * Permissions are capability strings the extension declares it needs;
 * the host (ExtensionRuntime.js) only exposes bridge API methods
 * matching granted permissions — an extension that didn't declare
 * "workspace.write" gets a bridge object where write-side methods
 * simply don't exist, not just methods that silently no-op. This is
 * enforced host-side (inside the RN app, outside the WebView sandbox),
 * so a compromised or malicious extension can't grant itself more than
 * the user approved at install time by manipulating its own sandboxed
 * copy of the manifest.
 */

export const PERMISSIONS = {
  WORKSPACE_READ: 'workspace.read',
  WORKSPACE_WRITE: 'workspace.write',
  EDITOR_READ: 'editor.read', // read active file content/cursor/selection
  EDITOR_WRITE: 'editor.write', // insert/replace text in the active editor
  COMMANDS_REGISTER: 'commands.register', // add entries to the Command Palette
  UI_PANEL: 'ui.panel', // render a custom sidebar/bottom panel
  UI_STATUSBAR: 'ui.statusbar', // add a status bar segment
  NETWORK: 'network', // fetch() to external URLs
  STORAGE: 'storage', // persist extension-private key/value data
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const REQUIRED_FIELDS = ['id', 'name', 'displayName', 'version', 'main'];

/**
 * @typedef {Object} ExtensionManifest
 * @property {string} id                unique, e.g. "codeforge.word-count"
 * @property {string} name               short machine name
 * @property {string} displayName        shown in the marketplace UI
 * @property {string} version            semver string
 * @property {string} description
 * @property {string} publisher
 * @property {string} main               relative path to entry file, e.g. "main.js"
 * @property {string[]} permissions       array of PERMISSIONS values
 * @property {string[]} [categories]      e.g. ["Formatters", "Themes"]
 * @property {Object} [contributes]       declarative contributions (commands, etc.)
 */

/**
 * Validates a manifest object, returning { valid: boolean, errors: string[] }.
 * Called before an extension is ever installed or run — invalid
 * manifests are rejected outright rather than partially trusted.
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a JSON object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field] || typeof manifest[field] !== 'string') {
      errors.push(`Missing or invalid required field: "${field}"`);
    }
  }

  if (manifest.id && !/^[a-z0-9][a-z0-9._-]*$/.test(manifest.id)) {
    errors.push('"id" must be lowercase alphanumeric with . _ - separators');
  }

  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('"version" must be a semver string, e.g. "1.0.0"');
  }

  if (manifest.permissions) {
    if (!Array.isArray(manifest.permissions)) {
      errors.push('"permissions" must be an array of strings');
    } else {
      for (const perm of manifest.permissions) {
        if (!ALL_PERMISSIONS.includes(perm)) {
          errors.push(`Unknown permission: "${perm}"`);
        }
      }
    }
  }

  if (manifest.contributes?.commands) {
    if (!Array.isArray(manifest.contributes.commands)) {
      errors.push('"contributes.commands" must be an array');
    } else {
      for (const cmd of manifest.contributes.commands) {
        if (!cmd.id || !cmd.title) {
          errors.push('Each contributed command needs "id" and "title"');
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Human-readable descriptions shown in the permission-approval UI at install time. */
export const PERMISSION_DESCRIPTIONS = {
  [PERMISSIONS.WORKSPACE_READ]: 'Read files in your open project',
  [PERMISSIONS.WORKSPACE_WRITE]: 'Create, modify, or delete files in your open project',
  [PERMISSIONS.EDITOR_READ]: 'See the content, cursor position, and selection of the file you have open',
  [PERMISSIONS.EDITOR_WRITE]: 'Insert or replace text in the file you have open',
  [PERMISSIONS.COMMANDS_REGISTER]: 'Add new commands to the Command Palette',
  [PERMISSIONS.UI_PANEL]: 'Show a custom panel in the sidebar or bottom panel',
  [PERMISSIONS.UI_STATUSBAR]: 'Add an item to the status bar',
  [PERMISSIONS.NETWORK]: 'Connect to the internet',
  [PERMISSIONS.STORAGE]: 'Save its own settings and data on this device',
};
