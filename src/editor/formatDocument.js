/**
 * formatDocument.js
 * -----------------
 * A real, honest whitespace-level document formatter — NOT a full
 * AST-based reformatter like Prettier, gofmt, or clang-format. Building
 * a genuine multi-language AST formatter is far outside what's
 * realistic for this part (it would need a real parser per language,
 * which this project doesn't have); pretending to offer that and
 * silently only trimming whitespace would be exactly the kind of "mock
 * standing in for a later system" this project has avoided everywhere
 * else. So this does the honest, real subset of "formatting" that's
 * actually implementable at the text level:
 *
 *   1. Converts each line's LEADING indentation to the configured
 *      tabSize/insertSpaces settings, preserving the existing
 *      indentation DEPTH (how many logical indent levels a line is at).
 *      A literal tab always counts as exactly one level, regardless of
 *      width, since a tab has no inherent width of its own. Space
 *      indentation's WIDTH has to be inferred from the document itself
 *      first, since a fixed target tabSize alone can't tell "4 spaces"
 *      apart from "2 levels of 2-space indent" vs. "1 level of 4-space
 *      indent" — so this scans the whole document for the smallest
 *      non-zero space-only indent run and treats that as "one level" in
 *      the source. It does not attempt to infer correct indentation
 *      from code structure (braces, colons, etc.) — a line that's
 *      already mis-indented relative to its surrounding code stays at
 *      the same logical depth, just re-rendered in the target
 *      tab/space style. A document with only ONE indented line has no
 *      second depth to compare against, so that line's own width is
 *      treated as exactly one level — the same ambiguity every editor's
 *      "detect indentation" heuristic has to accept, not something this
 *      formatter can resolve any more precisely than that.
 *   2. Strips trailing whitespace from every line.
 *   3. Ensures the document ends with exactly one trailing newline.
 *
 * Used both by the "Format Document" command (manual, any time) and by
 * formatOnSave (automatic, right before every write — see saveTab.js).
 */

/**
 * Scans every line's leading whitespace and returns the smallest
 * non-zero run of leading spaces found on any line whose indentation is
 * PURE spaces (no tabs) — used as the inferred "one level" width for
 * this document's existing space-indented lines. Falls back to the
 * caller's configured tabSize if the document has no pure-space-indented
 * lines to infer from (e.g. it's tab-indented throughout, or flat).
 */
function inferSourceSpaceWidth(lines, fallbackTabSize) {
  let smallest = null;
  for (const line of lines) {
    // Only consider lines whose leading whitespace is spaces-only (no
    // tab anywhere in the leading run) — a line starting with a tab is
    // handled by the tab-counts-as-one-level rule instead, and mixing
    // the two into one width inference would conflate two different
    // indentation systems that might coexist in a messy file.
    const leadingMatch = line.match(/^([ \t]*)/);
    const leading = leadingMatch[1];
    if (leading.length === 0 || leading.includes('\t')) continue;

    if (smallest === null || leading.length < smallest) {
      smallest = leading.length;
    }
  }
  return smallest || fallbackTabSize;
}

/**
 * Counts a line's leading indentation depth in "levels" against an
 * already-inferred source space width. A literal tab always counts as
 * one level. A run of spaces counts as (run length / sourceSpaceWidth)
 * levels, rounded to the nearest whole level (a slightly-off run still
 * resolves to its closest intended depth rather than truncating down
 * and silently losing a level).
 */
function countIndentLevels(leadingWhitespace, sourceSpaceWidth) {
  let levels = 0;
  let pendingSpaces = 0;

  const flushSpaces = () => {
    if (pendingSpaces > 0) {
      levels += Math.round(pendingSpaces / sourceSpaceWidth) || 1; // any nonzero leftover still counts as at least 1 level
      pendingSpaces = 0;
    }
  };

  for (const ch of leadingWhitespace) {
    if (ch === '\t') {
      flushSpaces();
      levels += 1;
    } else if (ch === ' ') {
      pendingSpaces += 1;
    }
  }
  flushSpaces();

  return levels;
}

/**
 * Re-indents a single line's leading whitespace to the target style,
 * preserving its indentation depth as counted by countIndentLevels
 * against the document's inferred source space width. Non-whitespace
 * content after the leading whitespace is left completely untouched.
 */
function reindentLine(line, { tabSize, insertSpaces, sourceSpaceWidth }) {
  const match = line.match(/^([ \t]*)([\s\S]*)$/);
  const leading = match[1];
  const rest = match[2];

  if (leading === '') return rest; // nothing to reindent, and rest already has no leading whitespace

  const levels = countIndentLevels(leading, sourceSpaceWidth);
  const unit = insertSpaces ? ' '.repeat(tabSize) : '\t';
  return unit.repeat(levels) + rest;
}

/**
 * Formats a full document's text: re-indents every line to the target
 * tabSize/insertSpaces style, strips trailing whitespace from every
 * line, and ensures exactly one trailing newline at the end of the
 * file. Safe to call on an empty string.
 *
 * @param {string} content
 * @param {{tabSize: number, insertSpaces: boolean}} options
 * @returns {string}
 */
export function formatDocument(content, { tabSize = 2, insertSpaces = true } = {}) {
  if (typeof content !== 'string' || content === '') return content;

  const lines = content.split('\n');
  const sourceSpaceWidth = inferSourceSpaceWidth(lines, tabSize);

  const formattedLines = lines.map((line) => {
    const reindented = reindentLine(line, { tabSize, insertSpaces, sourceSpaceWidth });
    return reindented.replace(/[ \t]+$/, '');
  });

  let result = formattedLines.join('\n');
  result = result.replace(/\n+$/, ''); // strip all trailing blank lines/newlines...
  result += '\n'; // ...then add back exactly one

  return result;
}

/** True if formatDocument(content, options) would actually change the content. */
export function needsFormatting(content, options) {
  return formatDocument(content, options) !== content;
}

export default { formatDocument, needsFormatting };
