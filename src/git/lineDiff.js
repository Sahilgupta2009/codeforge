/**
 * Line-based diff algorithm for the Diff Viewer.
 *
 * Implements the classic Myers diff via an LCS (longest common
 * subsequence) dynamic-programming table over lines (not characters —
 * line-level diffing is what every code diff viewer shows, and it's
 * both fast enough and the correct granularity for reviewing changes).
 *
 * This is a pure, dependency-free module deliberately kept separate from
 * isomorphic-git: git tells us WHICH files changed and lets us read the
 * old/new blob content, but the actual line-by-line diff rendering is
 * computed here, independent of the git library. This also means the
 * same diff renderer can be reused for the editor's "compare with saved
 * version" feature or any future need, without a git dependency.
 */

/**
 * Computes the longest common subsequence table for two line arrays
 * using dynamic programming. O(n*m) time and space — perfectly fine for
 * source files (thousands of lines, not millions).
 *
 * @returns {number[][]} DP table where table[i][j] = LCS length of
 *   oldLines[0..i) and newLines[0..j)
 */
function computeLCSTable(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const table = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
}

/**
 * @typedef {Object} DiffLine
 * @property {'equal'|'add'|'remove'} type
 * @property {string} text
 * @property {number|null} oldLineNumber   1-indexed, null for 'add' lines
 * @property {number|null} newLineNumber   1-indexed, null for 'remove' lines
 */

/**
 * Computes a line-level diff between two strings, returning an ordered
 * array of DiffLine records suitable for rendering as a unified diff
 * (VS Code-style: removed lines in red, added lines in green, unchanged
 * lines shown for context).
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {DiffLine[]}
 */
export function computeLineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const table = computeLCSTable(oldLines, newLines);

  const result = [];
  let i = oldLines.length;
  let j = newLines.length;

  // Walk the LCS table backward from (n,m) to (0,0), emitting one
  // DiffLine per step, then reverse at the end to get forward order.
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'equal', text: oldLines[i - 1], oldLineNumber: i, newLineNumber: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      result.push({ type: 'add', text: newLines[j - 1], oldLineNumber: null, newLineNumber: j });
      j--;
    } else if (i > 0 && (j === 0 || table[i][j - 1] < table[i - 1][j])) {
      result.push({ type: 'remove', text: oldLines[i - 1], oldLineNumber: i, newLineNumber: null });
      i--;
    } else {
      break; // unreachable given the loop condition, but guards against infinite loop
    }
  }

  result.reverse();
  return result;
}

/**
 * Groups a flat DiffLine[] into "hunks" — contiguous change regions with
 * a small window of unchanged context lines around them (the standard
 * unified-diff presentation), collapsing long unchanged runs so the diff
 * viewer doesn't render an entire unchanged 2000-line file around a
 * single one-line change.
 *
 * @param {DiffLine[]} diffLines
 * @param {number} contextLines  how many unchanged lines to show around each change
 * @returns {{ lines: DiffLine[], startLine: number, endLine: number }[]}
 */
export function groupIntoHunks(diffLines, contextLines = 3) {
  const changeIndices = diffLines
    .map((line, idx) => (line.type !== 'equal' ? idx : -1))
    .filter((idx) => idx !== -1);

  if (changeIndices.length === 0) {
    return []; // no changes at all — identical files
  }

  // Merge nearby changes into hunks: two changes are in the same hunk if
  // the unchanged gap between them is small enough that showing full
  // context for both would overlap.
  const ranges = [];
  let start = Math.max(0, changeIndices[0] - contextLines);
  let end = Math.min(diffLines.length - 1, changeIndices[0] + contextLines);

  for (let k = 1; k < changeIndices.length; k++) {
    const idx = changeIndices[k];
    const proposedStart = Math.max(0, idx - contextLines);
    if (proposedStart <= end + 1) {
      end = Math.min(diffLines.length - 1, idx + contextLines);
    } else {
      ranges.push({ start, end });
      start = proposedStart;
      end = Math.min(diffLines.length - 1, idx + contextLines);
    }
  }
  ranges.push({ start, end });

  return ranges.map((range) => ({
    lines: diffLines.slice(range.start, range.end + 1),
    startLine: range.start,
    endLine: range.end,
  }));
}

/**
 * Summarizes a diff into +N/-M counts, used for compact display in the
 * file status list and commit summary (e.g. "+12 -4").
 */
export function summarizeDiff(diffLines) {
  let additions = 0;
  let deletions = 0;
  for (const line of diffLines) {
    if (line.type === 'add') additions++;
    else if (line.type === 'remove') deletions++;
  }
  return { additions, deletions };
}
