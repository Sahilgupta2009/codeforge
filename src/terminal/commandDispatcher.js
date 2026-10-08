import { tokenize } from './shellTokenizer';
import { COMMAND_TABLE } from './virtualCommands';

/**
 * Executes one raw input line against a terminal session.
 *
 * @param {{cwd: {uri,displayPath}, rootUri: string, workspaceUri: string, excludePatterns: string[]}} session
 * @param {string} line
 * @returns {Promise<{ command: string, output: string[], exitCode: number, newCwd?: object }>}
 */
export async function executeLine(session, line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return { command: '', output: [], exitCode: 0 };
  }

  const argv = tokenize(trimmed);
  const [command, ...args] = argv;

  // 'clear' and 'history' are handled by the UI layer (TerminalPanel.js)
  // since they act on scrollback/history state the dispatcher itself
  // doesn't own — they're still listed here so command lookup and
  // autocomplete (future) can treat them uniformly with real commands.
  if (command === 'clear' || command === 'history') {
    return { command, output: [], exitCode: 0, uiAction: command };
  }

  const handler = COMMAND_TABLE[command];
  if (!handler) {
    return {
      command,
      output: [`${command}: command not found. Type 'help' for a list of built-in commands.`],
      exitCode: 127,
    };
  }

  try {
    const result = await handler(session, args);
    return { command, ...result };
  } catch (err) {
    return { command, output: [`${command}: ${err.message}`], exitCode: 1 };
  }
}

export function isKnownCommand(command) {
  return command in COMMAND_TABLE || command === 'clear' || command === 'history';
}

export function getKnownCommandNames() {
  return [...Object.keys(COMMAND_TABLE), 'clear', 'history'].sort();
}
