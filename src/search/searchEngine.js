/**
 * Global project search engine.
 *
 * Design constraints this module works under:
 *   - Projects can have thousands of files (see ARCHITECTURE.md's
 *     performance strategy), so search must never build a full in-memory
 *     file tree before starting — it walks and searches incrementally,
 *     directory by directory, yielding matches as they're found via a
 *     callback rather than returning one giant array at the end.
 *   - It must be cancelable — if the user edits the query while a search
 *     is in flight, the in-flight search's remaining work should stop
 *     rather than race the new one and produce stale results.
 *   - It has to work against the SAF-backed FileSystemRouter from Part 2
 *     (async directory listing + async file reads), not a synchronous
 *     Node `fs` API, so this is async-generator-shaped throughout.
 *
 * This module contains NO React/UI code — see useSearchStore.js and
 * GlobalSearchPanel.js for how the UI drives this.
 */

import { FS } from '../filesystem/FileSystemRouter';
import { isBinaryFile, isImageFile, isPdfFile } from '../utils/pathUtils';

const MAX_FILE_SIZE_TO_SEARCH = 2 * 1024 * 1024; // 2MB — matches the editor's "large file" threshold
const MAX_RESULTS_PER_FILE = 200; // guards against pathological single-file match explosions
const MAX_TOTAL_RESULTS = 5000; // guards against pathological project-wide match explosions

/**
 * Builds a RegExp from search options, matching the same semantics as
 * FindReplacePanel.js's in-file search (Part 3) so behavior is
 * consistent between "search this file" and "search this project".
 */
export function buildSearchRegex({ query, useRegex, caseSensitive, wholeWord }) {
  if (!query) return null;
  let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) pattern = `\\b${pattern}\\b`;
  const flags = caseSensitive ? 'g' : 'gi';
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    return null; // invalid regex — caller surfaces this as a user-facing error
  }
}

/**
 * Finds all matches of `regex` within a single file's content, returning
 * line-oriented match records suitable for display (line number, column,
 * the full line text for context, and the exact matched substring).
 */
export function searchFileContent(content, regex) {
  if (!regex) return [];
  const results = [];
  const lines = content.split('\n');
  let lineStartOffset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    regex.lastIndex = 0;
    let match;
    let iterations = 0;
    while ((match = regex.exec(line)) !== null && iterations < MAX_RESULTS_PER_FILE) {
      results.push({
        line: lineIndex,
        column: match.index,
        matchLength: match[0].length,
        lineText: line,
        matchText: match[0],
        fileOffset: lineStartOffset + match.index,
      });
      if (match[0].length === 0) regex.lastIndex++; // avoid infinite loop on empty matches
      iterations++;
      if (results.length >= MAX_RESULTS_PER_FILE) break;
    }
    lineStartOffset += line.length + 1; // +1 for the '\n' we split on
  }

  return results;
}

/**
 * Determines whether a directory entry should be skipped during the
 * walk — respects the user's configured exclude patterns (Settings,
 * default: node_modules, .git, build, dist, .gradle) plus files that are
 * inherently unsearchable as text (binaries, images, PDFs) or too large.
 */
function shouldSkipEntry(entry, excludePatterns) {
  if (excludePatterns.includes(entry.name)) return true;
  if (entry.name.startsWith('.') && entry.name !== '.' && excludePatterns.some((p) => p === entry.name)) return true;
  if (!entry.isDirectory) {
    if (isBinaryFile(entry.name) || isImageFile(entry.name) || isPdfFile(entry.name)) return true;
    if (entry.size != null && entry.size > MAX_FILE_SIZE_TO_SEARCH) return true;
  }
  return false;
}

/**
 * Walks the workspace tree starting at `rootUri` and searches every
 * eligible text file, invoking `onFileResult` for each file that has at
 * least one match (not for files with zero matches, to keep the callback
 * volume proportional to relevance) and `onProgress` periodically so the
 * UI can show "Searching... 340 files scanned".
 *
 * Cancellation: pass a `cancelToken` object ({ cancelled: false }) that
 * the caller can flip to true; the walk checks it between every file and
 * directory and stops promptly rather than completing the whole tree.
 *
 * @returns {Promise<{ cancelled: boolean, filesScanned: number, totalMatches: number }>}
 */
export async function searchWorkspace({
  rootUri,
  regex,
  excludePatterns,
  onFileResult,
  onProgress,
  cancelToken,
}) {
  let filesScanned = 0;
  let totalMatches = 0;
  let cancelled = false;

  async function walk(dirUri) {
    if (cancelToken?.cancelled) {
      cancelled = true;
      return;
    }

    let entries;
    try {
      entries = await FS.listDirectory(dirUri);
    } catch (err) {
      return; // unreadable directory — skip silently, don't fail the whole search
    }

    for (const entry of entries) {
      if (cancelToken?.cancelled) {
        cancelled = true;
        return;
      }
      if (shouldSkipEntry(entry, excludePatterns)) continue;

      if (entry.isDirectory) {
        await walk(entry.uri);
        if (cancelled) return;
      } else {
        if (totalMatches >= MAX_TOTAL_RESULTS) {
          cancelled = true; // soft-cap reached; stop like a cancellation
          return;
        }
        try {
          const content = await FS.readFile(entry.uri);
          filesScanned++;
          const matches = searchFileContent(content, regex);
          if (matches.length > 0) {
            totalMatches += matches.length;
            onFileResult({ uri: entry.uri, name: entry.name, matches });
          }
          if (filesScanned % 20 === 0) {
            onProgress?.({ filesScanned, totalMatches });
          }
        } catch (err) {
          // Unreadable individual file — skip, don't fail the whole search.
        }
      }
    }
  }

  await walk(rootUri);
  onProgress?.({ filesScanned, totalMatches });

  return { cancelled, filesScanned, totalMatches };
}

/**
 * Applies a set of replacements to a single file's content, given the
 * same match records searchFileContent produces (using their fileOffset
 * + matchLength, NOT re-running the regex) so that "replace exactly
 * these matches the user saw" is guaranteed even if the replacement
 * string itself would also match the search pattern (which would cause
 * an infinite/incorrect re-match if we naively re-ran the regex after
 * substitution).
 */
export function applyReplacements(content, matches, replacement) {
  // Process in reverse offset order so earlier replacements don't shift
  // the offsets of later ones.
  const sorted = [...matches].sort((a, b) => b.fileOffset - a.fileOffset);
  let result = content;
  for (const match of sorted) {
    result =
      result.slice(0, match.fileOffset) + replacement + result.slice(match.fileOffset + match.matchLength);
  }
  return result;
}
