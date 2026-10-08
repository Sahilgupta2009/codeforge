import * as FileSystem from 'expo-file-system';
import { FileSystemError, FS_ERROR_CODES } from './FileSystemProvider';
import { FileSystemEventBus, FS_EVENTS } from './FileSystemEventBus';

const SAF = FileSystem.StorageAccessFramework;

/**
 * SAFFileSystem — the FileSystemProvider backend for real project folders
 * opened anywhere on the device via Android's Storage Access Framework.
 *
 * All methods emit FileSystemEventBus events on successful mutation so
 * the Explorer tree, open editor tabs, and Git status view can react
 * without polling. Every method wraps SAF's native errors into
 * FileSystemError with a normalized code, so calling code (dialogs,
 * toasts) can branch on `.code` instead of parsing native error strings.
 */

function wrapError(err, fallbackMessage) {
  if (err instanceof FileSystemError) return err;
  const message = err?.message || fallbackMessage || 'File system operation failed';
  let code = FS_ERROR_CODES.UNKNOWN;
  const lower = message.toLowerCase();
  if (lower.includes('not exist') || lower.includes('not found')) code = FS_ERROR_CODES.NOT_FOUND;
  else if (lower.includes('permission') || lower.includes('denied')) code = FS_ERROR_CODES.PERMISSION_DENIED;
  else if (lower.includes('already exists')) code = FS_ERROR_CODES.ALREADY_EXISTS;
  return new FileSystemError(message, code, err);
}

/**
 * Extracts a human-readable display name from a SAF content:// URI as a
 * last-resort fallback when we don't already have the name from a prior
 * listDirectory call. SAF encodes the document id in the URI path; we
 * decode and take the final segment after the last '/' or ':'.
 */
function guessNameFromUri(uri) {
  try {
    const decoded = decodeURIComponent(uri);
    const afterColon = decoded.split(':').pop() || decoded;
    const segments = afterColon.split('/');
    return segments[segments.length - 1] || decoded;
  } catch {
    return uri;
  }
}

async function listDirectory(dirUri) {
  try {
    const childUris = await SAF.readDirectoryAsync(dirUri);

    // SAF's readDirectoryAsync only returns URIs, not metadata, so we
    // need a stat call per child to know name/isDirectory/size. This is
    // the main cost for large directories — the Explorer mitigates it
    // with per-directory caching (only re-stats on expand, not on every
    // render) and the virtualized tree only mounts visible rows.
    const entries = await Promise.all(
      childUris.map(async (childUri) => {
        try {
          const info = await FileSystem.getInfoAsync(childUri, { size: true });
          const name = guessNameFromUri(childUri);
          return {
            uri: childUri,
            name,
            isDirectory: info.isDirectory,
            size: info.isDirectory ? null : info.size ?? null,
            modifiedAt: info.modificationTime ? info.modificationTime * 1000 : null,
          };
        } catch (statErr) {
          // A single unreadable child (broken symlink, permission quirk)
          // shouldn't fail the whole directory listing.
          return {
            uri: childUri,
            name: guessNameFromUri(childUri),
            isDirectory: false,
            size: null,
            modifiedAt: null,
            unreadable: true,
          };
        }
      })
    );

    return entries;
  } catch (err) {
    throw wrapError(err, `Failed to list directory: ${dirUri}`);
  }
}

async function readFile(fileUri) {
  try {
    return await SAF.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (err) {
    throw wrapError(err, `Failed to read file: ${fileUri}`);
  }
}

/**
 * Reads a file as base64 — used by the image/PDF preview panels rather
 * than readFile, since text encoding would corrupt binary content.
 */
async function readFileBase64(fileUri) {
  try {
    return await SAF.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  } catch (err) {
    throw wrapError(err, `Failed to read file as base64: ${fileUri}`);
  }
}

async function writeFile(fileUri, content) {
  try {
    await SAF.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    FileSystemEventBus.emit(FS_EVENTS.WRITTEN, { uri: fileUri, content });
  } catch (err) {
    throw wrapError(err, `Failed to write file: ${fileUri}`);
  }
}

async function createFile(parentUri, name) {
  try {
    const mimeType = guessMimeType(name);
    const newUri = await SAF.createFileAsync(parentUri, name, mimeType);
    FileSystemEventBus.emit(FS_EVENTS.CREATED, { uri: newUri, parentUri, isDirectory: false });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to create file: ${name}`);
  }
}

async function createDirectory(parentUri, name) {
  try {
    const newUri = await SAF.makeDirectoryAsync(parentUri, name);
    FileSystemEventBus.emit(FS_EVENTS.CREATED, { uri: newUri, parentUri, isDirectory: true });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to create folder: ${name}`);
  }
}

/**
 * SAF has no native rename exposed by expo-file-system for all providers,
 * so rename is implemented as copy-to-new-name + delete-original. This is
 * functionally a rename from the user's perspective (single dialog,
 * atomic-looking result) even though it's two operations under the hood;
 * on failure of the delete step we surface a specific warning rather than
 * silently leaving a duplicate.
 */
async function rename(uri, newName) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new FileSystemError('Item no longer exists', FS_ERROR_CODES.NOT_FOUND);
  }

  const parentUri = await getParentUri(uri);

  try {
    let newUri;
    if (info.isDirectory) {
      newUri = await copyDirectoryRecursive(uri, parentUri, newName);
    } else {
      newUri = await copyFileToNewName(uri, parentUri, newName);
    }

    try {
      await SAF.deleteAsync(uri);
    } catch (deleteErr) {
      throw new FileSystemError(
        `Renamed successfully but could not remove the original item. You may have a duplicate named "${newName}".`,
        FS_ERROR_CODES.UNKNOWN,
        deleteErr
      );
    }

    FileSystemEventBus.emit(FS_EVENTS.RENAMED, { oldUri: uri, newUri });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to rename to: ${newName}`);
  }
}

async function move(uri, newParentUri) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new FileSystemError('Item no longer exists', FS_ERROR_CODES.NOT_FOUND);
  }
  const oldParentUri = await getParentUri(uri);
  const name = guessNameFromUri(uri);

  try {
    let newUri;
    if (info.isDirectory) {
      newUri = await copyDirectoryRecursive(uri, newParentUri, name);
    } else {
      newUri = await copyFileToNewName(uri, newParentUri, name);
    }
    await SAF.deleteAsync(uri);
    FileSystemEventBus.emit(FS_EVENTS.MOVED, { oldUri: uri, newUri, oldParentUri, newParentUri });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to move: ${name}`);
  }
}

async function copy(uri, destParentUri, newName) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new FileSystemError('Item no longer exists', FS_ERROR_CODES.NOT_FOUND);
  }
  const name = newName || guessNameFromUri(uri);

  try {
    let newUri;
    if (info.isDirectory) {
      newUri = await copyDirectoryRecursive(uri, destParentUri, name);
    } else {
      newUri = await copyFileToNewName(uri, destParentUri, name);
    }
    FileSystemEventBus.emit(FS_EVENTS.COPIED, { sourceUri: uri, newUri });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to copy: ${name}`);
  }
}

async function deleteEntry(uri) {
  try {
    const parentUri = await getParentUri(uri);
    await SAF.deleteAsync(uri);
    FileSystemEventBus.emit(FS_EVENTS.DELETED, { uri, parentUri });
  } catch (err) {
    throw wrapError(err, `Failed to delete item`);
  }
}

async function stat(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (!info.exists) {
      throw new FileSystemError('Item does not exist', FS_ERROR_CODES.NOT_FOUND);
    }
    return {
      size: info.isDirectory ? null : info.size ?? null,
      modifiedAt: info.modificationTime ? info.modificationTime * 1000 : null,
      isDirectory: info.isDirectory,
    };
  } catch (err) {
    throw wrapError(err, `Failed to stat: ${uri}`);
  }
}

async function exists(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

// --- Internal helpers ---

/**
 * SAF tree/document URIs don't have a generic "get parent" API — the
 * parent has to be tracked by the caller (Explorer always knows the
 * parent directory it listed a child from). This helper is a best-effort
 * fallback for call sites (like rename/delete) that only have the child
 * URI: it derives the parent by re-deriving the tree root and walking
 * the document id path. Where the Explorer already knows the parent uri
 * directly (the common case), it passes it explicitly instead of relying
 * on this — see FileExplorer.js's context menu handlers.
 */
async function getParentUri(uri) {
  try {
    // expo-file-system SAF document URIs are of the form:
    //   content://.../tree/<tree-id>/document/<doc-id>
    // The doc-id typically mirrors a path like "primary:Project/src/App.js".
    // We strip the last path segment from the doc-id and re-encode.
    const match = uri.match(/^(.*\/document\/)([^/]+)$/);
    if (!match) return uri; // Fall back to self; callers should prefer explicit parents.
    const [, prefix, docIdEncoded] = match;
    const docId = decodeURIComponent(docIdEncoded);
    const lastSlash = docId.lastIndexOf('/');
    if (lastSlash === -1) return uri;
    const parentDocId = docId.slice(0, lastSlash);
    return `${prefix}${encodeURIComponent(parentDocId)}`;
  } catch {
    return uri;
  }
}

function guessMimeType(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'text/javascript', jsx: 'text/javascript', ts: 'text/typescript', tsx: 'text/typescript',
    py: 'text/x-python', html: 'text/html', htm: 'text/html', css: 'text/css',
    json: 'application/json', c: 'text/x-c', h: 'text/x-c', cpp: 'text/x-c++', java: 'text/x-java',
    dart: 'text/x-dart', md: 'text/markdown', txt: 'text/plain', xml: 'text/xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', pdf: 'application/pdf',
  };
  return map[ext] || 'text/plain';
}

async function copyFileToNewName(sourceUri, destParentUri, newName) {
  const mimeType = guessMimeType(newName);
  const newUri = await SAF.createFileAsync(destParentUri, newName, mimeType);
  const content = await SAF.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
  await SAF.writeAsStringAsync(newUri, content, { encoding: FileSystem.EncodingType.Base64 });
  return newUri;
}

async function copyDirectoryRecursive(sourceUri, destParentUri, newName) {
  const newDirUri = await SAF.makeDirectoryAsync(destParentUri, newName);
  const children = await SAF.readDirectoryAsync(sourceUri);

  for (const childUri of children) {
    const info = await FileSystem.getInfoAsync(childUri);
    const childName = guessNameFromUri(childUri);
    if (info.isDirectory) {
      await copyDirectoryRecursive(childUri, newDirUri, childName);
    } else {
      await copyFileToNewName(childUri, newDirUri, childName);
    }
  }

  return newDirUri;
}

export const SAFFileSystem = {
  listDirectory,
  readFile,
  readFileBase64,
  writeFile,
  createFile,
  createDirectory,
  rename,
  move,
  copy,
  delete: deleteEntry,
  stat,
  exists,
  getParentUri,
};
