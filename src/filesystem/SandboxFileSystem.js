import * as FileSystem from 'expo-file-system';
import { FileSystemError, FS_ERROR_CODES } from './FileSystemProvider';
import { FileSystemEventBus, FS_EVENTS } from './FileSystemEventBus';

/**
 * SandboxFileSystem — backend for the app's own private storage
 * (FileSystem.documentDirectory), used for data CodeForge owns itself:
 * extension data/settings, AI conversation logs, cached config. It is
 * NOT used for user project files — those always go through SAF so they
 * live wherever the user actually keeps them on-device.
 *
 * URIs in this backend are plain `file://` paths under documentDirectory,
 * so unlike SAF this backend can do normal path manipulation.
 */

const ROOT = FileSystem.documentDirectory; // e.g. file:///data/user/0/dev.codeforge.editor/files/

function wrapError(err, fallbackMessage) {
  if (err instanceof FileSystemError) return err;
  const message = err?.message || fallbackMessage || 'Sandbox file system operation failed';
  let code = FS_ERROR_CODES.UNKNOWN;
  const lower = message.toLowerCase();
  if (lower.includes('not exist') || lower.includes('not found')) code = FS_ERROR_CODES.NOT_FOUND;
  else if (lower.includes('already exists')) code = FS_ERROR_CODES.ALREADY_EXISTS;
  return new FileSystemError(message, code, err);
}

function joinPath(dirUri, name) {
  const base = dirUri.endsWith('/') ? dirUri : `${dirUri}/`;
  return `${base}${name}`;
}

function nameFromUri(uri) {
  const trimmed = uri.endsWith('/') ? uri.slice(0, -1) : uri;
  return trimmed.split('/').pop();
}

async function listDirectory(dirUri) {
  try {
    const names = await FileSystem.readDirectoryAsync(dirUri);
    const entries = await Promise.all(
      names.map(async (name) => {
        const uri = joinPath(dirUri, name);
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        return {
          uri,
          name,
          isDirectory: info.isDirectory,
          size: info.isDirectory ? null : info.size ?? null,
          modifiedAt: info.modificationTime ? info.modificationTime * 1000 : null,
        };
      })
    );
    return entries;
  } catch (err) {
    throw wrapError(err, `Failed to list sandbox directory: ${dirUri}`);
  }
}

async function readFile(fileUri) {
  try {
    return await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (err) {
    throw wrapError(err, `Failed to read sandbox file: ${fileUri}`);
  }
}

async function writeFile(fileUri, content) {
  try {
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    FileSystemEventBus.emit(FS_EVENTS.WRITTEN, { uri: fileUri, content });
  } catch (err) {
    throw wrapError(err, `Failed to write sandbox file: ${fileUri}`);
  }
}

async function createFile(parentUri, name) {
  const uri = joinPath(parentUri, name);
  try {
    await FileSystem.writeAsStringAsync(uri, '', { encoding: FileSystem.EncodingType.UTF8 });
    FileSystemEventBus.emit(FS_EVENTS.CREATED, { uri, parentUri, isDirectory: false });
    return uri;
  } catch (err) {
    throw wrapError(err, `Failed to create sandbox file: ${name}`);
  }
}

async function createDirectory(parentUri, name) {
  const uri = joinPath(parentUri, name);
  try {
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    FileSystemEventBus.emit(FS_EVENTS.CREATED, { uri, parentUri, isDirectory: true });
    return uri;
  } catch (err) {
    throw wrapError(err, `Failed to create sandbox folder: ${name}`);
  }
}

async function rename(uri, newName) {
  const parentUri = uri.slice(0, uri.length - nameFromUri(uri).length);
  const newUri = joinPath(parentUri, newName);
  try {
    await FileSystem.moveAsync({ from: uri, to: newUri });
    FileSystemEventBus.emit(FS_EVENTS.RENAMED, { oldUri: uri, newUri });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to rename sandbox item to: ${newName}`);
  }
}

async function move(uri, newParentUri) {
  const name = nameFromUri(uri);
  const newUri = joinPath(newParentUri, name);
  const oldParentUri = uri.slice(0, uri.length - name.length);
  try {
    await FileSystem.moveAsync({ from: uri, to: newUri });
    FileSystemEventBus.emit(FS_EVENTS.MOVED, { oldUri: uri, newUri, oldParentUri, newParentUri });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to move sandbox item: ${name}`);
  }
}

async function copy(uri, destParentUri, newName) {
  const name = newName || nameFromUri(uri);
  const newUri = joinPath(destParentUri, name);
  try {
    await FileSystem.copyAsync({ from: uri, to: newUri });
    FileSystemEventBus.emit(FS_EVENTS.COPIED, { sourceUri: uri, newUri });
    return newUri;
  } catch (err) {
    throw wrapError(err, `Failed to copy sandbox item: ${name}`);
  }
}

async function deleteEntry(uri) {
  const name = nameFromUri(uri);
  const parentUri = uri.slice(0, uri.length - name.length);
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    FileSystemEventBus.emit(FS_EVENTS.DELETED, { uri, parentUri });
  } catch (err) {
    throw wrapError(err, `Failed to delete sandbox item`);
  }
}

async function stat(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (!info.exists) throw new FileSystemError('Item does not exist', FS_ERROR_CODES.NOT_FOUND);
    return {
      size: info.isDirectory ? null : info.size ?? null,
      modifiedAt: info.modificationTime ? info.modificationTime * 1000 : null,
      isDirectory: info.isDirectory,
    };
  } catch (err) {
    throw wrapError(err, `Failed to stat sandbox item: ${uri}`);
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

/** Ensures the standard sandbox subdirectories exist (called at app boot). */
async function ensureSandboxDirs() {
  const dirs = ['extensions', 'ai-logs', 'config', 'cache'];
  for (const dir of dirs) {
    const uri = joinPath(ROOT, dir);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    }
  }
}

export const SANDBOX_ROOT = ROOT;
export const SANDBOX_DIRS = {
  extensions: joinPath(ROOT, 'extensions'),
  aiLogs: joinPath(ROOT, 'ai-logs'),
  config: joinPath(ROOT, 'config'),
  cache: joinPath(ROOT, 'cache'),
};

export const SandboxFileSystem = {
  listDirectory,
  readFile,
  writeFile,
  createFile,
  createDirectory,
  rename,
  move,
  copy,
  delete: deleteEntry,
  stat,
  exists,
  ensureSandboxDirs,
};
