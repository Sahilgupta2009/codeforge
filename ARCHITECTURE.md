# CodeForge — Architecture

CodeForge is a mobile-first code editor for Android, built with React Native
(Expo) and Material 3 design, structured as a set of loosely-coupled
subsystems that all read/write through a single File System abstraction.

## Why this structure

Every feature in an IDE — the editor, git, search, the terminal, previews —
ultimately does one thing: reads and writes files, and reacts to what's on
disk. So the File System layer (`src/filesystem`) is the foundation
everything else is built on. It wraps Android's Storage Access Framework
(SAF) behind a single interface so that no other module needs to know
whether a file lives under SAF, in-app sandbox storage, or (for git objects)
an in-memory filesystem.

```
┌─────────────────────────────────────────────────────────┐
│                        UI Screens                        │
│   Editor · Explorer · Terminal · Git · Search · AI · ... │
└───────────────┬───────────────────────────┬──────────────┘
                │                           │
      ┌─────────▼─────────┐       ┌─────────▼─────────┐
      │   Zustand Stores    │       │   Service Layer    │
      │ (editor, workspace,  │◄─────►│ (git, search, ai,  │
      │  tabs, settings)     │       │  terminal, ext.)    │
      └─────────┬─────────┘       └─────────┬─────────┘
                │                           │
                └─────────────┬─────────────┘
                              │
                  ┌───────────▼───────────┐
                  │   FileSystem Layer      │
                  │  (SAF + sandbox + FS     │
                  │   event bus)            │
                  └───────────┬───────────┘
                              │
                  ┌───────────▼───────────┐
                  │  Android SAF / Storage  │
                  └─────────────────────────┘
```

## Folder structure

```
src/
  screens/          Top-level screens (Editor, Explorer, Settings, etc.)
  components/        Reusable UI building blocks (buttons, dialogs, sheets)
  editor/            Code editor: tabs, syntax highlight, folding, minimap
  filesystem/        SAF abstraction, sandbox FS, file watcher / event bus
  git/               isomorphic-git wrapper, diff viewer, commit history UI
  terminal/          Virtual JS terminal + Termux intent bridge
  extensions/        Plugin API, sandboxed runtime, marketplace UI
  ai/                AI assistant panel, provider adapters, prompt templates
  search/            Global + regex search, replace-across-files
  preview/           HTML/Markdown/Image/PDF preview renderers
  settings/          Settings screens + persisted settings store
  state/             Zustand stores shared across modules
  theme/             Material 3 theme tokens (light/dark), typography
  navigation/        React Navigation stacks/drawers
  utils/             Cross-cutting helpers (debounce, path utils, etc.)
  types/             Shared TypeScript-style JSDoc typedefs (plain JS project)
```

## State management

We use **Zustand** rather than Redux: IDE state (open tabs, cursor
positions, folded ranges, panel layout) is highly localized and doesn't need
Redux's ceremony. Each store is a thin, typed slice:

- `useWorkspaceStore` — active workspace root, recent projects, SAF URIs
- `useEditorStore` — open tabs, active tab, cursor/selection, split layout
- `useSettingsStore` — persisted via MMKV, all user preferences
- `useGitStore` — repo status, branch, staged files
- `useTerminalStore` — terminal sessions/tabs
- `useExtensionStore` — installed/enabled extensions

Stores are intentionally kept separate rather than combined into one giant
store, so any given screen only subscribes to (and re-renders on) the slice
it actually needs — important for scroll/typing performance on mid-range
Android hardware.

## The FileSystem abstraction

`src/filesystem/FileSystemProvider.js` defines a single interface:

```js
{
  listDirectory(uri) => [{ name, uri, isDirectory, size, modifiedAt }]
  readFile(uri) => string
  writeFile(uri, content) => void
  createFile(parentUri, name) => uri
  createDirectory(parentUri, name) => uri
  rename(uri, newName) => uri
  move(uri, newParentUri) => uri
  copy(uri, destParentUri) => uri
  delete(uri) => void
  stat(uri) => { size, modifiedAt, isDirectory }
}
```

Two concrete implementations satisfy this interface:

- `SAFFileSystem` — backed by `expo-file-system`'s SAF module for
  user-opened project folders anywhere on the device.
- `SandboxFileSystem` — backed by the app's private sandbox storage, used
  for extension data, AI conversation logs, and app config.

All file mutations go through `FileSystemEventBus`, a simple pub/sub, so the
File Explorer, open editor tabs, and the Git status view all stay in sync
without polling.

## Performance strategy (thousands of files)

- The File Explorer virtualizes directory trees (`FlashList`-style windowed
  rendering) and lazy-loads directory children only when expanded —
  directories are never eagerly walked recursively.
- Global search streams results incrementally and is worker-batched (see
  Part 5) rather than blocking the UI thread.
- The editor only tokenizes/highlights the visible viewport (+ a small
  overscan buffer), not the whole file, using a line-windowed renderer (see
  Part 3).
- Large files (>2MB) open in a reduced-feature "large file mode" (no
  minimap, throttled highlighting) rather than degrading the whole app.

## Build & run (no PC required)

This project is built for **EAS Build**, Expo's cloud build service, so it
can be built entirely from Replit/Termux/Acode without a local Android SDK.
Full instructions are in `BUILD.md`.
