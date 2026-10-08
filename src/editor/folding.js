/**
 * Code folding range detection.
 *
 * Two strategies, chosen per-language:
 *   - Bracket-based (JS/TS, C, C++, Java, Dart, JSON, CSS): a fold range
 *     is the span between a `{`/`[`/`(` and its matching close, when they
 *     sit on different lines.
 *   - Indentation-based (Python, Markdown headings): a fold range starts
 *     at a line and extends through all following lines with strictly
 *     greater indentation, ending at the last such line before
 *     indentation returns to the start level or lower.
 *
 * Both strategies produce the same output shape so the gutter/renderer
 * doesn't need to know which one was used:
 *
 *   { startLine: number, endLine: number }[]  (0-indexed, inclusive)
 */

const BRACKET_LANGUAGES = new Set(['javascript', 'typescript', 'c', 'cpp', 'java', 'dart', 'json', 'css']);
const INDENT_LANGUAGES = new Set(['python']);

export function computeFoldRanges(lines, languageId) {
  if (BRACKET_LANGUAGES.has(languageId)) {
    return computeBracketFoldRanges(lines);
  }
  if (INDENT_LANGUAGES.has(languageId)) {
    return computeIndentFoldRanges(lines);
  }
  if (languageId === 'markdown') {
    return computeMarkdownFoldRanges(lines);
  }
  if (languageId === 'html') {
    return computeBracketFoldRanges(lines, { open: '<', close: '>', tagAware: true });
  }
  return [];
}

/**
 * Bracket-based folding: scans character-by-character across the whole
 * document (joined with real newlines so line numbers stay accurate),
 * tracking a stack of open bracket positions. Whenever a bracket closes
 * on a different line than it opened, that's a fold range candidate.
 *
 * String and comment contents are intentionally not excluded here (that
 * would require a full tokenize pass per fold computation) — in
 * practice stray brackets inside strings/comments are rare enough not to
 * meaningfully break folding, and this keeps fold computation O(n) and
 * independent of the tokenizer, so it stays fast even on huge files.
 */
function computeBracketFoldRanges(lines) {
  const ranges = [];
  const stack = []; // { char, line }
  const openers = new Set(['{', '[', '(']);
  const closers = { '}': '{', ']': '[', ')': '(' };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (openers.has(ch)) {
        stack.push({ char: ch, line: lineIdx });
      } else if (closers[ch]) {
        const top = stack[stack.length - 1];
        if (top && top.char === closers[ch]) {
          stack.pop();
          if (lineIdx > top.line) {
            ranges.push({ startLine: top.line, endLine: lineIdx });
          }
        }
      }
    }
  }

  return mergeDuplicateStarts(ranges);
}

/**
 * Indentation-based folding for Python: a line that ends with `:` (or,
 * more generally, any line followed by more-indented lines) opens a
 * fold range that extends through the last contiguous line with greater
 * indentation.
 */
function computeIndentFoldRanges(lines) {
  const ranges = [];
  const indentOf = (line) => {
    const match = line.match(/^[ \t]*/);
    return match ? expandTabs(match[0]) : 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // blank lines never start a fold

    const baseIndent = indentOf(line);
    let end = i;
    let j = i + 1;

    while (j < lines.length) {
      const next = lines[j];
      if (!next.trim()) {
        j++;
        continue; // skip blank lines when deciding fold extent
      }
      const nextIndent = indentOf(next);
      if (nextIndent > baseIndent) {
        end = j;
        j++;
      } else {
        break;
      }
    }

    if (end > i) {
      ranges.push({ startLine: i, endLine: end });
    }
  }

  return ranges;
}

/** Markdown: a heading folds everything until the next heading of equal-or-higher level. */
function computeMarkdownFoldRanges(lines) {
  const ranges = [];
  const headingLevel = (line) => {
    const m = line.match(/^(#{1,6})\s/);
    return m ? m[1].length : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const level = headingLevel(lines[i]);
    if (level === null) continue;

    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLevel = headingLevel(lines[j]);
      if (nextLevel !== null && nextLevel <= level) break;
      end = j;
    }

    if (end > i) ranges.push({ startLine: i, endLine: end });
  }

  return ranges;
}

function expandTabs(whitespace, tabSize = 4) {
  let width = 0;
  for (const ch of whitespace) {
    width += ch === '\t' ? tabSize : 1;
  }
  return width;
}

/** If multiple ranges share a startLine (nested brackets both starting on one line), keep the largest. */
function mergeDuplicateStarts(ranges) {
  const byStart = new Map();
  for (const range of ranges) {
    const existing = byStart.get(range.startLine);
    if (!existing || range.endLine > existing.endLine) {
      byStart.set(range.startLine, range);
    }
  }
  return Array.from(byStart.values()).sort((a, b) => a.startLine - b.startLine);
}

/**
 * Given the full line array and the set of currently-folded start lines,
 * computes which line indices should be hidden from rendering (i.e. all
 * lines strictly between startLine and endLine of any folded range whose
 * startLine is in `foldedLines`).
 *
 * Returns a Set<number> of hidden line indices for O(1) lookup while
 * rendering the viewport.
 */
export function computeHiddenLines(foldRanges, foldedStartLines) {
  const hidden = new Set();
  const foldedSet = new Set(foldedStartLines);
  for (const range of foldRanges) {
    if (foldedSet.has(range.startLine)) {
      for (let l = range.startLine + 1; l <= range.endLine; l++) {
        hidden.add(l);
      }
    }
  }
  return hidden;
}
