/**
 * TODO Finder — example CodeForge extension.
 *
 * Demonstrates: workspace.read + commands.register permissions,
 * recursively walking the workspace, and registering a Command Palette
 * entry that runs an async scan and reports results via a toast (a
 * fuller version could use ui.panel to render a clickable results list;
 * this keeps the example focused on the workspace-scanning pattern,
 * which is the more broadly reusable technique).
 *
 * Manifest permissions required: workspace.read, commands.register
 */

(function () {
  var TODO_PATTERN = /\b(TODO|FIXME)\b:?\s*(.*)/;
  var SKIP_DIRS = ['node_modules', '.git', 'build', 'dist', '.gradle'];
  var MAX_FILES_TO_SCAN = 500; // guard against runaway scans on huge projects

  function isProbablyTextFile(name) {
    return /\.(js|jsx|ts|tsx|py|java|c|cpp|h|hpp|dart|md|txt|json|html|css)$/i.test(name);
  }

  function walk(dirPath, results, filesScanned) {
    return codeforge.workspace.listFiles(dirPath).then(function (entries) {
      var chain = Promise.resolve();
      entries.forEach(function (entry) {
        if (SKIP_DIRS.indexOf(entry.name) !== -1) return;
        var childPath = dirPath ? dirPath + '/' + entry.name : entry.name;

        chain = chain.then(function () {
          if (filesScanned.count >= MAX_FILES_TO_SCAN) return;

          if (entry.isDirectory) {
            return walk(childPath, results, filesScanned);
          }
          if (!isProbablyTextFile(entry.name)) return;

          filesScanned.count++;
          return codeforge.workspace.readFile(childPath).then(function (content) {
            var lines = content.split('\n');
            lines.forEach(function (lineText, idx) {
              var match = lineText.match(TODO_PATTERN);
              if (match) {
                results.push({
                  file: childPath,
                  line: idx + 1,
                  kind: match[1],
                  text: match[2].trim(),
                });
              }
            });
          }).catch(function () {
            // unreadable file — skip silently, don't abort the whole scan
          });
        });
      });
      return chain;
    });
  }

  function runScan() {
    var results = [];
    var filesScanned = { count: 0 };
    codeforge.showToast('Scanning workspace for TODOs\u2026');
    walk('', results, filesScanned).then(function () {
      if (results.length === 0) {
        codeforge.showToast('No TODOs or FIXMEs found.');
        return;
      }
      var summary = results
        .slice(0, 5)
        .map(function (r) { return r.file + ':' + r.line + ' [' + r.kind + '] ' + r.text; })
        .join('\n');
      var more = results.length > 5 ? '\n\u2026and ' + (results.length - 5) + ' more' : '';
      codeforge.showToast('Found ' + results.length + ' TODO(s):\n' + summary + more);
    }).catch(function (err) {
      codeforge.showToast('Scan failed: ' + err.message);
    });
  }

  codeforge.commands.register('todo-highlighter.scan', 'Find TODOs in Workspace', runScan);
  codeforge.log('todo-highlighter extension initialized');
})();
