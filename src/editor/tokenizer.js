/**
 * Tokenizer engine.
 *
 * Rather than pulling in Prism.js (which assumes a DOM/HTML rendering
 * target and fights React Native's text model) or a full TextMate-grammar
 * engine (heavy, and overkill for a mobile editor), CodeForge uses a
 * small regex-rule tokenizer per language. Each language module exports
 * an ordered list of {type, regex} rules; a line is tokenized by
 * repeatedly matching the earliest rule that matches at the current
 * position, consuming that match, and advancing.
 *
 * This is intentionally line-oriented (not full-document), which is what
 * makes the line-windowed renderer in CodeEditor.js viable: we only ever
 * tokenize the lines currently on screen (+ overscan), not the whole
 * file, so a 10,000-line file costs the same per-frame as a 50-line one.
 *
 * Multi-line constructs (block comments, template literals, triple-quoted
 * strings) are handled via a small amount of per-line *state* threading:
 * tokenizeLine() accepts and returns a `state` value (e.g.
 * 'in-block-comment') so the caller can carry it from one line to the
 * next in document order. This is the same technique CodeMirror/Monaco
 * use internally (a simplified version of it), and is what lets triple-
 * quoted Python strings or block comments (slash-star ... star-slash) span
 * lines correctly without re-tokenizing the whole file when one line
 * changes.
 */

/**
 * @typedef {Object} Token
 * @property {string} type   Token classification, maps to a syntax color
 * @property {string} text   The raw substring
 *
 * @typedef {Object} TokenizeResult
 * @property {Token[]} tokens
 * @property {*} state       Opaque state to pass into the next line's call
 */

/**
 * Tokenizes a single line of text against a language definition.
 *
 * @param {string} line
 * @param {import('./languages/types').LanguageDefinition} lang
 * @param {*} state  State carried from the previous line (or lang.initialState)
 * @returns {TokenizeResult}
 */
export function tokenizeLine(line, lang, state) {
  if (!lang || !lang.rules) {
    return { tokens: line ? [{ type: 'plain', text: line }] : [], state };
  }

  const tokens = [];
  let pos = 0;
  let currentState = state ?? lang.initialState ?? null;

  // Multi-line state handling: if we're inside a stateful construct (block
  // comment, docstring), first try to find its closing sequence on this
  // line. If found, emit everything up to and including the close as that
  // token type and resume normal tokenizing after it; if not found, the
  // whole line belongs to that construct and we stay in-state.
  if (currentState && lang.stateHandlers && lang.stateHandlers[currentState]) {
    const handler = lang.stateHandlers[currentState];
    const closeMatch = line.slice(pos).match(handler.closeRegex);
    if (closeMatch) {
      const end = pos + closeMatch.index + closeMatch[0].length;
      tokens.push({ type: handler.type, text: line.slice(pos, end) });
      pos = end;
      currentState = null;
    } else {
      if (line.length > pos) {
        tokens.push({ type: handler.type, text: line.slice(pos) });
      }
      return { tokens, state: currentState };
    }
  }

  const maxIterations = line.length + lang.rules.length + 10; // guards against pathological infinite loops
  let iterations = 0;

  while (pos < line.length && iterations < maxIterations) {
    iterations++;
    let matched = false;

    for (const rule of lang.rules) {
      rule.regex.lastIndex = 0;
      const slice = line.slice(pos);
      const m = rule.regex.exec(slice);
      if (m && m.index === 0 && m[0].length > 0) {
        // Does this rule open a multi-line state (e.g. start of a block comment)?
        if (rule.opensState) {
          tokens.push({ type: rule.type, text: m[0] });
          pos += m[0].length;
          currentState = rule.opensState;
          matched = true;
          // Immediately try to close it on the same line (e.g. /* x */ on one line).
          const handler = lang.stateHandlers[currentState];
          const closeMatch = line.slice(pos).match(handler.closeRegex);
          if (closeMatch) {
            const end = pos + closeMatch.index + closeMatch[0].length;
            tokens[tokens.length - 1] = {
              type: handler.type,
              text: line.slice(pos - m[0].length, end),
            };
            pos = end;
            currentState = null;
          } else if (line.length > pos) {
            tokens.push({ type: handler.type, text: line.slice(pos) });
            pos = line.length;
          }
          break;
        }

        tokens.push({ type: rule.type, text: m[0] });
        pos += m[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // No rule matched at this position — consume one char as plain text
      // rather than getting stuck. Coalesce consecutive plain chars into
      // a single token to keep the token array small.
      const last = tokens[tokens.length - 1];
      if (last && last.type === 'plain') {
        last.text += line[pos];
      } else {
        tokens.push({ type: 'plain', text: line[pos] });
      }
      pos += 1;
    }
  }

  return { tokens, state: currentState };
}

/**
 * Tokenizes an array of lines in order, threading state between them.
 * Used when a contiguous range needs re-tokenizing (e.g. after an edit,
 * or the initial viewport tokenize) rather than one line at a time.
 *
 * @param {string[]} lines
 * @param {import('./languages/types').LanguageDefinition} lang
 * @param {*} initialState  State entering the first line (from the last
 *   tokenized line above the range, or lang.initialState for line 0)
 * @returns {{ perLine: TokenizeResult[], endState: * }}
 */
export function tokenizeLines(lines, lang, initialState) {
  const perLine = [];
  let state = initialState ?? lang?.initialState ?? null;
  for (const line of lines) {
    const result = tokenizeLine(line, lang, state);
    perLine.push(result);
    state = result.state;
  }
  return { perLine, endState: state };
}
