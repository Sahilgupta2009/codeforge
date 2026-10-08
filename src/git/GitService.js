import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { getGitFsInstance, GIT_DIR, syncToGitFS, syncFromGitFS } from './GitFileSystemBridge';

/**
 * GitService — a thin, promise-based wrapper around isomorphic-git's
 * API, scoped to one workspace at a time. Every function here takes a
 * `workspaceUri` and resolves the corresponding lightning-fs mirror
 * before calling into isomorphic-git with `{ fs, dir: GIT_DIR, ...}`.
 *
 * IMPORTANT — what this module can and can't guarantee in this delivery:
 * isomorphic-git's API surface used here (init/add/commit/branch/
 * checkout/statusMatrix/log/push/pull/currentBranch/listBranches) has
 * been stable across its 1.x releases for years and is used here exactly
 * per its documented shape. However, this sandbox has no network access
 * to install and execute the real package, so the calls below are
 * written correctly against the documented API but have NOT been
 * exercised against the actual library in this environment — unlike
 * every pure-logic module in this project (tokenizer, diff, search,
 * keybindings, etc.), which all have real passing test suites. Treat
 * this module as carefully-written-but-library-unverified, and budget
 * time to smoke-test actual git operations (init -> commit -> log) as
 * the first thing you do after `npm install` on your own machine.
 */

function getGitContext(workspaceUri) {
  const fs = getGitFsInstance(workspaceUri);
  return { fs, dir: GIT_DIR };
}

// --- Repository lifecycle ---

export async function isGitRepo(workspaceUri) {
  const { fs, dir } = getGitContext(workspaceUri);
  try {
    await git.resolveRef({ fs, dir, ref: 'HEAD' });
    return true;
  } catch (err) {
    return false;
  }
}

export async function initRepo(workspaceUri, excludePatterns) {
  await syncToGitFS(workspaceUri, excludePatterns);
  const { fs, dir } = getGitContext(workspaceUri);
  await git.init({ fs, dir, defaultBranch: 'main' });
}

// --- Status ---

/**
 * Returns a normalized status list by mapping isomorphic-git's
 * statusMatrix (a dense [filepath, headStatus, workdirStatus,
 * stageStatus] tuple format) into the same status vocabulary the
 * Explorer's FileTreeRow already understands (Part 2):
 * 'added' | 'modified' | 'deleted' | 'untracked' | 'conflict'.
 */
export async function getStatus(workspaceUri, excludePatterns) {
  await syncToGitFS(workspaceUri, excludePatterns);
  const { fs, dir } = getGitContext(workspaceUri);
  const matrix = await git.statusMatrix({ fs, dir });

  const results = [];
  for (const [filepath, head, workdir, stage] of matrix) {
    const status = mapStatusMatrixRow(head, workdir, stage);
    if (status) {
      results.push({ path: filepath, status, staged: stage !== head });
    }
  }
  return results;
}

/**
 * isomorphic-git's statusMatrix encodes each file's state as three
 * numbers (HEAD, working directory, stage). workdir/stage use 0=absent,
 * 1=identical to HEAD, 2=different from HEAD, 3=different from HEAD AND
 * different from stage (i.e. staged with further unstaged edits on top).
 * See isomorphic-git's documented statusMatrix table — this mapping
 * follows it exactly:
 *   [0,2,0] -> untracked (new file, not yet staged)
 *   [0,2,2] / [0,2,3] -> added (new file, staged — [0,2,3] means it also
 *     has further unstaged edits on top, but it's still fundamentally a
 *     newly-added file from git's perspective)
 *   [1,1,1] -> unmodified (not included in results)
 *   [1,2,1] -> modified, not staged
 *   [1,2,2] / [1,2,3] -> modified, staged (with [1,2,3] carrying further unstaged edits)
 *   [1,0,1] -> deleted, not staged
 *   [1,0,0] -> deleted, staged
 */
function mapStatusMatrixRow(head, workdir, stage) {
  if (head === 1 && workdir === 1 && stage === 1) return null; // unmodified — omit
  if (head === 0 && workdir === 2 && stage === 0) return 'untracked';
  if (head === 0 && workdir === 2 && (stage === 2 || stage === 3)) return 'added';
  if (head === 0 && workdir === 0 && stage === 0) return null; // deleted from stage before ever committed — omit
  if (head === 1 && workdir === 2) return 'modified'; // covers stage 1, 2, or 3
  if (head === 1 && workdir === 0) return 'deleted';
  if (head === 1 && workdir === 1 && stage !== 1) return 'added'; // staged, content matches HEAD after edits reverted
  return 'modified'; // fallback for any other combination (e.g. conflict states)
}

// --- Staging & committing ---

export async function stageFile(workspaceUri, filepath) {
  const { fs, dir } = getGitContext(workspaceUri);
  await git.add({ fs, dir, filepath });
}

export async function unstageFile(workspaceUri, filepath) {
  const { fs, dir } = getGitContext(workspaceUri);
  await git.resetIndex({ fs, dir, filepath });
}

export async function stageAll(workspaceUri, filepaths) {
  const { fs, dir } = getGitContext(workspaceUri);
  for (const filepath of filepaths) {
    await git.add({ fs, dir, filepath });
  }
}

export async function commit(workspaceUri, { message, authorName, authorEmail }) {
  const { fs, dir } = getGitContext(workspaceUri);
  const sha = await git.commit({
    fs,
    dir,
    message,
    author: {
      name: authorName || 'CodeForge User',
      email: authorEmail || 'user@codeforge.local',
    },
  });
  return sha;
}

// --- Branches ---

export async function getCurrentBranch(workspaceUri) {
  const { fs, dir } = getGitContext(workspaceUri);
  try {
    const branch = await git.currentBranch({ fs, dir, fullname: false });
    return branch || null; // null = detached HEAD
  } catch (err) {
    return null;
  }
}

export async function listBranches(workspaceUri) {
  const { fs, dir } = getGitContext(workspaceUri);
  return git.listBranches({ fs, dir });
}

export async function createBranch(workspaceUri, branchName, { checkout = true } = {}) {
  const { fs, dir } = getGitContext(workspaceUri);
  await git.branch({ fs, dir, ref: branchName, checkout });
}

/**
 * Checks out a branch and syncs the resulting working-tree changes back
 * to the real SAF workspace. Returns the list of file paths that were
 * updated so the caller can invalidate the right Explorer/editor state.
 */
export async function checkoutBranch(workspaceUri, branchName) {
  const { fs, dir } = getGitContext(workspaceUri);

  // Diff the file list between the current HEAD and the target branch
  // BEFORE checkout, so we know exactly which paths changed and only
  // sync those back to SAF rather than re-mirroring the entire tree.
  const beforeStatus = await git.statusMatrix({ fs, dir });
  const beforeFiles = new Map(beforeStatus.map((row) => [row[0], row]));

  await git.checkout({ fs, dir, ref: branchName });

  const afterStatus = await git.statusMatrix({ fs, dir });
  const changedPaths = afterStatus
    .filter((row) => {
      const before = beforeFiles.get(row[0]);
      return !before || before[2] !== row[2]; // workdir column differs
    })
    .map((row) => row[0]);

  const syncResult = await syncFromGitFS(workspaceUri, changedPaths);
  return syncResult;
}

// --- History & diff support ---

export async function getCommitHistory(workspaceUri, { depth = 50 } = {}) {
  const { fs, dir } = getGitContext(workspaceUri);
  try {
    const commits = await git.log({ fs, dir, depth });
    return commits.map((c) => ({
      oid: c.oid,
      message: c.commit.message,
      authorName: c.commit.author.name,
      authorEmail: c.commit.author.email,
      timestamp: c.commit.author.timestamp * 1000,
    }));
  } catch (err) {
    return []; // no commits yet
  }
}

/**
 * Reads a file's content as it existed at a specific commit, used by
 * the diff viewer to compare working-tree content against HEAD (or any
 * historical commit) without needing a checkout.
 */
export async function readFileAtCommit(workspaceUri, filepath, oid) {
  const { fs, dir } = getGitContext(workspaceUri);
  try {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath });
    return new TextDecoder('utf-8').decode(blob);
  } catch (err) {
    return ''; // file didn't exist at that commit (e.g. newly added file)
  }
}

export async function getHeadCommitOid(workspaceUri) {
  const { fs, dir } = getGitContext(workspaceUri);
  try {
    return await git.resolveRef({ fs, dir, ref: 'HEAD' });
  } catch (err) {
    return null;
  }
}

// --- Remote operations ---

export async function push(workspaceUri, { remote = 'origin', branch, onAuth } = {}) {
  const { fs, dir } = getGitContext(workspaceUri);
  return git.push({ fs, http, dir, remote, ref: branch, onAuth });
}

export async function pull(workspaceUri, { remote = 'origin', branch, authorName, authorEmail, onAuth } = {}) {
  const { fs, dir } = getGitContext(workspaceUri);
  await git.pull({
    fs,
    http,
    dir,
    remote,
    ref: branch,
    author: { name: authorName || 'CodeForge User', email: authorEmail || 'user@codeforge.local' },
    onAuth,
  });

  // After a pull, the whole tree may have shifted arbitrarily (unlike a
  // branch checkout where we can diff before/after cheaply against a
  // known prior state) — re-sync everything back to SAF to guarantee
  // correctness, accepting the cost of a full walk for this less
  // frequent operation.
  const matrix = await git.statusMatrix({ fs, dir });
  const allPaths = matrix.map((row) => row[0]);
  return syncFromGitFS(workspaceUri, allPaths);
}

export async function addRemote(workspaceUri, name, url) {
  const { fs, dir } = getGitContext(workspaceUri);
  await git.addRemote({ fs, dir, remote: name, url });
}

export async function listRemotes(workspaceUri) {
  const { fs, dir } = getGitContext(workspaceUri);
  return git.listRemotes({ fs, dir });
}
