/**
 * Bracket matching, auto-closing pairs, and auto-indentation.
 *
 * All functions here operate on plain strings/arrays and are UI-agnostic
 * on purpose — CodeEditor.js calls these on every keystroke, and keeping
 * them pure makes them cheap to unit test (see the Part 3 smoke test)
 * without mounting any React Native component.
 */

export const BRACKET_PAIRS = {
  '(': ')',
  '[': ']',
  '{': '}',
};
export const CLOSING_TO_OPENING = { ')': '(', ']': '[', '}': '{' };
export const AUTO_CLOSE_PAIRS = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

/**
 * Finds the matching bracket for the bracket at `position` in `text`
 * (a full-document string with \n separators). Returns the absolute
 * character offset of the match, or -1 if unmatched or `position` isn't
 * a bracket character.
 */
export function findMatchingBracket(text, position) {
  const char = text[position];
  if (BRACKET_PAIRS[char]) {
    return findForward(text, position, char, BRACKET_PAIRS[char]);
  }
  if (CLOSING_TO_OPENING[char]) {
    return findBackward(text, position, CLOSING_TO_OPENING[char], char);
  }
  return -1;
}

function findForward(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findBackward(text, start, open, close) {
  let depth = 0;
  for (let i = start; i >= 0; i--) {
    if (text[i] === close) depth++;
    else if (text[i] === open) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Given the char just typed and the character immediately following the
 * cursor, decides whether to auto-insert a closing pair, and whether to
 * instead "type through" an already-present closing character (the
 * standard VS Code-style behavior: typing `)` when a `)` is already right
 * after the cursor just moves past it instead of inserting a duplicate).
 *
 * @returns {{ action: 'insert-pair'|'type-through'|'none', insertText?: string }}
 */
export function getAutoCloseAction(typedChar, charAfterCursor, charBeforeCursor) {
  // Typing a closing bracket/quote that's already right there: skip over it.
  const isClosingChar = Object.values(AUTO_CLOSE_PAIRS).includes(typedChar);
  if (isClosingChar && charAfterCursor === typedChar) {
    return { action: 'type-through' };
  }

  // Quotes are ambiguous (same open/close char) — only auto-pair when not
  // immediately after an alphanumeric (avoids pairing inside words like
  // "don't" -> "don''t").
  if (typedChar === '"' || typedChar === "'" || typedChar === '`') {
    const isAfterWordChar = charBeforeCursor && /[A-Za-z0-9_]/.test(charBeforeCursor);
    if (isAfterWordChar) return { action: 'none' };
    return { action: 'insert-pair', insertText: AUTO_CLOSE_PAIRS[typedChar] };
  }

  if (AUTO_CLOSE_PAIRS[typedChar]) {
    return { action: 'insert-pair', insertText: AUTO_CLOSE_PAIRS[typedChar] };
  }

  return { action: 'none' };
}

/**
 * Determines whether a Backspace at `position` should delete both
 * characters of an empty pair, e.g. cursor between `(` and `)` with
 * nothing typed inside — Backspace removes both rather than leaving a
 * dangling `)`.
 */
export function shouldDeletePairOnBackspace(charBefore, charAfter) {
  return AUTO_CLOSE_PAIRS[charBefore] === charAfter;
}

/**
 * Computes the indentation string that a new line should start with
 * after pressing Enter at the end of `currentLineText`, given the
 * editor's tab size / insertSpaces settings. Handles two cases:
 *   1. Plain "continue the previous line's indentation" (most lines)
 *   2. "Increase indent" when the line ends with an opening bracket
 *      (and further, "wrap the closing bracket onto its own dedented
 *      line" when the cursor is directly between an open/close pair).
 */
export function computeAutoIndent({
  lineBeforeCursor,
  lineAfterCursor,
  tabSize,
  insertSpaces,
}) {
  const indentUnit = insertSpaces ? ' '.repeat(tabSize) : '\t';
  const currentIndentMatch = lineBeforeCursor.match(/^[ \t]*/);
  const currentIndent = currentIndentMatch ? currentIndentMatch[0] : '';

  const trimmedBefore = lineBeforeCursor.trimEnd();
  const lastChar = trimmedBefore[trimmedBefore.length - 1];
  const trimmedAfter = lineAfterCursor.trimStart();
  const firstCharAfter = trimmedAfter[0];

  const opensBlock = lastChar && BRACKET_PAIRS[lastChar];
  const closesMatchingBlock =
    opensBlock && firstCharAfter && BRACKET_PAIRS[lastChar] === firstCharAfter;

  // Python-specific: a line ending in ':' also opens an indent block, even
  // though ':' isn't a bracket.
  const opensColonBlock = lastChar === ':';

  if (closesMatchingBlock) {
    // Enter between `{` and `}` -> new indented line, then the closing
    // bracket dedented on its own line below.
    return {
      newLineIndent: currentIndent + indentUnit,
      insertClosingLineBelow: true,
      closingLineIndent: currentIndent,
    };
  }

  if (opensBlock || opensColonBlock) {
    return { newLineIndent: currentIndent + indentUnit, insertClosingLineBelow: false };
  }

  return { newLineIndent: currentIndent, insertClosingLineBelow: false };
}

/**
 * Returns true if `line` (indentation-stripped) is a "dedent trigger" —
 * used to auto-reduce indentation when the user types a closing bracket
 * as the first non-whitespace character on an otherwise-empty line, or
 * types Python keywords like `else`/`elif`/`except`/`finally` that
 * should dedent to match their opening `if`/`try`.
 */
export function isDedentTrigger(textTypedSoFarOnLine) {
  const trimmed = textTypedSoFarOnLine.trim();
  return (
    trimmed === ')' ||
    trimmed === ']' ||
    trimmed === '}' ||
    /^(else|elif|except|finally)\b/.test(trimmed)
  );
}
