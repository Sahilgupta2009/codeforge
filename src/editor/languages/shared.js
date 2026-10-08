/**
 * Shared regex fragments and helpers for building language token rules.
 *
 * Token `type` values map directly to keys in theme/tokens.js's `syntax`
 * palette (keyword, string, number, comment, function, variable, type,
 * operator, tag, attribute, punctuation, constant) — any type not found
 * there falls back to onSurface (plain text color) in the renderer.
 *
 * All regexes are written to match starting at position 0 of the slice
 * they're given (the tokenizer always tests `m.index === 0`), so every
 * pattern here is effectively anchored even without a literal `^`.
 */

export const COMMON = {
  whitespace: /^[ \t]+/,
  newlineNone: /^$/, // never matches; placeholder for clarity where needed

  doubleQuoteString: /^"(?:\\.|[^"\\])*"?/,
  singleQuoteString: /^'(?:\\.|[^'\\])*'?/,
  backtickString: /^`(?:\\.|[^`\\])*`?/,

  lineComment: (prefix) => new RegExp(`^${prefix}.*`),

  number: /^\b(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+\.\d+([eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+)[fFlLuU]*\b/,

  punctuation: /^[{}()[\];,.:]/,
  operator: /^(={1,3}|!={1,2}|<=|>=|&&|\|\||[-+*/%<>!~^&|?]=?|=>)/,
};

/**
 * Builds a case-sensitive "whole word" matcher for a set of keywords,
 * matching the longest keyword first isn't necessary here since we use
 * a word-boundary regex rather than prefix matching.
 */
export function keywordRule(keywords, type = 'keyword') {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { type, regex: new RegExp(`^\\b(${escaped.join('|')})\\b`) };
}

export function identifierRule(type = 'variable') {
  return { type, regex: /^[A-Za-z_$][A-Za-z0-9_$]*/ };
}

/** Matches an identifier immediately followed by '(' as a function call/def. */
export function functionCallRule() {
  return { type: 'function', regex: /^[A-Za-z_$][A-Za-z0-9_$]*(?=\s*\()/ };
}
