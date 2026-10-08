import React, { useCallback, useRef, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import Toast from 'react-native-toast-message';

import { parseMessage, serializeMessage, createResponse, createErrorResponse, isMethodAllowed, BRIDGE_METHODS } from './bridgeProtocol';
import { FS } from '../filesystem/FileSystemRouter';
import { SandboxFileSystem, SANDBOX_DIRS } from '../filesystem/SandboxFileSystem';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useEditorStore } from '../state/useEditorStore';
import { useExtensionStore } from '../state/useExtensionStore';
import { useExtensionInvokeStore } from '../state/useExtensionInvokeStore';

/**
 * ExtensionRuntime
 * -----------------
 * Mounts one invisible (0x0, or optionally visible for ui.panel
 * extensions) WebView per running extension and is the host-side half
 * of the bridge: it receives postMessage requests, checks the calling
 * extension's granted permissions via isMethodAllowed BEFORE touching
 * any real app state, performs the operation using the SAME modules
 * every other part of the app uses (FileSystemRouter, the editor
 * stores), and posts back a response.
 *
 * This is the actual sandbox enforcement point. The WebView boundary
 * gives process isolation (an extension's JS cannot reach into React
 * Native's memory or call native modules directly, full stop — that's
 * WebView's own security model, not something CodeForge implements);
 * this file is what additionally scopes what a sandboxed extension is
 * ALLOWED to ask the host to do on its behalf, per the permissions it
 * declared and the user approved at install time.
 */
export default function ExtensionRuntime({ extension, visible = false, onPanelHtml }) {
  const webViewRef = useRef(null);
  const { manifest, grantedPermissions, sourceDir } = extension;
  const [mainSource, setMainSource] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const mainUri = `${SANDBOX_DIRS.extensions}/${sourceDir}/${manifest.main}`;
    SandboxFileSystem.readFile(mainUri)
      .then((source) => {
        if (!cancelled) setMainSource(source);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceDir, manifest.main]);

  // Register this instance's "invoke a command" function so the
  // Command Palette can trigger any command this extension registered
  // (see COMMANDS_REGISTER below) without holding a direct WebView ref.
  useEffect(() => {
    const invoke = (commandId) => {
      const script = `window.__codeforgeReceiveMessage(${JSON.stringify(
        serializeMessage({ id: `invoke_${Date.now()}`, type: 'event', method: 'commands.invoked', params: { commandId } })
      )}); true;`;
      webViewRef.current?.injectJavaScript(script);
    };
    useExtensionInvokeStore.getState().registerInvoker(manifest.id, invoke);
    return () => {
      useExtensionInvokeStore.getState().unregisterInvoker(manifest.id);
    };
  }, [manifest.id]);

  const handleRequest = useCallback(
    async (msg) => {
      const { id, method, params } = msg;

      if (!isMethodAllowed(method, grantedPermissions)) {
        return createErrorResponse(
          id,
          `Permission denied: "${method}" requires a permission this extension was not granted.`
        );
      }

      try {
        const result = await executeMethod(method, params, { manifest, sourceDir, onPanelHtml });
        return createResponse(id, result);
      } catch (err) {
        return createErrorResponse(id, err.message || String(err));
      }
    },
    [manifest, grantedPermissions, sourceDir, onPanelHtml]
  );

  const handleMessage = useCallback(
    async (event) => {
      const msg = parseMessage(event.nativeEvent.data);
      if (!msg || msg.type !== 'request') return; // ignore malformed or non-request messages, don't crash

      const response = await handleRequest(msg);
      const script = `window.__codeforgeReceiveMessage(${JSON.stringify(serializeMessage(response))}); true;`;
      webViewRef.current?.injectJavaScript(script);
    },
    [handleRequest]
  );

  if (loadError) {
    return null; // caller (ExtensionHost) surfaces load failures via Toast — see below
  }
  if (mainSource === null) {
    return null; // still loading main.js from sandbox storage
  }

  const html = buildExtensionHtml(manifest, mainSource);

  return (
    <View style={visible ? styles.visible : styles.hidden}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        originWhitelist={['about:*']}
        // No file:// or content:// access — extensions reach the
        // filesystem ONLY through the bridge's workspace.* methods,
        // never directly, which is what makes the permission check in
        // handleRequest above meaningful rather than bypassable.
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        onError={() => {
          Toast.show({ type: 'error', text1: `${manifest.displayName} crashed`, text2: 'The extension encountered an error and was stopped.' });
        }}
      />
    </View>
  );
}

/**
 * Implements each bridge method against real app state/modules. This is
 * the complete, enumerable set of things an extension can ever cause to
 * happen — anything not listed here is simply not possible for
 * extension code to do, regardless of what it asks for.
 */
async function executeMethod(method, params, ctx) {
  const workspace = useWorkspaceStore.getState().workspace;

  switch (method) {
    case BRIDGE_METHODS.WORKSPACE_LIST_FILES: {
      if (!workspace) throw new Error('No workspace open');
      const dirUri = params.dirPath ? await resolveWorkspacePath(workspace.uri, params.dirPath) : workspace.uri;
      const entries = await FS.listDirectory(dirUri);
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory, size: e.size }));
    }
    case BRIDGE_METHODS.WORKSPACE_READ_FILE: {
      if (!workspace) throw new Error('No workspace open');
      const uri = await resolveWorkspacePath(workspace.uri, params.path);
      return FS.readFile(uri);
    }
    case BRIDGE_METHODS.WORKSPACE_WRITE_FILE: {
      if (!workspace) throw new Error('No workspace open');
      const uri = await resolveWorkspacePath(workspace.uri, params.path);
      await FS.writeFile(uri, params.content);
      return { success: true };
    }
    case BRIDGE_METHODS.WORKSPACE_CREATE_FILE: {
      if (!workspace) throw new Error('No workspace open');
      const segments = params.path.split('/').filter(Boolean);
      const name = segments.pop();
      const parentUri = segments.length > 0 ? await resolveWorkspacePath(workspace.uri, segments.join('/')) : workspace.uri;
      const uri = await FS.createFile(parentUri, name);
      if (params.content) await FS.writeFile(uri, params.content);
      return { success: true };
    }
    case BRIDGE_METHODS.WORKSPACE_DELETE_FILE: {
      if (!workspace) throw new Error('No workspace open');
      const uri = await resolveWorkspacePath(workspace.uri, params.path);
      await FS.delete(uri);
      return { success: true };
    }

    case BRIDGE_METHODS.EDITOR_GET_ACTIVE_FILE: {
      const state = useEditorStore.getState();
      const pane = state.getActivePane();
      const tab = pane?.tabs.find((t) => t.id === pane.activeTabId);
      if (!tab) return null;
      return { name: tab.name, language: tab.language, content: tab.content, isDirty: tab.isDirty };
    }
    case BRIDGE_METHODS.EDITOR_GET_SELECTION: {
      const state = useEditorStore.getState();
      const pane = state.getActivePane();
      const tab = pane?.tabs.find((t) => t.id === pane.activeTabId);
      if (!tab) return null;
      return { cursor: tab.cursor, selections: tab.selections };
    }
    case BRIDGE_METHODS.EDITOR_INSERT_TEXT:
    case BRIDGE_METHODS.EDITOR_REPLACE_SELECTION: {
      const state = useEditorStore.getState();
      const pane = state.getActivePane();
      const tab = pane?.tabs.find((t) => t.id === pane.activeTabId);
      if (!tab || !pane) throw new Error('No active file to edit');
      // A minimal, correct implementation: insert/replace at the cursor
      // offset derived from tab.cursor's line/column against the
      // current content. Full selection-range replacement (as opposed
      // to cursor-position insertion) is a reasonable follow-up once an
      // extension actually needs multi-character selection replacement
      // beyond a single cursor point.
      const lines = tab.content.split('\n');
      let offset = 0;
      for (let i = 0; i < tab.cursor.line; i++) offset += lines[i].length + 1;
      offset += tab.cursor.column;
      const newContent = tab.content.slice(0, offset) + params.text + tab.content.slice(offset);
      state.updateTabContent(pane.id, tab.id, newContent);
      return { success: true };
    }

    case BRIDGE_METHODS.COMMANDS_REGISTER: {
      useExtensionStore.getState().registerCommand(ctx.manifest.id, { id: params.id, title: params.title });
      return { success: true };
    }
    case BRIDGE_METHODS.COMMANDS_EXECUTE: {
      // Extension-to-extension command execution is intentionally not
      // implemented in this delivery — the host only ever *invokes*
      // extension commands (via the Command Palette dispatching a
      // 'commands.invoked' event), it doesn't yet broker one extension
      // calling into another's registered command. Surfacing this as an
      // explicit error is more honest than a silent no-op.
      throw new Error('Calling another command from within an extension is not yet supported.');
    }

    case BRIDGE_METHODS.UI_SET_PANEL_HTML: {
      ctx.onPanelHtml?.(params.html);
      return { success: true };
    }
    case BRIDGE_METHODS.UI_SET_STATUSBAR_TEXT: {
      useExtensionStore.getState().setStatusBarText(ctx.manifest.id, params.text);
      return { success: true };
    }

    case BRIDGE_METHODS.NETWORK_FETCH: {
      const response = await fetch(params.url, params.options || {});
      const text = await response.text();
      return { status: response.status, ok: response.ok, body: text };
    }

    case BRIDGE_METHODS.STORAGE_GET: {
      const uri = `${SANDBOX_DIRS.extensions}/${ctx.manifest.id}/storage.json`;
      try {
        const raw = await SandboxFileSystem.readFile(uri);
        const data = JSON.parse(raw);
        return data[params.key] ?? null;
      } catch (err) {
        return null; // no storage file yet — treat as empty
      }
    }
    case BRIDGE_METHODS.STORAGE_SET: {
      const dirUri = `${SANDBOX_DIRS.extensions}/${ctx.manifest.id}`;
      const uri = `${dirUri}/storage.json`;
      let data = {};
      try {
        data = JSON.parse(await SandboxFileSystem.readFile(uri));
      } catch (err) {
        // first write for this extension — start with an empty object
      }
      data[params.key] = params.value;
      try {
        await SandboxFileSystem.writeFile(uri, JSON.stringify(data));
      } catch (err) {
        // directory may not exist yet on first write
        await SandboxFileSystem.createDirectory(SANDBOX_DIRS.extensions, ctx.manifest.id);
        await SandboxFileSystem.writeFile(uri, JSON.stringify(data));
      }
      return { success: true };
    }

    case BRIDGE_METHODS.LOG: {
      console.log(`[extension:${ctx.manifest.id}]`, ...(params.args || []));
      return { success: true };
    }
    case BRIDGE_METHODS.SHOW_TOAST: {
      Toast.show({ type: 'info', text1: ctx.manifest.displayName, text2: params.message });
      return { success: true };
    }

    default:
      throw new Error(`Unknown bridge method: ${method}`);
  }
}

/** Resolves an extension-provided relative path ("src/App.js") to a real SAF URI, same walk-by-name strategy used by the terminal and git bridge. */
async function resolveWorkspacePath(rootUri, relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  let currentUri = rootUri;
  for (const segment of segments) {
    const entries = await FS.listDirectory(currentUri);
    const match = entries.find((e) => e.name === segment);
    if (!match) throw new Error(`Path not found: ${relativePath}`);
    currentUri = match.uri;
  }
  return currentUri;
}

/** Wraps the extension's real main.js source (read from sandbox storage) with the injected SDK to produce the HTML the WebView loads. */
function buildExtensionHtml(manifest, mainSource) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>${INJECTED_SDK_SOURCE}</script>
<script>
  window.__extensionManifest = ${JSON.stringify(manifest)};
  try {
${mainSource}
  } catch (e) {
    window.codeforge.log('Extension crashed during init: ' + e.message);
  }
</script>
</body>
</html>`;
}

/**
 * The SDK source injected into every extension WebView. Kept as a
 * string constant here (rather than importing extensionSDK.js's module
 * export, which doesn't exist — that file is written as an IIFE
 * specifically to be valid as raw injected script) so ExtensionRuntime
 * has no build-step dependency on bundling a second JS file for the
 * WebView context.
 */
const INJECTED_SDK_SOURCE = `
(function () {
  var pendingRequests = {};
  var eventListeners = {};
  function generateId() { return 'ext_' + Date.now() + '_' + Math.random().toString(36).slice(2); }
  function sendRequest(method, params) {
    return new Promise(function (resolve, reject) {
      var id = generateId();
      pendingRequests[id] = { resolve: resolve, reject: reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, type: 'request', method: method, params: params }));
      setTimeout(function () {
        if (pendingRequests[id]) { delete pendingRequests[id]; reject(new Error('Request "' + method + '" timed out')); }
      }, 15000);
    });
  }
  window.__codeforgeReceiveMessage = function (raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.id || !msg.type) return;
    if (msg.type === 'response') {
      var pending = pendingRequests[msg.id];
      if (!pending) return;
      delete pendingRequests[msg.id];
      if (msg.error) pending.reject(new Error(msg.error)); else pending.resolve(msg.result);
    } else if (msg.type === 'event') {
      var listeners = eventListeners[msg.method];
      if (listeners) listeners.forEach(function (cb) { try { cb(msg.params); } catch (e) {} });
    }
  };
  function on(eventName, callback) {
    if (!eventListeners[eventName]) eventListeners[eventName] = [];
    eventListeners[eventName].push(callback);
    return function () {
      var arr = eventListeners[eventName];
      if (arr) { var idx = arr.indexOf(callback); if (idx !== -1) arr.splice(idx, 1); }
    };
  }
  window.codeforge = {
    workspace: {
      listFiles: function (dirPath) { return sendRequest('workspace.listFiles', { dirPath: dirPath }); },
      readFile: function (path) { return sendRequest('workspace.readFile', { path: path }); },
      writeFile: function (path, content) { return sendRequest('workspace.writeFile', { path: path, content: content }); },
      createFile: function (path, content) { return sendRequest('workspace.createFile', { path: path, content: content }); },
      deleteFile: function (path) { return sendRequest('workspace.deleteFile', { path: path }); }
    },
    editor: {
      getActiveFile: function () { return sendRequest('editor.getActiveFile', {}); },
      getSelection: function () { return sendRequest('editor.getSelection', {}); },
      insertText: function (text) { return sendRequest('editor.insertText', { text: text }); },
      replaceSelection: function (text) { return sendRequest('editor.replaceSelection', { text: text }); },
      onSelectionChanged: function (cb) { return on('editor.selectionChanged', cb); },
      onActiveFileChanged: function (cb) { return on('editor.activeFileChanged', cb); }
    },
    commands: {
      register: function (id, title, handler) {
        on('commands.invoked', function (payload) { if (payload.commandId === id) handler(); });
        return sendRequest('commands.register', { id: id, title: title });
      },
      execute: function (id) { return sendRequest('commands.execute', { id: id }); }
    },
    ui: {
      setPanelHtml: function (html) { return sendRequest('ui.setPanelHtml', { html: html }); },
      setStatusBarText: function (text) { return sendRequest('ui.setStatusBarText', { text: text }); }
    },
    network: { fetch: function (url, options) { return sendRequest('network.fetch', { url: url, options: options }); } },
    storage: {
      get: function (key) { return sendRequest('storage.get', { key: key }); },
      set: function (key, value) { return sendRequest('storage.set', { key: key, value: value }); }
    },
    log: function () { return sendRequest('host.log', { args: Array.prototype.slice.call(arguments).map(String) }); },
    showToast: function (message) { return sendRequest('host.showToast', { message: message }); },
    on: on
  };
  window.__codeforgeReady = true;
})();
`;

const styles = StyleSheet.create({
  hidden: { width: 0, height: 0, overflow: 'hidden' },
  visible: { flex: 1 },
});
