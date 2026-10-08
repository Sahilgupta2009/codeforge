/**
 * Shell-style command line tokenizer.
 *
 * Parses a raw terminal input line into an argv array the way a POSIX
 * shell would: whitespace-separated tokens, with single/double-quoted
 * strings preserved as one token (quotes stripped), and backslash
 * escapes honored inside double quotes and outside quotes. This is not
 * a full shell grammar (no pipes, redirects, or variable expansion —
 * those are handled, where supported at all, by the command dispatcher
 * itself, see commandDispatcher.js's handling of `|` and `>`), just
 * correct argv tokenization, which is the part every command needs.
 */

/**
 * @param {string} line
 * @returns {string[]} argv-style token array
 */
export function tokenize(line) {
  const tokens = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let hasToken = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        inDoubleQuote = false;
      } else if (ch === '\\' && i + 1 < line.length && (line[i + 1] === '"' || line[i + 1] === '\\')) {
        current += line[i + 1];
        i++;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      hasToken = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      hasToken = true;
      continue;
    }
    if (ch === '\\' && i + 1 < line.length) {
      current += line[i + 1];
      hasToken = true;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }

    current += ch;
    hasToken = true;
  }

  if (hasToken) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Splits a tokenized argv into flags (options starting with - or --) and
 * positional arguments, returning them separately for command
 * implementations that want `{ flags, positional }` rather than
 * re-parsing argv themselves.
 *
 * Flags are normalized to a Set of their bare names (no leading dashes),
 * e.g. "-la" becomes {'l', 'a'} (short flags are split into individual
 * characters, matching common Unix tool behavior like `ls -la`), and
 * "--all" becomes {'all'}.
 */
export function parseFlags(argv) {
  const flags = new Set();
  const positional = [];

  for (const arg of argv) {
    if (arg.startsWith('--') && arg.length > 2) {
      flags.add(arg.slice(2));
    } else if (arg.startsWith('-') && arg.length > 1 && arg !== '-') {
      for (const ch of arg.slice(1)) {
        flags.add(ch);
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}
