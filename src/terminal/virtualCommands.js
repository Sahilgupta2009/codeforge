import { FS } from '../filesystem/FileSystemRouter';
import { resolvePath, formatPromptPath } from './virtualPathResolver';
import { parseFlags } from './shellTokenizer';
import { formatFileSize, sortEntries } from '../utils/pathUtils';
import * as GitService from '../git/GitService';
import { runCode, formatRunResult } from '../runner/runnerService';
import { useSettingsStore } from '../state/useSettingsStore';
import { detectLanguage } from '../utils/pathUtils';
import { isRunnableLanguage } from '../runner/languages';
import { buildSearchRegex, searchFileContent } from '../search/searchEngine';

/**
 * Virtual terminal commands.
 *
 * Each command is an async function `(session, argv) => CommandResult`
 * where `session` carries { cwd, rootUri, workspaceUri } and
 * CommandResult is `{ output: string[], newCwd?: {uri, displayPath},
 * exitCode: number }`. Commands operate on the REAL workspace via
 * FileSystemRouter — `ls` genuinely lists real SAF directory contents,
 * `cat` genuinely reads real file bytes, `rm` genuinely deletes real
 * files. This is not a simulated/fake filesystem layered on top of
 * nothing; it's a real shell-like interface to the same FS layer the
 * Explorer and Editor use, which is what makes running e.g. `mkdir` here
 * and seeing it appear in the Explorer immediately (via the existing
 * FileSystemEventBus) actually work correctly.
 *
 * What's NOT real: arbitrary process execution. There is no bundled
 * Python/Node/gcc/etc — a command like `python script.py` isn't
 * something CodeForge can execute on the device's behalf; see
 * termuxBridge.js for how real process execution is achieved when
 * Termux is installed, which is a fundamentally different code path
 * (an OS-level intent to a real Linux environment) from everything in
 * this file.
 */

function ok(output, extra = {}) {
  return { output: Array.isArray(output) ? output : [output], exitCode: 0, ...extra };
}
function fail(message) {
  return { output: [message], exitCode: 1 };
}

async function cmd_pwd(session) {
  return ok(formatPromptPath(session.cwd.displayPath));
}

async function cmd_cd(session, argv) {
  const target = argv[0] || '';
  const resolved = await resolvePath(session.cwd, session.rootUri, target);
  if (!resolved) return fail(`cd: no such file or directory: ${target}`);
  if (!resolved.isDirectory) return fail(`cd: not a directory: ${target}`);
  return ok([], { newCwd: { uri: resolved.uri, displayPath: resolved.displayPath } });
}

async function cmd_ls(session, argv) {
  const { flags, positional } = parseFlags(argv);
  const targetArg = positional[0] || '.';
  const resolved = await resolvePath(session.cwd, session.rootUri, targetArg);
  if (!resolved) return fail(`ls: cannot access '${targetArg}': No such file or directory`);
  if (!resolved.isDirectory) return ok(resolved.name);

  let entries;
  try {
    entries = await FS.listDirectory(resolved.uri);
  } catch (err) {
    return fail(`ls: cannot open directory '${targetArg}': ${err.message}`);
  }

  const sorted = sortEntries(entries).filter((e) => flags.has('a') || !e.name.startsWith('.'));

  if (flags.has('l')) {
    const lines = sorted.map((e) => {
      const type = e.isDirectory ? 'd' : '-';
      const size = e.isDirectory ? '-' : formatFileSize(e.size).padStart(8);
      return `${type}rwxr-xr-x  ${size}  ${e.name}${e.isDirectory ? '/' : ''}`;
    });
    return ok(lines.length > 0 ? lines : ['(empty directory)']);
  }

  const names = sorted.map((e) => (e.isDirectory ? `${e.name}/` : e.name));
  return ok(names.length > 0 ? [names.join('  ')] : ['(empty directory)']);
}

async function cmd_cat(session, argv) {
  if (argv.length === 0) return fail('cat: missing file operand');
  const output = [];
  for (const pathArg of argv) {
    const resolved = await resolvePath(session.cwd, session.rootUri, pathArg);
    if (!resolved) {
      output.push(`cat: ${pathArg}: No such file or directory`);
      continue;
    }
    if (resolved.isDirectory) {
      output.push(`cat: ${pathArg}: Is a directory`);
      continue;
    }
    try {
      const content = await FS.readFile(resolved.uri);
      output.push(...content.split('\n'));
    } catch (err) {
      output.push(`cat: ${pathArg}: ${err.message}`);
    }
  }
  return { output, exitCode: 0 };
}

async function cmd_mkdir(session, argv) {
  const { positional } = parseFlags(argv);
  if (positional.length === 0) return fail('mkdir: missing operand');
  const output = [];
  let exitCode = 0;
  for (const pathArg of positional) {
    const segments = pathArg.split('/').filter(Boolean);
    const name = segments.pop();
    const parentPath = segments.join('/');
    try {
      const parentResolved = parentPath
        ? await resolvePath(session.cwd, session.rootUri, parentPath)
        : session.cwd;
      if (!parentResolved) {
        output.push(`mkdir: cannot create directory '${pathArg}': No such file or directory`);
        exitCode = 1;
        continue;
      }
      await FS.createDirectory(parentResolved.uri, name);
    } catch (err) {
      output.push(`mkdir: cannot create directory '${pathArg}': ${err.message}`);
      exitCode = 1;
    }
  }
  return { output, exitCode };
}

async function cmd_touch(session, argv) {
  if (argv.length === 0) return fail('touch: missing file operand');
  const output = [];
  let exitCode = 0;
  for (const pathArg of argv) {
    const existing = await resolvePath(session.cwd, session.rootUri, pathArg);
    if (existing) continue; // touch on existing file is a no-op success (mtime update not supported by SAF)
    const segments = pathArg.split('/').filter(Boolean);
    const name = segments.pop();
    const parentPath = segments.join('/');
    try {
      const parentResolved = parentPath
        ? await resolvePath(session.cwd, session.rootUri, parentPath)
        : session.cwd;
      if (!parentResolved) {
        output.push(`touch: cannot touch '${pathArg}': No such file or directory`);
        exitCode = 1;
        continue;
      }
      await FS.createFile(parentResolved.uri, name);
    } catch (err) {
      output.push(`touch: cannot touch '${pathArg}': ${err.message}`);
      exitCode = 1;
    }
  }
  return { output, exitCode };
}

async function cmd_rm(session, argv) {
  const { flags, positional } = parseFlags(argv);
  if (positional.length === 0) return fail('rm: missing operand');
  const output = [];
  let exitCode = 0;
  for (const pathArg of positional) {
    const resolved = await resolvePath(session.cwd, session.rootUri, pathArg);
    if (!resolved) {
      output.push(`rm: cannot remove '${pathArg}': No such file or directory`);
      exitCode = 1;
      continue;
    }
    if (resolved.isDirectory && !flags.has('r') && !flags.has('recursive')) {
      output.push(`rm: cannot remove '${pathArg}': Is a directory (use -r)`);
      exitCode = 1;
      continue;
    }
    try {
      await FS.delete(resolved.uri);
    } catch (err) {
      output.push(`rm: cannot remove '${pathArg}': ${err.message}`);
      exitCode = 1;
    }
  }
  return { output, exitCode };
}

async function cmd_mv(session, argv) {
  const { positional } = parseFlags(argv);
  if (positional.length !== 2) return fail('mv: usage: mv <source> <destination>');
  const [sourceArg, destArg] = positional;
  const source = await resolvePath(session.cwd, session.rootUri, sourceArg);
  if (!source) return fail(`mv: cannot stat '${sourceArg}': No such file or directory`);

  try {
    const destParent = await resolvePath(session.cwd, session.rootUri, destArg);
    if (destParent && destParent.isDirectory) {
      await FS.move(source.uri, destParent.uri);
    } else {
      const segments = destArg.split('/').filter(Boolean);
      const newName = segments.pop();
      const parentPath = segments.join('/');
      const parentResolved = parentPath ? await resolvePath(session.cwd, session.rootUri, parentPath) : session.cwd;
      if (!parentResolved) return fail(`mv: cannot move to '${destArg}': No such directory`);
      const movedUri = await FS.move(source.uri, parentResolved.uri);
      if (newName && newName !== source.name) {
        await FS.rename(movedUri, newName);
      }
    }
    return ok([]);
  } catch (err) {
    return fail(`mv: ${err.message}`);
  }
}

async function cmd_cp(session, argv) {
  const { positional } = parseFlags(argv);
  if (positional.length !== 2) return fail('cp: usage: cp <source> <destination>');
  const [sourceArg, destArg] = positional;
  const source = await resolvePath(session.cwd, session.rootUri, sourceArg);
  if (!source) return fail(`cp: cannot stat '${sourceArg}': No such file or directory`);

  try {
    const destParent = await resolvePath(session.cwd, session.rootUri, destArg);
    if (destParent && destParent.isDirectory) {
      await FS.copy(source.uri, destParent.uri);
    } else {
      const segments = destArg.split('/').filter(Boolean);
      const newName = segments.pop();
      const parentPath = segments.join('/');
      const parentResolved = parentPath ? await resolvePath(session.cwd, session.rootUri, parentPath) : session.cwd;
      if (!parentResolved) return fail(`cp: cannot copy to '${destArg}': No such directory`);
      await FS.copy(source.uri, parentResolved.uri, newName);
    }
    return ok([]);
  } catch (err) {
    return fail(`cp: ${err.message}`);
  }
}

async function cmd_echo(session, argv) {
  return ok(argv.join(' '));
}

/** Simple recursive text search — a lightweight `grep -r` reusing the same search engine as Global Search (Part 5) for consistent behavior. */
async function cmd_grep(session, argv) {
  const { flags, positional } = parseFlags(argv);
  if (positional.length === 0) return fail('grep: missing pattern');
  const pattern = positional[0];
  const pathArg = positional[1] || '.';

  const regex = buildSearchRegex({
    query: pattern,
    useRegex: flags.has('E') || flags.has('extended-regexp'),
    caseSensitive: !flags.has('i') && !flags.has('ignore-case'),
    wholeWord: false,
  });
  if (!regex) return fail('grep: invalid pattern');

  const resolved = await resolvePath(session.cwd, session.rootUri, pathArg);
  if (!resolved) return fail(`grep: ${pathArg}: No such file or directory`);

  const output = [];
  if (resolved.isDirectory) {
    if (!flags.has('r') && !flags.has('recursive')) {
      return fail(`grep: ${pathArg}: Is a directory (use -r)`);
    }
    await walkAndGrep(resolved.uri, resolved.displayPath, regex, output);
  } else {
    try {
      const content = await FS.readFile(resolved.uri);
      const matches = searchFileContent(content, regex);
      matches.forEach((m) => output.push(`${resolved.displayPath}:${m.line + 1}: ${m.lineText.trim()}`));
    } catch (err) {
      output.push(`grep: ${pathArg}: ${err.message}`);
    }
  }

  return { output: output.length > 0 ? output : ['(no matches)'], exitCode: output.length > 0 ? 0 : 1 };
}

async function walkAndGrep(dirUri, displayPath, regex, output) {
  let entries;
  try {
    entries = await FS.listDirectory(dirUri);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const childDisplayPath = displayPath ? `${displayPath}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      await walkAndGrep(entry.uri, childDisplayPath, regex, output);
    } else {
      try {
        const content = await FS.readFile(entry.uri);
        const matches = searchFileContent(content, regex);
        matches.forEach((m) => output.push(`${childDisplayPath}:${m.line + 1}: ${m.lineText.trim()}`));
      } catch {
        // skip unreadable files
      }
    }
  }
}

/** Simple filename search under a directory, with optional `-name "*.ext"` glob filter. */
async function cmd_find(session, argv) {
  const { positional } = parseFlags(argv);
  const startArg = positional[0] || '.';
  const nameFilter = argv.includes('-name') ? argv[argv.indexOf('-name') + 1] : null;

  const resolved = await resolvePath(session.cwd, session.rootUri, startArg);
  if (!resolved || !resolved.isDirectory) return fail(`find: '${startArg}': No such directory`);

  const output = [];
  async function walk(dirUri, displayPath) {
    let entries;
    try {
      entries = await FS.listDirectory(dirUri);
    } catch {
      return;
    }
    for (const entry of entries) {
      const childPath = displayPath ? `${displayPath}/${entry.name}` : entry.name;
      const matchesFilter = !nameFilter || globMatch(entry.name, nameFilter);
      if (matchesFilter) output.push(`./${childPath}`);
      if (entry.isDirectory) await walk(entry.uri, childPath);
    }
  }
  await walk(resolved.uri, resolved.displayPath);
  return ok(output.length > 0 ? output : ['(no results)']);
}

/** Minimal glob matcher supporting only `*` wildcards, sufficient for `find -name "*.js"`-style filters. */
function globMatch(name, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(name);
}

/** `git` passthrough — routes a small, common subset of git subcommands to GitService (Part 6) so the terminal and the Source Control panel share one source of truth rather than two independent git implementations. */
async function cmd_git(session, argv) {
  const [subcommand, ...rest] = argv;
  if (!subcommand) return fail('usage: git <command> [args]');

  try {
    switch (subcommand) {
      case 'status': {
        const status = await GitService.getStatus(session.workspaceUri, session.excludePatterns);
        if (status.length === 0) return ok('nothing to commit, working tree clean');
        return ok(status.map((s) => `${s.staged ? 'staged' : 'unstaged'}  ${s.status.padEnd(10)} ${s.path}`));
      }
      case 'add': {
        const { positional } = parseFlags(rest);
        if (positional.length === 0) return fail('git add: nothing specified');
        if (positional[0] === '.' || positional[0] === '-A' || positional[0] === '--all') {
          const status = await GitService.getStatus(session.workspaceUri, session.excludePatterns);
          await GitService.stageAll(session.workspaceUri, status.map((s) => s.path));
        } else {
          for (const p of positional) await GitService.stageFile(session.workspaceUri, p);
        }
        return ok([]);
      }
      case 'commit': {
        const { positional } = parseFlags(rest);
        const messageIndex = rest.indexOf('-m');
        const message = messageIndex !== -1 ? rest[messageIndex + 1] : positional.join(' ');
        if (!message) return fail('git commit: message required (use -m "message")');
        const sha = await GitService.commit(session.workspaceUri, { message });
        return ok(`[commit ${sha.slice(0, 7)}] ${message}`);
      }
      case 'branch': {
        const branches = await GitService.listBranches(session.workspaceUri);
        const current = await GitService.getCurrentBranch(session.workspaceUri);
        return ok(branches.map((b) => (b === current ? `* ${b}` : `  ${b}`)));
      }
      case 'checkout': {
        const { positional } = parseFlags(rest);
        const branchName = positional[0];
        if (!branchName) return fail('git checkout: branch name required');
        await GitService.checkoutBranch(session.workspaceUri, branchName);
        return ok(`Switched to branch '${branchName}'`);
      }
      case 'log': {
        const history = await GitService.getCommitHistory(session.workspaceUri, { depth: 10 });
        if (history.length === 0) return ok('(no commits yet)');
        return ok(
          history.flatMap((c) => [`commit ${c.oid}`, `Author: ${c.authorName} <${c.authorEmail}>`, `\n    ${c.message}\n`])
        );
      }
      default:
        return fail(`git: '${subcommand}' is not supported in the built-in terminal. Full git CLI access requires the Termux bridge.`);
    }
  } catch (err) {
    return fail(`git: ${err.message}`);
  }
}


// --- Running code -----------------------------------------------------
// There is no local interpreter/compiler on the phone, so these commands
// send the file to the configured Judge0 runner (Settings -> Code Runner)
// and print its real output. Single-file programs only.
async function runFileCommand(session, pathArg, forcedLanguage, cmdName) {
  if (!pathArg) return fail(`${cmdName}: missing file operand`);
  const resolved = await resolvePath(session.cwd, session.rootUri, pathArg);
  if (!resolved) return fail(`${cmdName}: ${pathArg}: No such file or directory`);
  if (resolved.isDirectory) return fail(`${cmdName}: ${pathArg}: Is a directory`);
  const language = forcedLanguage || detectLanguage(resolved.name);
  if (!isRunnableLanguage(language)) {
    return fail(`${cmdName}: don't know how to run ${resolved.name}`);
  }
  const code = await FS.readFile(resolved.uri);
  const { runnerUrl, runnerAuthToken } = useSettingsStore.getState();
  try {
    const r = await runCode({ language, code, baseUrl: runnerUrl, authToken: runnerAuthToken });
    const text = formatRunResult(r);
    const lines = text ? text.split('\n') : [];
    if (!r.ok) lines.push(`[${r.status}]`);
    return { output: lines, exitCode: r.ok ? 0 : 1 };
  } catch (err) {
    return fail(`${cmdName}: ${err.message}`);
  }
}

const cmd_python = (session, argv) => runFileCommand(session, argv[0], 'python', 'python');
const cmd_node = (session, argv) => runFileCommand(session, argv[0], 'javascript', 'node');
const cmd_gcc = (session, argv) =>
  runFileCommand(session, argv.find((a) => !a.startsWith('-')), 'c', 'gcc');
const cmd_gpp = (session, argv) =>
  runFileCommand(session, argv.find((a) => !a.startsWith('-')), 'cpp', 'g++');
const cmd_run = (session, argv) => runFileCommand(session, argv[0], null, 'run');

async function cmd_help() {
  return ok([
    'Built-in commands:',
    '  ls [-la] [path]        list directory contents',
    '  cd [path]               change directory',
    '  pwd                      print working directory',
    '  cat <file...>            print file contents',
    '  mkdir <dir...>           create directories',
    '  touch <file...>          create empty files',
    '  rm [-r] <path...>        remove files/directories',
    '  mv <src> <dest>          move or rename',
    '  cp <src> <dest>          copy',
    '  echo <text>              print text',
    '  grep [-ri] <pat> [path]  search file contents',
    '  find [path] [-name pat]  find files by name',
    '  git <status|add|commit|branch|checkout|log>',
    '  run <file>               run a .py .c .cpp .js .java .ts .sh file',
    '  python <file.py>         run Python (also python3)',
    '  gcc <file.c>             compile + run C (also cc)',
    '  g++ <file.cpp>           compile + run C++ (also c++)',
    '  node <file.js>           run JavaScript',
    '  clear                    clear the terminal',
    '  history                  show command history',
    '  help                     show this message',
    '',
    'run/python/gcc/g++/node send the file to an online runner',
    '(internet needed, single-file programs). For offline use or',
    'packages, use Termux.',
  ]);
}

export const COMMAND_TABLE = {
  pwd: cmd_pwd,
  cd: cmd_cd,
  ls: cmd_ls,
  cat: cmd_cat,
  mkdir: cmd_mkdir,
  touch: cmd_touch,
  rm: cmd_rm,
  mv: cmd_mv,
  cp: cmd_cp,
  echo: cmd_echo,
  grep: cmd_grep,
  find: cmd_find,
  git: cmd_git,
  run: cmd_run,
  python: cmd_python,
  python3: cmd_python,
  node: cmd_node,
  gcc: cmd_gcc,
  cc: cmd_gcc,
  'g++': cmd_gpp,
  'c++': cmd_gpp,
  help: cmd_help,
};
