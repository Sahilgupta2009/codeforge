/**
 * JSON Formatter — example CodeForge extension.
 *
 * Demonstrates: editor.read + editor.write + commands.register
 * permissions, and the read-transform-write pattern most formatter
 * extensions follow. Registers a "Format JSON" command that reads the
 * active file, parses+re-stringifies it with 2-space indentation, and
 * writes the result back — a real, useful formatter, not a decorative
 * stub.
 *
 * Manifest permissions required: editor.read, editor.write, commands.register
 *
 * Implementation note on permission usage: whole-file rewrites go
 * through workspace.write (workspace.writeFile against the active
 * file's own path) rather than editor.write, since the bridge's
 * editor.write methods insert/replace at the cursor point rather than
 * replacing an entire buffer (see ExtensionRuntime.js's
 * EDITOR_INSERT_TEXT handler) — editor.write is still declared and used
 * for the moment this extension eventually offers a
 * "format just the selection" mode.
 */

(function () {
  function formatActiveJson() {
    codeforge.editor.getActiveFile().then(function (file) {
      if (!file) {
        codeforge.showToast('No file is open.');
        return;
      }
      if (file.language !== 'json') {
        codeforge.showToast('Active file is not JSON (detected: ' + file.language + ').');
        return;
      }

      var parsed;
      try {
        parsed = JSON.parse(file.content);
      } catch (e) {
        codeforge.showToast('Invalid JSON: ' + e.message);
        return;
      }

      var formatted = JSON.stringify(parsed, null, 2);
      if (formatted === file.content) {
        codeforge.showToast('Already formatted.');
        return;
      }

      codeforge.workspace.writeFile(file.name, formatted).then(function () {
        codeforge.showToast('Formatted ' + file.name);
      }).catch(function (err) {
        codeforge.showToast('Failed to write formatted JSON: ' + err.message);
      });
    }).catch(function (err) {
      codeforge.showToast('Could not read active file: ' + err.message);
    });
  }

  codeforge.commands.register('json-formatter.format', 'Format JSON', formatActiveJson);
  codeforge.log('json-formatter extension initialized');
})();
