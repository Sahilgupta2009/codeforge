/**
 * Extension SDK (runs INSIDE the sandboxed WebView, not in the host app)
 * ------------------------------------------------------------------------
 * This file's source is injected as a string into the WebView via
 * react-native-webview's `injectedJavaScriptBeforeContentLoaded`, so it
 * runs before the extension's own main.js and defines the global
 * `codeforge` object extension authors write against. It is bundled as
 * a template string (see ExtensionRuntime.js's INJECTED_SDK_SOURCE)
 * rather than imported normally, since it needs to execute in the
 * WebView's separate JS context, not in the React Native host context —
 * this file exists in the host project's source tree for readability,
 * versioning, and the API docs (Part 8's ExtensionAPI.md references
 * this file directly), but the actual delivery mechanism is the string
 * template in ExtensionRuntime.js.
 *
 * Design: every `codeforge.xxx.yyy()` call serializes to a bridge
 * request (see bridgeProtocol.js, shared between both sides), posts it
 * to the host via `window.ReactNativeWebView.postMessage`, and returns a
 * Promise that resolves when the matching response arrives via the
 * WebView's `message` event. This makes extension code read like normal
 * async JS (`const content = await codeforge.workspace.readFile(path)`)
 * despite the underlying transport being one-way fire-and-forget
 * messages in each direction.
 */

(function () {
  const pendingRequests = new Map(); // id -> {resolve, reject}
  const eventListeners = new Map(); // eventName -> Set<callback>

  function generateId() {
    return 'ext_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = generateId();
      pendingRequests.set(id, { resolve, reject });
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ id, type: 'request', method, params })
      );
      // Guard against a host-side bug or crash leaving a promise pending
      // forever, which would silently hang extension code awaiting it.
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request "' + method + '" timed out'));
        }
      }, 15000);
    });
  }

  // The host dispatches incoming messages by calling this function
  // directly via injectJavaScript (see ExtensionRuntime.js's onMessage
  // handler) — this keeps the SDK's own listener registration decoupled
  // from exactly how react-native-webview surfaces messages, since that
  // has varied across RN WebView versions.
  window.__codeforgeReceiveMessage = function (raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object' || !msg.id || !msg.type) return;

    if (msg.type === 'response') {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
    } else if (msg.type === 'event') {
      const listeners = eventListeners.get(msg.method);
      if (listeners) {
        listeners.forEach((cb) => {
          try {
            cb(msg.params);
          } catch (e) {
            console.error('[extension] event listener error:', e);
          }
        });
      }
    }
  };

  function on(eventName, callback) {
    if (!eventListeners.has(eventName)) eventListeners.set(eventName, new Set());
    eventListeners.get(eventName).add(callback);
    return function () {
      const set = eventListeners.get(eventName);
      if (set) set.delete(callback);
    };
  }

  // The public API surface. Every method here maps 1:1 to a
  // BRIDGE_METHODS entry in bridgeProtocol.js — see ExtensionAPI.md for
  // full parameter/return documentation of each.
  window.codeforge = {
    workspace: {
      listFiles: function (dirPath) { return sendRequest('workspace.listFiles', { dirPath: dirPath }); },
      readFile: function (path) { return sendRequest('workspace.readFile', { path: path }); },
      writeFile: function (path, content) { return sendRequest('workspace.writeFile', { path: path, content: content }); },
      createFile: function (path, content) { return sendRequest('workspace.createFile', { path: path, content: content }); },
      deleteFile: function (path) { return sendRequest('workspace.deleteFile', { path: path }); },
    },
    editor: {
      getActiveFile: function () { return sendRequest('editor.getActiveFile', {}); },
      getSelection: function () { return sendRequest('editor.getSelection', {}); },
      insertText: function (text) { return sendRequest('editor.insertText', { text: text }); },
      replaceSelection: function (text) { return sendRequest('editor.replaceSelection', { text: text }); },
      onSelectionChanged: function (callback) { return on('editor.selectionChanged', callback); },
      onActiveFileChanged: function (callback) { return on('editor.activeFileChanged', callback); },
    },
    commands: {
      register: function (id, title, handler) {
        // The handler itself can't cross the bridge (functions aren't
        // serializable), so registration tells the host "this command
        // exists" and the host emits a 'commands.invoked' event back
        // into this same WebView when the user runs it, which we
        // dispatch to the locally-kept handler.
        on('commands.invoked', function (payload) {
          if (payload.commandId === id) handler();
        });
        return sendRequest('commands.register', { id: id, title: title });
      },
      execute: function (id) { return sendRequest('commands.execute', { id: id }); },
    },
    ui: {
      setPanelHtml: function (html) { return sendRequest('ui.setPanelHtml', { html: html }); },
      setStatusBarText: function (text) { return sendRequest('ui.setStatusBarText', { text: text }); },
    },
    network: {
      fetch: function (url, options) { return sendRequest('network.fetch', { url: url, options: options }); },
    },
    storage: {
      get: function (key) { return sendRequest('storage.get', { key: key }); },
      set: function (key, value) { return sendRequest('storage.set', { key: key, value: value }); },
    },
    log: function () {
      const args = Array.prototype.slice.call(arguments).map(String);
      return sendRequest('host.log', { args: args });
    },
    showToast: function (message) { return sendRequest('host.showToast', { message: message }); },
    on: on,
  };

  window.__codeforgeReady = true;
})();
