# CodeForge

A mobile-first code editor for Android, inspired by desktop IDE workflows —
built with React Native, Material 3, and Expo/EAS so it can be built into
a real APK with no PC, straight from Replit/Termux/Acode.

This is an **original UI and codebase** — no Microsoft assets, branding,
or copied source. Feature parity with familiar IDE workflows (tabs,
explorer, terminal, git panel, command palette) is implemented from
scratch with its own visual identity (see `ARCHITECTURE.md` and
`src/theme/tokens.js`).

> See `ARCHITECTURE.md` for the full system design and folder structure,
> and `BUILD.md` for how to compile this into an installable APK using
> EAS Build.

## Delivery plan

This project is too large for a single response, so it's being delivered
in parts. Each part adds real, working code against the state left by
prior parts — nothing here is a mock standing in for a later system.

- [x] **Part 1 — Scaffold & architecture** (this delivery): Expo/EAS
      project config, Material 3 theme system (light/dark), folder
      structure, core Zustand stores (settings, workspace, editor),
      navigation shell, Welcome/Workspace/Settings screens, working SAF
      folder-picker entry point, recent projects.
- [ ] **Part 2** — File System layer (full SAF read/write/create/rename/
      move/copy/delete) + File Explorer UI (virtualized tree, context
      menus, create/rename/move/copy/delete).
- [ ] **Part 3** — Core code editor: multi-tab editing, syntax
      highlighting (Python/JS/HTML/CSS/JSON/C/C++/Java/Dart/Markdown),
      line numbers, folding, bracket matching, auto-closing pairs,
      undo/redo, find & replace, go-to-line, zoom, word wrap, minimap.
- [ ] **Part 4** — Command palette, hardware keyboard shortcuts, status
      bar, split editor (horizontal/vertical).
- [ ] **Part 5** — Global project search (regex, replace-across-files).
- [ ] **Part 6** — Git integration (isomorphic-git): init, commit,
      branches, diff viewer, history, push/pull, status indicators.
- [ ] **Part 7** — Terminal: virtual JS terminal + Termux intent bridge.
- [ ] **Part 8** — Extension system: plugin API, sandboxed runtime,
      marketplace UI, install/enable, example extensions, API docs.
- [ ] **Part 9** — AI Assistant panel: chat, explain/generate/fix/
      refactor/comment/continue, configurable providers.
- [ ] **Part 10** — Preview panels: HTML live preview, Markdown, image,
      PDF.
- [ ] **Part 11** — Settings completion (editor/files/keybindings) +
      full wiring/polish pass.

## What's real right now (end of Part 1)

Runnable today, not a stub:
- App boots, theme system works (light/dark/system, persisted)
- Welcome screen → real SAF folder picker → workspace opens
- Recent projects list persists across app restarts (MMKV)
- Settings screen theme toggle is fully live
- Navigation flow between Welcome / Workspace / Settings

Explicitly placeholder (built in later parts, called out in code
comments where they appear):
- `WorkspaceScreen` shows a stub center panel — the real explorer/tabs/
  editor/terminal layout is Parts 2-4
- `openWorkspaceFolder` uses a generic document picker for now; Part 2
  swaps in full SAF tree-picker + persisted permissions
- `FileSystemEventBus` has final API shape but no emitters yet (Part 2
  wires emitters into actual file I/O)

## Quick start

```bash
npm install
npx expo start
```

See `BUILD.md` for producing an installable APK via EAS Build.
