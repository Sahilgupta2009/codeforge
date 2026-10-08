import { FS } from '../filesystem/FileSystemRouter';

/**
 * VirtualPathResolver
 * --------------------
 * SAF has no path concept — every directory/file is addressed by an
 * opaque content:// URI, and "listing a directory" is the only way to
 * discover a child's URI. A terminal, though, needs real path semantics
 * (`cd ..`, `cat ../foo.txt`, `ls src/components`). This module bridges
 * the two: it tracks the terminal's current working directory as BOTH a
 * display path (a plain string like "src/components", relative to the
 * workspace root) and the corresponding SAF URI, and resolves any
 * shell-style path argument against that pair by walking SAF directory
 * listings segment-by-segment.
 *
 * This is conceptually the same problem GitFileSystemBridge solves for
 * git (Part 6) — different consumer, same root cause (SAF is URI-based,
 * not path-based) — so the resolution strategy (walk-and-match by name)
 * is intentionally similar for consistency.
 */

/**
 * Resolves a shell-style path argument against a current-directory
 * context, returning the resolved SAF entry (or null if not found).
 *
 * @param {{ uri: string, displayPath: string }} cwd
 * @param {string} rootUri  the workspace root URI, needed to resolve absolute paths ("/foo")
 * @param {string} pathArg  e.g. ".", "..", "../sibling", "src/App.js", "/absolute/from/root"
 * @returns {Promise<{ uri: string, name: string, isDirectory: boolean, displayPath: string } | null>}
 */
export async function resolvePath(cwd, rootUri, pathArg) {
  if (!pathArg || pathArg === '.') {
    return { uri: cwd.uri, name: displayName(cwd.displayPath), isDirectory: true, displayPath: cwd.displayPath };
  }

  const isAbsolute = pathArg.startsWith('/');
  const segments = pathArg.split('/').filter((s) => s.length > 0 && s !== '.');

  let currentUri = isAbsolute ? rootUri : cwd.uri;
  let currentDisplayPath = isAbsolute ? '' : cwd.displayPath;
  let currentIsDirectory = true;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLastSegment = i === segments.length - 1;

    if (segment === '..') {
      if (currentDisplayPath === '') {
        // Already at root — ".." from root stays at root (matches shell behavior for cd .. at /).
        continue;
      }
      const parts = currentDisplayPath.split('/');
      parts.pop();
      currentDisplayPath = parts.join('/');
      currentUri = await resolveDisplayPathToUri(rootUri, currentDisplayPath);
      currentIsDirectory = true;
      continue;
    }

    if (!currentIsDirectory) {
      return null; // trying to descend into a file — invalid path
    }

    let entries;
    try {
      entries = await FS.listDirectory(currentUri);
    } catch (err) {
      return null;
    }

    const match = entries.find((e) => e.name === segment);
    if (!match) {
      return null;
    }

    currentUri = match.uri;
    currentDisplayPath = currentDisplayPath ? `${currentDisplayPath}/${segment}` : segment;
    currentIsDirectory = match.isDirectory;

    if (!isLastSegment && !match.isDirectory) {
      return null; // path continues past a file — invalid
    }
  }

  return {
    uri: currentUri,
    name: displayName(currentDisplayPath) || '/',
    isDirectory: currentIsDirectory,
    displayPath: currentDisplayPath,
  };
}

/** Re-resolves a display path (like "src/components") back to its URI by walking from root — used after a ".." pop invalidates the cached URI. */
async function resolveDisplayPathToUri(rootUri, displayPath) {
  if (!displayPath) return rootUri;
  const segments = displayPath.split('/').filter(Boolean);
  let currentUri = rootUri;
  for (const segment of segments) {
    const entries = await FS.listDirectory(currentUri);
    const match = entries.find((e) => e.name === segment && e.isDirectory);
    if (!match) return rootUri; // shouldn't happen if displayPath was validly constructed; fail safe to root
    currentUri = match.uri;
  }
  return currentUri;
}

function displayName(displayPath) {
  if (!displayPath) return '';
  const parts = displayPath.split('/');
  return parts[parts.length - 1];
}

/** Formats a display path as a prompt-friendly string, e.g. "" -> "~", "src/components" -> "~/src/components". */
export function formatPromptPath(displayPath) {
  return displayPath ? `~/${displayPath}` : '~';
}
