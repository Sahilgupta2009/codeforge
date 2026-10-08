# CodeForge Extension API

CodeForge extensions are small, sandboxed programs that run inside the
editor and can read/modify your workspace, react to editor events, add
Command Palette entries, and contribute status bar items — all through a
narrow, permission-gated API. This document is the reference for writing
one.

If you just want to see working examples, read
`src/extensions/examples/*/main.js` — they're real, runnable extensions,
not pseudocode.

## How extensions run

Every extension executes inside its own `react-native-webview` instance
— a genuinely separate JavaScript engine with **no access** to
CodeForge's app memory, React state, or native modules. The only way an
extension can affect anything outside itself is by calling the
`window.codeforge` API, which sends a message to the host app, which
checks your extension's granted permissions, performs the operation, and
sends the result back. This means:

- Extensions cannot crash the host app.
- Extensions cannot access the filesystem directly — every file
  operation goes through `codeforge.workspace.*` and is checked against
  your declared `workspace.read` / `workspace.write` permissions.
- Extensions cannot see or affect other extensions.
- If your extension throws an uncaught error, it's caught, logged, and
  the extension keeps running (or is reported as crashed if it happens
  during initial load) — it can't take down CodeForge itself.

## The manifest: `extension.json`

Every extension needs a manifest at its root:

```json
{
  "id": "yourname.your-extension",
  "name": "your-extension",
  "displayName": "Your Extension",
  "version": "1.0.0",
  "description": "One sentence describing what it does.",
  "publisher": "Your Name",
  "main": "main.js",
  "permissions": ["editor.read", "ui.statusbar"],
  "categories": ["Other"]
}
```

| Field         | Required | Notes                                                     |
| ------------- | -------- | ----------------------------------------------------------|
| `id`          | yes      | Lowercase, `.`/`_`/`-` allowed. Must be globally unique.    |
| `name`        | yes      | Short machine name.                                        |
| `displayName` | yes      | Shown in the marketplace and Installed list.                |
| `version`     | yes      | Semver, e.g. `1.0.0`.                                       |
| `main`        | yes      | Relative path to your entry file, e.g. `"main.js"`.          |
| `permissions` | no       | Array of permission strings (see below). Defaults to none.  |
| `description` | no       | Shown in the marketplace.                                   |
| `publisher`   | no       | Shown in the marketplace.                                   |
| `categories`  | no       | e.g. `["Formatters", "Themes"]`.                             |

Manifests are validated (`src/extensions/manifestSchema.js`) before an
extension can ever be installed — an invalid manifest is rejected
outright.

## Permissions

Declare only what you need — anything not declared (or not approved by
the user at install time, since they can uncheck individual permissions)
means the corresponding API calls will reject with a
`"Permission denied"` error at runtime, not silently no-op.

| Permission            | Grants                                                          |
| ---------------------- | ---------------------------------------------------------------|
| `workspace.read`       | `codeforge.workspace.listFiles`, `.readFile`                    |
| `workspace.write`      | `codeforge.workspace.writeFile`, `.createFile`, `.deleteFile`     |
| `editor.read`          | `codeforge.editor.getActiveFile`, `.getSelection`                 |
| `editor.write`         | `codeforge.editor.insertText`, `.replaceSelection`                 |
| `commands.register`    | `codeforge.commands.register` (adds a Command Palette entry)       |
| `ui.statusbar`         | `codeforge.ui.setStatusBarText`                                     |
| `ui.panel`             | `codeforge.ui.setPanelHtml` *(rendering surface still evolving)*     |
| `network`              | `codeforge.network.fetch`                                            |
| `storage`              | `codeforge.storage.get` / `.set` (your own private key-value store)    |

`codeforge.log(...)` and `codeforge.showToast(...)` never require a
permission.

## The `window.codeforge` API

Your `main.js` runs with a global `codeforge` object already available
— no imports needed.

### `codeforge.workspace`

```js
// List a directory (relative to the workspace root; omit dirPath for the root)
const entries = await codeforge.workspace.listFiles('src');
// -> [{ name, isDirectory, size }, ...]

// Read a file's text content
const content = await codeforge.workspace.readFile('src/App.js');

// Write (overwrites existing content)
await codeforge.workspace.writeFile('notes.txt', 'Hello');

// Create a new file, optionally with initial content
await codeforge.workspace.createFile('notes.txt', 'Hello');

// Delete a file
await codeforge.workspace.deleteFile('notes.txt');
```

All paths are relative to the workspace root, using `/` as the
separator, e.g. `"src/components/Button.js"`.

### `codeforge.editor`

```js
// The currently active file (or null if none is open)
const file = await codeforge.editor.getActiveFile();
// -> { name, language, content, isDirty } | null

// Cursor position and selection ranges
const sel = await codeforge.editor.getSelection();
// -> { cursor: {line, column}, selections: [...] } | null

// Insert text at the current cursor position
await codeforge.editor.insertText('// generated\n');

// React to selection/cursor changes
const unsubscribe = codeforge.editor.onSelectionChanged((payload) => {
  console.log(payload);
});

// React to the active file changing (a different tab was focused)
codeforge.editor.onActiveFileChanged((payload) => { /* ... */ });
```

**Note:** `insertText` and `replaceSelection` currently insert at the
cursor's character offset — they do not yet support replacing an
arbitrary multi-character selection range. For whole-file rewrites (like
a formatter), use `codeforge.workspace.writeFile` against the active
file's own path instead — see `examples/json-formatter/main.js` for a
complete working example of this pattern.

### `codeforge.commands`

```js
// Register a command that appears in the Command Palette
codeforge.commands.register('my-ext.doThing', 'Do The Thing', () => {
  codeforge.showToast('Did the thing!');
});
```

The handler function runs entirely within your extension's own sandbox
— when the user selects your command from the palette, CodeForge sends
an event back into your WebView and your handler runs there, just like
if the user had triggered it directly.

### `codeforge.ui`

```js
// Show text in the status bar (replaces any previous text from this extension)
await codeforge.ui.setStatusBarText('3 issues');

// Clear it
await codeforge.ui.setStatusBarText('');
```

### `codeforge.network`

```js
const response = await codeforge.network.fetch('https://api.example.com/data');
// -> { status, ok, body }  (body is always a string; JSON.parse it yourself)
```

### `codeforge.storage`

Private, per-extension key-value storage that persists across sessions.

```js
await codeforge.storage.set('lastRun', Date.now());
const lastRun = await codeforge.storage.get('lastRun');
```

### `codeforge.log` / `codeforge.showToast`

```js
codeforge.log('debug info', someValue);       // shows in the host's console
codeforge.showToast('Something happened');     // shows a toast to the user
```

## Error handling

Every `codeforge.*` call returns a Promise. Permission errors, missing
files, and other failures reject the promise with a real `Error` —
always wrap calls in `try/catch` or `.catch()`:

```js
codeforge.workspace.readFile('missing.txt')
  .then((content) => { /* ... */ })
  .catch((err) => codeforge.log('Failed: ' + err.message));
```

## Writing extension code: a compatibility note

Extension code runs inside an Android WebView, whose JavaScript engine
varies by device and Android WebView provider version. The bundled
example extensions deliberately stick to widely-supported ES5-ish syntax
(`function` instead of arrow functions in some places, `var` alongside
`let`/`const`) as a conservative baseline — modern syntax generally
works fine on current Android WebView versions, but if you want your
extension to run reliably on older devices, favor the same conservative
style.

## Testing your extension locally

There's no external packaging step in this delivery — the marketplace
installs extensions by writing their manifest + source files directly
into CodeForge's sandbox storage (see `src/extensions/ExtensionInstaller.js`).
To try your own extension during development, add it to
`src/extensions/extensionCatalog.js` and `src/extensions/exampleSources.js`
following the same pattern as the three bundled examples.
