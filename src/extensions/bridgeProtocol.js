/**
 * Extension Bridge Protocol
 * --------------------------
 * The ONLY channel between a sandboxed extension (running inside a
 * react-native-webview, its own separate JS engine instance with no
 * access to the host app's memory, React tree, or native modules) and
 * CodeForge itself is `postMessage` / `onMessage` — WebView's standard
 * cross-context messaging primitive. This module defines the message
 * shapes for that channel and the request/response matching logic, used
 * by both sides: the extension-side SDK (extensionSDK.js, which gets
 * injected into the WebView and turns these raw messages into a nice
 * `codeforge.workspace.readFile(...)`-style API) and the host-side
 * runtime (ExtensionRuntime.js, which receives requests, checks
 * permissions, performs the real operation, and replies).
 *
 * Message shape (both directions):
 *   { id: string, type: 'request'|'response'|'event',
 *     method?: string, params?: any, result?: any, error?: string }
 *
 * Every request gets exactly one response, matched by `id` — this lets
 * the extension-side SDK expose synchronous-feeling async functions
 * (`await codeforge.workspace.readFile(path)`) built on top of
 * fire-and-forget postMessage by tracking pending promises per id.
 */

let idCounter = 0;
export function generateMessageId() {
  idCounter += 1;
  return `msg_${Date.now()}_${idCounter}`;
}

export function createRequest(method, params) {
  return { id: generateMessageId(), type: 'request', method, params };
}

export function createResponse(requestId, result) {
  return { id: requestId, type: 'response', result };
}

export function createErrorResponse(requestId, error) {
  return { id: requestId, type: 'response', error: typeof error === 'string' ? error : error?.message || 'Unknown error' };
}

export function createEvent(eventName, payload) {
  return { id: generateMessageId(), type: 'event', method: eventName, params: payload };
}

/**
 * Validates that a raw parsed message (from either direction) has the
 * shape this protocol requires before acting on it. Both the host and
 * the injected SDK call this on every incoming message — since a
 * malicious or buggy extension controls what it sends, the host must
 * never trust message shape without checking, and the SDK likewise
 * shouldn't trust the host blindly either (defense in depth, even
 * though the host side is "our" code).
 */
export function isValidMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.id !== 'string' || !msg.id) return false;
  if (!['request', 'response', 'event'].includes(msg.type)) return false;
  if (msg.type === 'request' && typeof msg.method !== 'string') return false;
  if (msg.type === 'event' && typeof msg.method !== 'string') return false;
  return true;
}

/**
 * Safely parses a raw postMessage string payload into a message object,
 * returning null (not throwing) on malformed JSON or invalid shape —
 * WebView message payloads are always strings, and a misbehaving
 * extension sending garbage should degrade to "ignored", not crash the
 * host's message listener for every subsequent message too.
 */
export function parseMessage(raw) {
  try {
    const parsed = JSON.parse(raw);
    return isValidMessage(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

export function serializeMessage(msg) {
  return JSON.stringify(msg);
}

/**
 * The fixed set of RPC method names the host runtime recognizes,
 * namespaced by the permission that gates them (see manifestSchema.js).
 * The extension-side SDK only ever calls these; the host only ever
 * handles these — this list is the actual API surface in its entirety,
 * which is what "sandboxed" means in practice: not just process
 * isolation, but a closed, enumerable capability set.
 */
export const BRIDGE_METHODS = {
  // workspace.read
  WORKSPACE_LIST_FILES: 'workspace.listFiles',
  WORKSPACE_READ_FILE: 'workspace.readFile',
  // workspace.write
  WORKSPACE_WRITE_FILE: 'workspace.writeFile',
  WORKSPACE_CREATE_FILE: 'workspace.createFile',
  WORKSPACE_DELETE_FILE: 'workspace.deleteFile',
  // editor.read
  EDITOR_GET_ACTIVE_FILE: 'editor.getActiveFile',
  EDITOR_GET_SELECTION: 'editor.getSelection',
  // editor.write
  EDITOR_INSERT_TEXT: 'editor.insertText',
  EDITOR_REPLACE_SELECTION: 'editor.replaceSelection',
  // commands.register
  COMMANDS_REGISTER: 'commands.register',
  COMMANDS_EXECUTE: 'commands.execute',
  // ui.panel
  UI_SET_PANEL_HTML: 'ui.setPanelHtml',
  // ui.statusbar
  UI_SET_STATUSBAR_TEXT: 'ui.setStatusBarText',
  // network
  NETWORK_FETCH: 'network.fetch',
  // storage
  STORAGE_GET: 'storage.get',
  STORAGE_SET: 'storage.set',
  // always available, no permission required
  LOG: 'host.log',
  SHOW_TOAST: 'host.showToast',
};

/** Maps each bridge method to the single permission required to call it (or null if always allowed). */
export const METHOD_PERMISSIONS = {
  [BRIDGE_METHODS.WORKSPACE_LIST_FILES]: 'workspace.read',
  [BRIDGE_METHODS.WORKSPACE_READ_FILE]: 'workspace.read',
  [BRIDGE_METHODS.WORKSPACE_WRITE_FILE]: 'workspace.write',
  [BRIDGE_METHODS.WORKSPACE_CREATE_FILE]: 'workspace.write',
  [BRIDGE_METHODS.WORKSPACE_DELETE_FILE]: 'workspace.write',
  [BRIDGE_METHODS.EDITOR_GET_ACTIVE_FILE]: 'editor.read',
  [BRIDGE_METHODS.EDITOR_GET_SELECTION]: 'editor.read',
  [BRIDGE_METHODS.EDITOR_INSERT_TEXT]: 'editor.write',
  [BRIDGE_METHODS.EDITOR_REPLACE_SELECTION]: 'editor.write',
  [BRIDGE_METHODS.COMMANDS_REGISTER]: 'commands.register',
  [BRIDGE_METHODS.COMMANDS_EXECUTE]: 'commands.register',
  [BRIDGE_METHODS.UI_SET_PANEL_HTML]: 'ui.panel',
  [BRIDGE_METHODS.UI_SET_STATUSBAR_TEXT]: 'ui.statusbar',
  [BRIDGE_METHODS.NETWORK_FETCH]: 'network',
  [BRIDGE_METHODS.STORAGE_GET]: 'storage',
  [BRIDGE_METHODS.STORAGE_SET]: 'storage',
  [BRIDGE_METHODS.LOG]: null,
  [BRIDGE_METHODS.SHOW_TOAST]: null,
};

/** Returns true if `permissions` (the extension's granted set) allows calling `method`. */
export function isMethodAllowed(method, grantedPermissions) {
  const required = METHOD_PERMISSIONS[method];
  if (required === undefined) return false; // unknown method — never allowed
  if (required === null) return true; // no permission needed
  return grantedPermissions.includes(required);
}
