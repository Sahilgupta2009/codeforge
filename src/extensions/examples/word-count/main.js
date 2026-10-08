/**
 * Word & Character Count — example CodeForge extension.
 *
 * Demonstrates: editor.read + ui.statusbar permissions, polling the
 * active file's content and updating a status bar segment. This is
 * genuine extension code, not a stub — it runs inside the sandboxed
 * WebView via ExtensionRuntime.js and only ever talks to the host
 * through window.codeforge, exactly like any third-party extension
 * would.
 *
 * Manifest permissions required: editor.read, ui.statusbar
 */

(function () {
  var lastContent = null;

  function countStats(text) {
    var lines = text.split('\n').length;
    var chars = text.length;
    var words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
    return { lines: lines, chars: chars, words: words };
  }

  function updateStatusBar() {
    codeforge.editor.getActiveFile().then(function (file) {
      if (!file) {
        codeforge.ui.setStatusBarText('');
        return;
      }
      if (file.content === lastContent) return; // avoid redundant bridge calls when nothing changed
      lastContent = file.content;
      var stats = countStats(file.content);
      codeforge.ui.setStatusBarText(
        stats.words + ' words, ' + stats.chars + ' chars, ' + stats.lines + ' lines'
      );
    }).catch(function (err) {
      codeforge.log('word-count: failed to read active file: ' + err.message);
    });
  }

  // Poll on a short interval rather than relying solely on
  // onActiveFileChanged/onSelectionChanged events, since content edits
  // that don't move the cursor (e.g. programmatic changes) wouldn't
  // otherwise trigger either event — polling is simple, correct, and
  // cheap at this interval for a single small status-bar computation.
  setInterval(updateStatusBar, 1500);
  updateStatusBar();

  codeforge.editor.onActiveFileChanged(function () {
    lastContent = null; // force an update on the next poll tick
    updateStatusBar();
  });

  codeforge.log('word-count extension initialized');
})();
