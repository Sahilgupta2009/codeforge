/**
 * FileSystemProvider — the interface every concrete file system backend
 * implements. Nothing outside src/filesystem should import SAFFileSystem
 * or SandboxFileSystem directly except FileSystemRouter, which picks the
 * right backend per-URI. This is what keeps the Explorer, Editor, Git,
 * and Search modules ignorant of *how* a file is actually stored.
 *
 * This file has no runtime logic — it's a documented contract (this is a
 * plain-JS project, so we use JSDoc typedefs instead of TS interfaces).
 *
 * @typedef {Object} FSEntry
 * @property {string} uri
 * @property {string} name
 * @property {boolean} isDirectory
 * @property {number|null} size        bytes, null for directories
 * @property {number|null} modifiedAt  unix ms, null if unavailable
 *
 * @typedef {Object} FileSystemProvider
 * @property {(dirUri: string) => Promise<FSEntry[]>} listDirectory
 * @property {(fileUri: string) => Promise<string>} readFile
 * @property {(fileUri: string, content: string) => Promise<void>} writeFile
 * @property {(parentUri: string, name: string) => Promise<string>} createFile
 *           Returns the new file's URI.
 * @property {(parentUri: string, name: string) => Promise<string>} createDirectory
 *           Returns the new directory's URI.
 * @property {(uri: string, newName: string) => Promise<string>} rename
 *           Returns the renamed entry's new URI (SAF URIs change on rename).
 * @property {(uri: string, newParentUri: string) => Promise<string>} move
 *           Returns the moved entry's new URI.
 * @property {(uri: string, destParentUri: string, newName?: string) => Promise<string>} copy
 *           Returns the copy's new URI.
 * @property {(uri: string) => Promise<void>} delete
 * @property {(uri: string) => Promise<{size:number|null, modifiedAt:number|null, isDirectory:boolean}>} stat
 * @property {(uri: string) => Promise<boolean>} exists
 */

export const FS_ERROR_CODES = {
  NOT_FOUND: 'ENOENT',
  PERMISSION_DENIED: 'EPERM',
  ALREADY_EXISTS: 'EEXIST',
  NOT_A_DIRECTORY: 'ENOTDIR',
  IS_A_DIRECTORY: 'EISDIR',
  UNKNOWN: 'EUNKNOWN',
};

export class FileSystemError extends Error {
  constructor(message, code = FS_ERROR_CODES.UNKNOWN, cause) {
    super(message);
    this.name = 'FileSystemError';
    this.code = code;
    this.cause = cause;
  }
}
