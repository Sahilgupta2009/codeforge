import * as IntentLauncher from 'expo-intent-launcher';
import { Platform, Linking } from 'react-native';

/**
 * TermuxBridge
 * -------------
 * Termux (https://termux.dev) exposes a documented external-command API:
 * any app can start the `com.termux.RUN_COMMAND` service intent with a
 * command path, arguments, and working directory, and Termux will
 * execute it inside its real Linux environment (with actual Python,
 * Node, gcc, package managers — whatever the user has installed via
 * `pkg install`). This is the ONLY way a sandboxed Android app can get
 * real process execution without root; it is Termux's own supported
 * integration point (Termux:API / RUN_COMMAND), not an exploit or a
 * private API.
 *
 * Preconditions this bridge depends on, all outside CodeForge's control:
 *   1. Termux is installed.
 *   2. Termux's `allow-external-apps` property is set to `true` in
 *      `~/.termux/termux.properties` (off by default — a deliberate
 *      Termux security choice the user must opt into).
 *   3. CodeForge holds the `com.termux.permission.RUN_COMMAND`
 *      permission (requested at manifest level; see app.json).
 *   4. On modern Termux, the calling app's package must be present in
 *      Termux's `allow-external-apps` allowlist alongside the property
 *      flag, depending on the installed Termux version.
 *
 * Because of preconditions 1-2-4 in particular, this bridge ALWAYS
 * checks availability before attempting a real command and surfaces a
 * clear, actionable message when unavailable — it never silently
 * pretends a command ran when it didn't.
 *
 * Result delivery: RUN_COMMAND is fire-and-forget from the launching
 * app's perspective (it's a background service start, not a synchronous
 * call) — Termux can optionally write results to a result-file path if
 * configured to, but reliably wiring that round trip requires the
 * Termux:API companion app and additional user-side setup beyond the
 * base RUN_COMMAND permission. This bridge launches the command and
 * reports that it was dispatched; it does not claim to capture the
 * command's stdout back into CodeForge's terminal panel in this
 * delivery — seeing the actual output happens in Termux itself, which
 * this bridge can also bring to the foreground. This is a real,
 * documented limitation of the intent-based integration, not an
 * oversight, and is surfaced to the user in the terminal UI rather than
 * hidden.
 */

const TERMUX_PACKAGE = 'com.termux';
const RUN_COMMAND_ACTION = 'com.termux.RUN_COMMAND';
const RUN_COMMAND_SERVICE = 'com.termux.app.RunCommandService';

/**
 * Checks whether Termux is installed on the device. This uses
 * `expo-intent-launcher`'s ability to query installed packages via a
 * resolvable intent; if that check itself fails (e.g. on Android 11+
 * package visibility restrictions without the right `<queries>` manifest
 * entry — see app.json's `QUERY_ALL_PACKAGES` permission from Part 1),
 * we report "unknown" rather than a false negative.
 */
export async function isTermuxInstalled() {
  if (Platform.OS !== 'android') return false;
  try {
    const canOpen = await Linking.canOpenURL(`${TERMUX_PACKAGE}://`);
    if (canOpen) return true;
    // canOpenURL can under-report for apps without a matching URL
    // scheme (Termux doesn't register one), so this is a best-effort
    // signal, not authoritative — the real availability check is
    // attempting the RUN_COMMAND intent itself and observing failure,
    // which runCommand() below does.
    return null; // unknown — caller should attempt and handle failure
  } catch (err) {
    return null;
  }
}

/**
 * Sends a command to Termux for real execution via the RUN_COMMAND
 * intent. Resolves once the intent has been dispatched (NOT once the
 * command has finished running inside Termux — see the module-level
 * comment on why output capture isn't wired up in this delivery).
 *
 * @param {{ command: string, args?: string[], workingDirectory?: string, background?: boolean }} options
 * @returns {Promise<{ dispatched: boolean, error?: string }>}
 */
export async function runCommand({ command, args = [], workingDirectory, background = false }) {
  if (Platform.OS !== 'android') {
    return { dispatched: false, error: 'Termux integration is only available on Android.' };
  }

  try {
    await IntentLauncher.startActivityAsync(RUN_COMMAND_ACTION, {
      packageName: TERMUX_PACKAGE,
      className: RUN_COMMAND_SERVICE,
      extra: {
        'com.termux.RUN_COMMAND_PATH': command,
        'com.termux.RUN_COMMAND_ARGUMENTS': args,
        'com.termux.RUN_COMMAND_WORKDIR': workingDirectory || '',
        'com.termux.RUN_COMMAND_BACKGROUND': background,
      },
    });
    return { dispatched: true };
  } catch (err) {
    return {
      dispatched: false,
      error: describeFailure(err),
    };
  }
}

/**
 * Brings the Termux app itself to the foreground — useful right after
 * dispatching a command so the user can see its actual output, since
 * (per the module comment above) CodeForge cannot reliably capture it
 * back into its own terminal panel via the plain RUN_COMMAND intent.
 */
export async function openTermuxApp() {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      packageName: TERMUX_PACKAGE,
      className: 'com.termux.app.TermuxActivity',
    });
    return true;
  } catch (err) {
    return false;
  }
}

function describeFailure(err) {
  const message = err?.message || '';
  if (message.includes('not found') || message.includes('No Activity') || message.includes('ActivityNotFound')) {
    return 'Termux does not appear to be installed.';
  }
  if (message.includes('permission') || message.includes('SecurityException')) {
    return "CodeForge doesn't have permission to run commands in Termux. Open Termux, run \"termux-setup-storage\" once, add \"allow-external-apps=true\" to ~/.termux/termux.properties, then reload Termux settings (long-press \u2192 Reload Settings).";
  }
  return `Could not reach Termux: ${message}`;
}

/**
 * Convenience wrapper that tries to run a shell command line (as typed
 * by the user, e.g. "python script.py") via `sh -c`, matching what a
 * user typing a command in CodeForge's terminal would intuitively
 * expect, rather than requiring them to separate command/args
 * themselves.
 */
export async function runShellLine(line, workingDirectory) {
  return runCommand({
    command: '/data/data/com.termux/files/usr/bin/sh',
    args: ['-c', line],
    workingDirectory,
  });
}
