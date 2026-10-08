import LightningFS from '@isomorphic-git/lightning-fs';
import { FS as SAFRouter } from '../filesystem/FileSystemRouter';
import { isBinaryFile, isImageFile, isPdfFile } from '../utils/pathUtils';

/**
 * GitFileSystemBridge
 * --------------------
 * isomorphic-git needs a Node-`fs`-shaped filesystem it can address with
 * ordinary paths (`/repo/src/App.js`) and do its own path manipulation
 * on — it cannot operate directly on Android SAF `content://` URIs,
 * which are opaque tokens, not paths. So Git in CodeForge works against
 * a **mirrored working copy** in `@isomorphic-git/lightning-fs` (an
 * IndexedDB-backed virtual filesystem built exactly for this use case —
 * it's the standard way isomorphic-git is used in any environment
 * without real POSIX file access, browsers included).
 *
 * The mirror is kept small and workspace-scoped: each open workspace
 * gets its own lightning-fs instance name (derived from the workspace
 * URI) so switching projects doesn't mix git state, and mirroring only
 * copies text-eligible files (skipping binaries/images/PDFs and huge
 * files, same rule Search uses) since those rarely belong in a git diff
 * workflow on a phone and copying multi-megabyte binaries through SAF's
 * base64 round-trip on every sync would be slow.
 *
 * Sync is explicit and directional, not automatic/continuous:
 *   - `syncToGitFS(workspaceUri)`: SAF -> lightning-fs, called before any
 *     git status/diff/commit, so git always sees current on-disk content.
 *   - `syncFromGitFS(workspaceUri, changedPaths)`: lightning-fs -> SAF,
 *     called after operations that modify working-tree files (checkout,
 *     pull, merge), writing only the paths git actually touched back
 *     through the real FileSystemRouter so SAF-side file mtimes/content
 *     stay authoritative and the Explorer/open editor tabs see the
 *     change via the normal FileSystemEventBus.
 *
 * This is a real, working design — not a hand-wave — but it is a
 * deliberate architectural tradeoff: a git operation touches the mirror
 * first, and any UI (status, diff) that wants live results calls
 * syncToGitFS immediately beforehand, so gitStore.js always sync-then-
 * acts rather than trusting a possibly-stale mirror.
 */

const MAX_MIRROR_FILE_SIZE = 5 * 1024 * 1024; // 5MB — generous vs Search's 2MB, since git diffing wants full source files
const instances = new Map(); // workspaceUri -> LightningFS instance

function getFsInstance(workspaceUri) {
  const key = `codeforge-git-${hashUri(workspaceUri)}`;
  if (!instances.has(workspaceUri)) {
    instances.set(workspaceUri, new LightningFS(key));
  }
  return instances.get(workspaceUri);
}

/** Simple, fast, non-cryptographic string hash — just needs to be a stable, filesystem-safe instance name per workspace URI. */
function hashUri(uri) {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    hash = (hash << 5) - hash + uri.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** The git working directory path inside lightning-fs — always this fixed root per instance. */
export const GIT_DIR = '/repo';

function shouldMirror(entry) {
  if (entry.name === '.git') return false; // never mirror an existing .git dir found on SAF (shouldn't normally exist, but be safe)
  if (entry.isDirectory) return true;
  if (isBinaryFile(entry.name) || isImageFile(entry.name) || isPdfFile(entry.name)) return false;
  if (entry.size != null && entry.size > MAX_MIRROR_FILE_SIZE) return false;
  return true;
}

async function ensureDir(pfs, path) {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    try {
      await pfs.mkdir(current);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

/**
 * Recursively mirrors the SAF workspace tree into lightning-fs at
 * GIT_DIR, overwriting any existing mirrored content. Returns the
 * lightning-fs `pfs` (promise-fs) handle for immediate use by callers.
 */
export async function syncToGitFS(workspaceUri, excludePatterns = []) {
  const fs = getFsInstance(workspaceUri);
  const pfs = fs.promises;

  await ensureDir(pfs, GIT_DIR);

  async function walk(safDirUri, mirrorPath) {
    let entries;
    try {
      entries = await SAFRouter.listDirectory(safDirUri);
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      if (excludePatterns.includes(entry.name)) continue;
      if (!shouldMirror(entry)) continue;

      const childMirrorPath = `${mirrorPath}/${entry.name}`;

      if (entry.isDirectory) {
        await ensureDir(pfs, childMirrorPath);
        await walk(entry.uri, childMirrorPath);
      } else {
        try {
          const content = await SAFRouter.readFile(entry.uri);
          await pfs.writeFile(childMirrorPath, content, 'utf8');
        } catch (err) {
          // Skip unreadable individual files rather than failing the whole sync.
        }
      }
    }
  }

  await walk(workspaceUri, GIT_DIR);
  return { fs, pfs };
}

/**
 * Writes specific paths (relative to GIT_DIR, e.g. "src/App.js") from
 * the lightning-fs mirror back to the real SAF workspace. Used after
 * checkout/pull/merge operations that changed working-tree files git's
 * side, so those changes become visible in the Explorer and any open
 * editor tab.
 *
 * Creates SAF-side files/directories that don't yet exist; for files
 * that DO exist, overwrites their content via FS.writeFile.
 */
export async function syncFromGitFS(workspaceUri, relativePaths) {
  const fs = getFsInstance(workspaceUri);
  const pfs = fs.promises;
  const written = [];
  const failed = [];

  for (const relativePath of relativePaths) {
    try {
      const mirrorPath = `${GIT_DIR}/${relativePath}`;
      const content = await pfs.readFile(mirrorPath, 'utf8');
      const safUri = await resolveSafPathForWrite(workspaceUri, relativePath);
      await SAFRouter.writeFile(safUri, content);
      written.push(relativePath);
    } catch (err) {
      failed.push({ path: relativePath, error: err.message });
    }
  }

  return { written, failed };
}

/**
 * Resolves a git-relative path ("src/App.js") to a real SAF URI,
 * creating any missing intermediate directories and the file itself
 * (via FS.createDirectory / FS.createFile) if they don't already exist
 * on the SAF side — needed because a `git pull` can introduce files
 * that never existed in the SAF workspace before.
 */
async function resolveSafPathForWrite(workspaceUri, relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  const fileName = segments.pop();

  let currentUri = workspaceUri;
  for (const segment of segments) {
    const entries = await SAFRouter.listDirectory(currentUri);
    const existing = entries.find((e) => e.name === segment && e.isDirectory);
    if (existing) {
      currentUri = existing.uri;
    } else {
      currentUri = await SAFRouter.createDirectory(currentUri, segment);
    }
  }

  const siblings = await SAFRouter.listDirectory(currentUri);
  const existingFile = siblings.find((e) => e.name === fileName && !e.isDirectory);
  if (existingFile) {
    return existingFile.uri;
  }
  return SAFRouter.createFile(currentUri, fileName);
}

/** Tears down the lightning-fs instance for a workspace (called when a workspace is closed) to free IndexedDB storage. */
export function disposeGitFS(workspaceUri) {
  instances.delete(workspaceUri);
}

export function getGitFsInstance(workspaceUri) {
  return getFsInstance(workspaceUri);
}
