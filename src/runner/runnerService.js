import { Buffer } from 'buffer';
import { RUNNABLE } from './languages';

/**
 * Runs source code on a Judge0-compatible server (default: the free public
 * Judge0 CE instance) and returns the real stdout/stderr/compiler output.
 *
 * Requires an internet connection. The endpoint (and optional auth token)
 * can be changed in Settings → Code Runner, e.g. to a self-hosted Judge0.
 */
export const DEFAULT_RUNNER_URL = 'https://ce.judge0.com';

const b64 = (s) => Buffer.from(s || '', 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{language: string, code: string, stdin?: string,
 *          baseUrl?: string, authToken?: string, fetchImpl?: Function,
 *          timeoutMs?: number}} opts
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, compileOutput: string,
 *                    message: string, status: string, time: string|null, memory: number|null}>}
 */
export async function runCode({
  language,
  code,
  stdin = '',
  baseUrl = DEFAULT_RUNNER_URL,
  authToken = '',
  fetchImpl = fetch,
  timeoutMs = 60000,
}) {
  const lang = RUNNABLE[language];
  if (!lang) throw new Error(`Running "${language}" files is not supported.`);

  const base = (baseUrl || DEFAULT_RUNNER_URL).replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['X-Auth-Token'] = authToken;

  let createRes;
  try {
    createRes = await fetchImpl(`${base}/submissions?base64_encoded=true&wait=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        language_id: lang.id,
        source_code: b64(code),
        stdin: b64(stdin),
      }),
    });
  } catch (err) {
    throw new Error(`Could not reach the code runner (${base}). Check your internet connection.`);
  }
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Runner rejected the request (HTTP ${createRes.status}). ${text.slice(0, 200)}`);
  }
  const { token } = await createRes.json();
  if (!token) throw new Error('Runner did not return a submission token.');

  const deadline = Date.now() + timeoutMs;
  let delay = 600;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(delay + 300, 2000);
    let res;
    try {
      res = await fetchImpl(`${base}/submissions/${token}?base64_encoded=true`, { headers });
    } catch (err) {
      continue; // transient network blip — keep polling until the deadline
    }
    if (!res.ok) continue;
    const data = await res.json();
    const statusId = data?.status?.id;
    if (statusId && statusId > 2) {
      return {
        ok: statusId === 3,
        stdout: unb64(data.stdout),
        stderr: unb64(data.stderr),
        compileOutput: unb64(data.compile_output),
        message: unb64(data.message),
        status: data.status.description || `status ${statusId}`,
        time: data.time ?? null,
        memory: data.memory ?? null,
      };
    }
  }
  throw new Error('Timed out waiting for the runner to finish.');
}

/** Flattens a runCode result into the text a terminal/output panel shows. */
export function formatRunResult(r) {
  const parts = [];
  if (r.compileOutput) parts.push(r.compileOutput.replace(/\n+$/, ''));
  if (r.stdout) parts.push(r.stdout.replace(/\n+$/, ''));
  if (r.stderr) parts.push(r.stderr.replace(/\n+$/, ''));
  if (r.message && !r.stderr) parts.push(r.message.replace(/\n+$/, ''));
  return parts.join('\n');
}
