import { SAFFileSystem } from './SAFFileSystem';
import { SandboxFileSystem, SANDBOX_ROOT } from './SandboxFileSystem';

/**
 * FileSystemRouter — the ONE module the rest of the app should import for
 * file I/O. It picks SAFFileSystem or SandboxFileSystem based on the
 * URI's scheme, so Explorer/Editor/Git/Search/Preview code never needs
 * an if/else on where a file happens to live.
 *
 *   content://...   -> SAFFileSystem   (user project files, opened via SAF)
 *   file://.../files/... (app sandbox) -> SandboxFileSystem
 *
 * Usage: `import { FS } from '../filesystem/FileSystemRouter'` then
 * `FS.readFile(uri)`, `FS.writeFile(uri, content)`, etc. — same call
 * shape regardless of backend.
 */

function backendFor(uri) {
  if (typeof uri === 'string' && uri.startsWith('content://')) {
    return SAFFileSystem;
  }
  if (typeof uri === 'string' && uri.startsWith(SANDBOX_ROOT)) {
    return SandboxFileSystem;
  }
  // Default to sandbox for any other file:// uri (e.g. cache paths handed
  // back by other Expo modules); SAF is only ever content://.
  return SandboxFileSystem;
}

export const FS = {
  listDirectory: (uri) => backendFor(uri).listDirectory(uri),
  readFile: (uri) => backendFor(uri).readFile(uri),
  readFileBase64: (uri) =>
    backendFor(uri).readFileBase64
      ? backendFor(uri).readFileBase64(uri)
      : Promise.reject(new Error('readFileBase64 not supported for this backend')),
  writeFile: (uri, content) => backendFor(uri).writeFile(uri, content),
  createFile: (parentUri, name) => backendFor(parentUri).createFile(parentUri, name),
  createDirectory: (parentUri, name) => backendFor(parentUri).createDirectory(parentUri, name),
  rename: (uri, newName) => backendFor(uri).rename(uri, newName),
  move: (uri, newParentUri) => backendFor(uri).move(uri, newParentUri),
  copy: (uri, destParentUri, newName) => backendFor(uri).copy(uri, destParentUri, newName),
  delete: (uri) => backendFor(uri).delete(uri),
  stat: (uri) => backendFor(uri).stat(uri),
  exists: (uri) => backendFor(uri).exists(uri),
};

export { SANDBOX_ROOT };
export default FS;
