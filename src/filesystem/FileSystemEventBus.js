/**
 * FileSystemEventBus
 * -------------------
 * A minimal pub/sub bus that lets any part of the app react to file
 * mutations (create/rename/move/copy/delete/write) performed by any other
 * part, without polling the filesystem or prop-drilling callbacks.
 *
 * Example: the Git status view subscribes to 'file:write' so it can
 * re-diff a file the instant the editor saves it, without either module
 * knowing about the other directly.
 *
 * NOTE: This is the Part 1 scaffold — listener registration and the event
 * shape are final, but the emitting call-sites are wired up in Part 2
 * (src/filesystem/SAFFileSystem.js and SandboxFileSystem.js), since those
 * are the modules that actually perform I/O.
 */

const listeners = new Map(); // eventName -> Set<callback>

function on(eventName, callback) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(callback);
  return () => off(eventName, callback);
}

function off(eventName, callback) {
  listeners.get(eventName)?.delete(callback);
}

function emit(eventName, payload) {
  listeners.get(eventName)?.forEach((cb) => {
    try {
      cb(payload);
    } catch (err) {
      // A single bad listener should never break file I/O for the rest
      // of the app — log and continue.
      console.warn(`[FileSystemEventBus] listener for "${eventName}" threw:`, err);
    }
  });
}

function init() {
  // Reserved for future setup (e.g. reconciling a persisted mutation
  // queue on cold start). Intentionally a no-op for now.
}

function teardown() {
  listeners.clear();
}

export const FileSystemEventBus = { on, off, emit, init, teardown };

/**
 * Canonical event names, so call sites don't rely on magic strings.
 *   file:created   { uri, parentUri, isDirectory }
 *   file:written   { uri, content }
 *   file:renamed   { oldUri, newUri }
 *   file:moved     { oldUri, newUri, oldParentUri, newParentUri }
 *   file:copied    { sourceUri, newUri }
 *   file:deleted   { uri, parentUri }
 *   workspace:changed { workspace }
 */
export const FS_EVENTS = {
  CREATED: 'file:created',
  WRITTEN: 'file:written',
  RENAMED: 'file:renamed',
  MOVED: 'file:moved',
  COPIED: 'file:copied',
  DELETED: 'file:deleted',
  WORKSPACE_CHANGED: 'workspace:changed',
};
