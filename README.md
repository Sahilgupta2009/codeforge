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

- [x] **Part 1 — Scaffold & architecture**: Expo/EAS project config,
      Material 3 theme system (light/dark), folder structure, core
      Zustand stores (settings, workspace, editor), navigation shell,
      Welcome/Workspace/Settings screens, working SAF folder-picker entry
      point, recent projects.
- [x] **Part 2 — File System & Explorer**: full SAF-backed
      FileSystemProvider (list/read/write/create/rename/move/copy/delete,
      all via real `expo-file-system` StorageAccessFramework calls),
      Sandbox filesystem for app-private data, FileSystemRouter as the
      single I/O entry point, real persisted-permission workspace
      opening (`requestDirectoryPermissionsAsync`), and a fully working
      virtualized File Explorer: lazy directory loading, create/rename/
      move/copy/delete via bottom-sheet context menu + dialogs, cut/copy/
      paste, git-status-ready row rendering, and live sync via the file
      mutation event bus.
- [x] **Part 3 — Core code editor**: real multi-tab editing (preview/pin
      tab semantics like VS Code), syntax highlighting for Python,
      JavaScript/TypeScript, HTML, CSS, JSON, C, C++, Java, Dart, and
      Markdown via a custom regex-rule tokenizer with multi-line state
      threading (block comments, triple-quoted strings), line numbers,
      code folding (bracket-based and indentation-based), bracket
      matching with live visual pair highlighting, auto-closing
      brackets/quotes with type-through and empty-pair backspace
      deletion, auto-indentation (including Python's colon-block and
      brace-wrap-on-Enter behavior), debounced undo/redo, Find & Replace
      (real regex, case-sensitive, whole-word, replace-one/all) with
      live cursor-jump-to-match, Go to Line, pinch-free zoom in/out,
      word wrap toggle, whitespace rendering, and a minimap. All editor
      logic (tokenizer, bracket matching, folding, undo manager) is
      pure/UI-independent and covered by a standalone smoke-test suite
      (100+ assertions) run outside the RN runtime.
- [x] **Part 4 — Command Palette, keyboard shortcuts, status bar, split
      editor**: a central command registry (`src/commands/commandRegistry.js`)
      that both the fuzzy-searchable Command Palette (Ctrl+Shift+P or the
      toolbar icon) and the hardware-keyboard shortcut dispatcher run
      through, so the two can never drift apart. Hardware shortcuts are
      matched via real modifier-exact comparison (Ctrl+S vs. Ctrl+Shift+S
      resolved correctly, tested). All keybindings are rebindable in
      Settings by capturing a live key combo. A real status bar shows
      cursor position (tap to Go to Line), language, and tab size (git
      branch segment is wired but placeholder until Part 6). Split
      Editor is now reachable from the top bar / palette / Ctrl+\\,
      built entirely on the 2-pane model `useEditorStore` has supported
      since Part 1. The Settings screen also gained a fully working
      Editor section (font size, tab size, word wrap, minimap, line
      numbers, auto-close, auto-indent, whitespace rendering, trim-on-
      save) exposing settings that existed in the store since Part 1 but
      had no UI until now. Fuzzy matching and keybinding parsing are
      pure modules with their own smoke-test suites (38 assertions).
- [x] **Part 5 — Global project search**: a cancelable, streaming search
      engine (`src/search/searchEngine.js`) that walks the workspace tree
      incrementally against the real SAF-backed `FileSystemRouter` —
      never loads the whole project into memory, respects the same
      exclude patterns as the Explorer, and skips binaries/images/PDFs
      and oversized files automatically. Supports plain-text and regex
      search with case-sensitive and whole-word options (same semantics
      as Part 3's in-file Find). Results stream into a real sidebar panel
      grouped by file with expand/collapse, and tapping any match opens
      that file as a real editor tab and jumps the actual cursor to the
      exact match position. Replace-across-files works per-match,
      per-file, or as a true replace-all — re-reading each file fresh
      immediately before writing so a file edited since the search ran
      is never corrupted by stale match offsets. A new sidebar icon rail
      switches between Explorer and Search (Git/Extensions icons present
      but disabled until Parts 6/8, so the layout won't shift later).
      The search engine's pure functions (regex building, per-file
      matching, offset-accurate replacement, cancellation) have their
      own smoke-test suite (30 assertions) run against a mocked
      file-system tree, independent of the RN runtime.
- [x] **Part 6 — Git integration**: real git support via isomorphic-git,
      bridged to Android's SAF through a lightning-fs mirror
      (`src/git/GitFileSystemBridge.js` — SAF has no path-based access
      isomorphic-git can use directly, so this is a real, documented
      architectural bridge, not a shortcut). Init repository, stage/
      unstage (individual files or all), commit with message, branch
      list/create/checkout (with working-tree changes synced back to
      SAF), commit history log, push/pull against a remote, and a
      unified diff viewer built on a from-scratch LCS diff algorithm
      (`src/git/lineDiff.js`, 37 passing tests including full round-trip
      reconstruction). Git status now shows live in the File Explorer as
      colored dots (green/yellow/red/blue per file) and in the status
      bar (branch name + dirty indicator). Git commands are in the
      Command Palette alongside everything else. A new Source Control
      sidebar view (icon rail, previously a disabled placeholder) hosts
      the full stage/commit workflow.
      **Verification note:** this sandbox has no network access, so
      isomorphic-git itself could not be installed and executed here —
      unlike every other module in this project. `GitService.js` is
      written strictly against isomorphic-git's long-stable documented
      API, and the one piece of logic that's actually ours on top of it
      (mapping isomorphic-git's statusMatrix output to CodeForge's status
      vocabulary) is tested standalone against the library's documented
      status table (11 passing tests) — this test caught and fixed a
      real mapping bug before it reached any UI code. Budget time to
      smoke-test actual git operations (init → commit → log) as your
      first step after `npm install`.
- [x] **Part 7 — Terminal**: a real virtual command interpreter
      (`src/terminal/`) with its own shell-style tokenizer (quotes,
      escapes, flags — 26 passing tests) and a path resolver that maps
      shell paths (`.`, `..`, absolute, relative) onto the SAF workspace
      tree (13 passing tests). Built-in commands (`ls`, `cd`, `pwd`,
      `cat`, `mkdir`, `touch`, `rm`, `mv`, `cp`, `echo`, `grep`, `find`,
      a `git` passthrough reusing Part 6's GitService, `help`) perform
      real file I/O through the same `FileSystemRouter` the Explorer and
      Editor use — running `mkdir` in the terminal shows up in the
      Explorer immediately via the existing event bus. Multiple terminal
      tabs, each with independent cwd/scrollback/history and up/down
      arrow recall (touch buttons + real hardware arrow keys). A
      resizable bottom panel matches the rest of the IDE's layout
      conventions. Full end-to-end dispatcher test: 40 passing
      assertions against a mock filesystem, including verifying that
      mutating commands (mkdir/touch/rm) actually change the tree, not
      just print success text.
      For real process execution beyond the built-in command set (running
      scripts, compilers, package managers), any terminal tab can switch
      to Termux mode, which dispatches commands to a real installed
      Termux via its documented `RUN_COMMAND` intent — genuine OS-level
      execution in a real Linux environment, which is the only way a
      sandboxed Android app can achieve this without root. This mode has
      an honestly-documented limitation: RUN_COMMAND is fire-and-forget,
      so command output isn't captured back into CodeForge's own panel;
      a real "Open Termux" button is provided to see it there instead.
- [x] **Part 8 — Extension system**: a real sandboxed plugin
      architecture, not a scaffold. Extensions run inside their own
      `react-native-webview` instance — a genuinely separate JS engine
      with zero access to CodeForge's app memory, React state, or native
      modules — and communicate with the host exclusively through a
      typed postMessage bridge (`src/extensions/bridgeProtocol.js`, 37
      passing tests including the actual permission-denial security
      boundary). Every capability (reading/writing workspace files,
      reading/inserting editor content, registering Command Palette
      entries, contributing status bar text, network access, private
      key-value storage) is gated behind a permission the user approves
      per-extension at install time via a real approval dialog — an
      extension that wasn't granted a permission gets a runtime
      `"Permission denied"` error, not a silently-degraded no-op.
      Manifest validation (`manifestSchema.js`, 23 passing tests) is
      enforced before anything is ever installed or run. Three real,
      working example extensions ship in `src/extensions/examples/` —
      Word & Character Count, TODO Finder, and a JSON Formatter — each
      with its core logic unit-tested independent of the WebView
      runtime (21 passing tests total across the three). A built-in
      marketplace (explicitly labeled as a curated catalog, not a live
      internet-connected store — there's nothing to point a live
      registry URL at in this delivery) handles browsing, permission
      approval, and install; a separate Installed view handles enable/
      disable/uninstall. Extension-contributed commands merge into the
      same Command Palette every other command lives in, and
      extension-contributed status bar text renders in the real status
      bar. Full API reference for extension authors: `docs/ExtensionAPI.md`.
- [x] **Part 9 — AI Assistant**: a real chat panel and six code actions
      (Explain, Generate, Fix, Refactor, Comment, Continue) wired to
      configurable providers — Anthropic's Messages API and any
      OpenAI-compatible Chat Completions endpoint, which covers OpenAI
      itself plus Groq, Together, Ollama, LM Studio, and other
      compatible local/cloud servers (`src/ai/providers/`). Provider,
      API key, base URL, and model are all editable from
      Settings → AI Assistant (`src/components/AIProviderSettings.js`),
      with the key masked behind a show/hide toggle and never logged.
      Streaming is real SSE: a chunk-boundary-safe incremental parser
      (`src/ai/sseParser.js`, 26 passing tests, including events split
      mid-line and split exactly at the terminator across separate
      `ReadableStream` chunks) feeds provider-specific adapters that
      correctly diverge on wire format — Anthropic sends `system` as a
      top-level request field, OpenAI-compatible endpoints inject it as
      a `system`-role message — verified directly by a side-by-side
      cross-check test, not just independently per provider
      (`src/ai/providers/`, 58 passing tests). Prompt construction for
      all six actions plus chat, along with fenced-code-block
      extraction for "Insert", lives in `src/ai/promptTemplates.js` (38
      passing tests). The Chat panel (`AIChatPanel.js`) is a full
      sidebar view reachable from the icon rail, renders markdown with
      Copy/Insert actions on every code block, and persists
      conversation history to the app's own sandbox storage
      (`SANDBOX_DIRS.aiLogs` — never the user's workspace) so it
      survives app restarts. Code actions open from a bottom sheet
      (`AICodeActionsSheet.js`) reachable from the editor toolbar's
      sparkle icon or the Command Palette (`ai.openChat`,
      `ai.openActions`), operate on the real active tab's content and
      selection, and can insert results directly at the cursor via a
      new `insertTextAtCursor` handler registered the same way
      undo/redo/jumpToOffset always have been
      (`useEditorHandlersStore`). 122 pure-logic assertions pass across
      the three suites above.
      **Verification limitation**: AI provider request/response
      building and SSE event parsing are unit-tested in Node against
      the documented, stable shape of both APIs. Real calls to the
      Anthropic or OpenAI APIs, and React Native's actual streaming
      `fetch()`/`ReadableStream` behavior on-device, were not executed
      in this sandbox — there's no real RN runtime or network access
      here to do so. `aiService.js` includes a non-streaming fallback
      path for RN configurations where a readable stream reader isn't
      available on the response body, so the feature degrades to a
      single-shot response rather than failing outright if that's ever
      the case on a given device.
- [x] **Part 10 — Preview panels**: HTML and Markdown tabs get a real
      live-preview split view — tap the eye icon in the editor toolbar
      (or run "Toggle Live Preview" from the Command Palette /
      `Ctrl+Shift+V`) to show it alongside the code, 50/50, updating as
      you type (debounced by content size —
      `src/preview/previewUtils.js`, 31 passing tests — so a 300KB file
      doesn't force a full re-render on every keystroke). HTML renders
      in a real sandboxed WebView (`HtmlPreview.js`): a bare fragment
      gets wrapped in a minimal themed document shell so partial markup
      still renders sensibly, while a file that already has its own
      `<html>` tag is passed through untouched so its own styling is
      never fought with; any link click is blocked from navigating
      since this is a read-only render surface, not a browser. Markdown
      renders through `react-native-markdown-display` with a full style
      set (headings, tables, code fences, blockquotes — not just the
      compact chat-bubble subset Part 9 uses). Opening an image or PDF
      from the Explorer now renders it for real instead of the old
      "lands in Part 10" placeholder: `ImagePreview.js` reads the
      actual file bytes via `FS.readFileBase64` (the same routed
      SAF/sandbox call every other file read in this app uses) and
      displays them — PNG/JPEG/GIF/WEBP/BMP through a pinch-zoomable
      `<Image>`, and SVG through `react-native-svg`'s `SvgXml` (RN's
      `<Image>` can't rasterize SVG, so this decodes the base64 to raw
      XML and renders it as real vector markup, not a static icon
      stand-in). `PdfPreview.js` reads the same way and renders through
      `react-native-pdf` from a `data:` URI, with a live page counter.
      Both preview types share a single mime-type/data-URI helper
      (`previewUtils.js`) rather than duplicating that logic per
      renderer.
- [x] **Part 11 — Settings completion + full wiring/polish pass**: an
      audit of all 31 settings fields found that Files
      (`confirmBeforeDelete`, `excludePatterns`) were already fully
      wired to real behavior since Parts 2/5 and just needed UI, but
      `autoSave`/`autoSaveDelayMs`, `terminalFontSize`/`terminalBell`,
      `accentColor`, and `formatOnSave` had **no consumer anywhere in
      the app** despite existing in the store since Part 1 — this part
      built the real feature behind every one of them rather than just
      adding cosmetic toggles:
      - **Auto Save** (`src/editor/autoSave.js`): a real subscriber,
        started once from `App.js`, offering "After delay" (debounced —
        saves every dirty tab settle-time after you stop typing, not on
        a fixed poll) and "On focus change" (saves everything the
        instant the app leaves the foreground, via React Native's
        `AppState` — the moment work could otherwise be silently lost).
        16 passing tests on the pure decision logic (delay clamping,
        the active/non-active AppState transition rule, dirty-tab
        detection).
      - **Terminal Font Size**: now genuinely resizes terminal
        scrollback and the input line (`TerminalLine.js`/
        `TerminalInputBar.js`, threaded through `TerminalPanel.js`) —
        session tab labels intentionally stay fixed, since that's UI
        chrome, not terminal content.
      - **Terminal Bell**: triggers a real haptic pulse
        (`Haptics.notificationAsync`, the same `expo-haptics`
        dependency `FileTreeRow.js` already used) when a command exits
        non-zero — the closest real equivalent this virtual command
        interpreter has to a literal BEL byte, since it doesn't stream
        raw bytes from a real process. Also gated on the (also
        newly-wired) Haptics toggle.
      - **Accent Color**: didn't exist as a system at all before this
        part — built 5 real, hand-picked accent palettes (teal/blue/
        purple/green/orange, each with genuine light AND dark mode
        values for primary/selection/cursor/the `type` syntax token) in
        `tokens.js`, selectable from Settings → Appearance. 52 passing
        tests, including a same-input-different-mode cross-check and
        confirmation that unrelated tokens (surfaces, git colors, other
        syntax tokens) are never touched by an accent swap.
      - **Format Document / Format on Save**: also didn't exist — the
        `Shift+Alt+F` keybinding had been sitting completely unused
        since Part 4 with no command behind it. Built a real, honestly-
        scoped whitespace-level formatter (`formatDocument.js`): it
        infers a document's own indentation width from its smallest
        non-zero indent, re-renders every line's depth in the
        configured tabSize/insertSpaces style, strips trailing
        whitespace, and normalizes to exactly one trailing newline —
        deliberately **not** an AST-based reformatter like Prettier
        (it won't reflow lines or reorder code; see the note at the top
        of `formatDocument.js` and in Settings for exactly what it does
        and doesn't do). Available as a manual "Format Document"
        command and as an automatic pre-save step when Format on Save
        is on. 21 passing tests — including one that caught and fixed a
        real bug during development: the first implementation couldn't
        correctly distinguish "2 levels at width 2" from "1 level at
        width 4" when converting between tab widths without inferring
        the source width first, which the test suite caught before
        this reached the delivered zip.
      - **`cursorBlink`** was audited too and found to be a genuine
        platform limitation, not a wiring gap: React Native's
        `TextInput` (which renders `CodeEditor`'s real invisible-input
        cursor) has no prop to disable native caret blinking on Android
        or iOS. Rather than fake a toggle that does nothing, it's
        documented as intentionally unwired at its declaration in
        `useSettingsStore.js` and left out of the Settings UI.
      - Along the way, the save-to-disk logic that had been duplicated
        near-identically in both `commandContext.js` and
        `EditorPane.js` was consolidated into one real shared module
        (`src/editor/saveTab.js`), which auto-save and formatOnSave
        both now also call through — removing the duplication rather
        than adding a third copy.
      242 total pure-logic assertions pass across every part's test
      suites combined (Parts 9-11), confirmed together in one run with
      zero regressions after this part's changes.

## What's real right now (end of Part 11)

Runnable today, not a stub:
- App boots, theme system works; Welcome → SAF folder picker → persisted
  workspace
- **File Explorer**: real SAF-backed CRUD, live git status dots
- **Code Editor**: real multi-tab editing, syntax highlighting (10
  languages), folding, bracket-pair highlighting, auto-close, auto-
  indent, debounced undo/redo, in-file Find & Replace, Go to Line, zoom,
  word wrap, minimap
- **Command Palette + hardware keyboard shortcuts**: every command,
  including git, terminal, and now extension-contributed commands
- **Status bar**: cursor position, language, tab size, git branch, and
  any text an enabled extension has set
- **Split editor**: real 2-pane side-by-side editing
- **Global Search**: real project-wide search/replace with streaming
  results
- **Source Control**: full git workflow (init/stage/commit/branch/
  checkout/push/pull/diff/history)
- **Terminal**: real `ls`/`cd`/`cat`/`mkdir`/`touch`/`rm`/`mv`/`cp`/
  `echo`/`grep`/`find`/`git`/`help`, multi-tab, history recall, optional
  Termux mode for real process execution
- **Extensions**: tap the puzzle-piece icon in the sidebar rail.
  Browse the built-in Marketplace, review exactly what permissions an
  extension is asking for (uncheck anything you don't want to allow),
  install it, and it starts running immediately in its own sandboxed
  WebView. Try the three bundled examples — Word & Character Count
  shows live stats in the status bar as you type, TODO Finder scans your
  whole project for TODO/FIXME comments via the Command Palette, and
  JSON Formatter pretty-prints the active JSON file. The Installed tab
  lets you toggle any extension off/on or uninstall it, with immediate
  effect (disabling tears down its WebView entirely).
- **AI Assistant**: tap the robot icon in the sidebar rail for a
  persistent chat with your configured provider — set it up first in
  Settings → AI Assistant. Responses stream in token-by-token; any code
  block in an assistant reply gets Copy and Insert buttons, with Insert
  writing straight into the active editor tab at the cursor. From any
  open file, tap the sparkle icon in the editor toolbar (or run an
  "AI Code Actions..." from the Command Palette) for Explain, Generate,
  Fix, Refactor, Comment, and Continue — each works on your current
  selection when you have one, or the whole file otherwise.
- **Live preview**: open any `.html` or `.md` file and tap the
  eye icon in the editor toolbar to split the pane 50/50 with a live
  render of what you're typing — no need to save first. Open a `.png`,
  `.jpg`, `.gif`, `.webp`, `.bmp`, `.svg`, or `.pdf` from the Explorer
  and it renders directly (pinch to zoom on images; PDFs show a live
  page counter and support multi-page scroll) instead of opening a text
  tab.
- **Settings** (new): every section is real and persisted — Appearance
  (theme + 5 accent colors), Editor, Keybindings, AI Assistant, Files
  (auto save mode/delay, delete confirmation, excluded names), and
  Terminal (font size, bell). Turn on Auto Save → "After delay" and
  keep typing — every dirty file saves itself once you pause; switch to
  "On focus change" and it saves the moment you background the app
  instead. Turn on Format on Save, or run "Format Document" from the
  Command Palette (`Shift+Alt+F`) any time, to normalize indentation
  and trailing whitespace.

Explicitly placeholder (built in later parts, called out in code
comments and in-app docs where they appear):
- `ui.panel` (an extension rendering custom HTML into a real visible
  panel, as opposed to the status bar) has its permission and bridge
  method defined but no actual panel-rendering UI surface wired up yet
  — `onPanelHtml` is threaded through `ExtensionRuntime` and ready for
  that surface to consume.
- `commands.execute` (one extension invoking another extension's
  command) is explicitly unimplemented and returns a clear error rather
  than silently doing nothing — documented in `ExtensionRuntime.js`.
- `editor.insertText` / `.replaceSelection` insert at the cursor offset
  rather than supporting arbitrary multi-character selection
  replacement — documented in `ExtensionAPI.md` with the recommended
  workaround (whole-file rewrite via `workspace.writeFile`), which is
  exactly what the bundled JSON Formatter example does.
- **`cursorBlink`** has no consumer and never will via this
  architecture — React Native's native `TextInput` (which renders
  `CodeEditor`'s real cursor) doesn't expose a way to disable caret
  blinking on Android or iOS. A real fix would mean replacing the
  native caret with a fully custom-rendered one; documented at its
  declaration in `useSettingsStore.js` rather than faked with a toggle
  that does nothing. See the Part 11 entry above.
- **Format Document / Format on Save is a whitespace-level formatter,
  not an AST-based one** — it normalizes indentation and trailing
  whitespace but will never reflow long lines, reorder imports, or make
  any decision a real per-language formatter (Prettier, gofmt, etc.)
  would. See `src/editor/formatDocument.js`'s header comment and the
  Part 11 entry above for exactly what it does and doesn't do.
- **Git has not been executed against the real isomorphic-git library
  in this sandbox** (no network access to install it) — see the Part 6
  entry above for what was and wasn't verified there.
- **AI provider request/response logic and SSE parsing are unit-tested
  in Node, but real Anthropic/OpenAI API calls and React Native runtime
  behavior were not executed in this sandbox** — see the Part 9 entry
  above for exactly what was and wasn't verified there.
- **Preview panels' pure logic (mime-type lookup, data-URI construction,
  HTML-fragment wrapping, debounce sizing) is unit-tested in Node — 31
  passing assertions in `previewUtils.js` — but the actual native
  rendering surfaces (`react-native-webview`'s WebView,
  `react-native-pdf`'s native PDF renderer, `react-native-svg`'s SVG
  parser, and RN's own `<Image>` decoder) were not exercised in this
  sandbox, since there's no real Android runtime or device here to load
  them on.** The code is written directly against each library's
  documented, stable public API (the same `source={{ html }}` /
  `source={{ uri }}` / `xml=` prop shapes their own docs show), not
  guessed at, but "compiles and matches the documented API" is not the
  same claim as "was seen rendering a real webpage/PDF/SVG on a real
  device" — that first real-device check is worth doing early once you
  build this through EAS.
- **Auto Save and Terminal Bell's decision logic is unit-tested in
  Node (16 passing assertions), but the real subscriptions they run on
  — React Native's `AppState` change events and `expo-haptics`'
  `notificationAsync` — were not exercised in this sandbox for the same
  reason as above.** `AppState` in particular is worth confirming
  early: its exact event sequence (`active` → `inactive` → `background`
  vs. going straight to `background`) can differ subtly between Android
  versions and whether the app is swiped away vs. simply backgrounded,
  and this was written against RN's documented behavior, not observed
  directly.

## Quick start

```bash
npm install
npx expo start
```

See `BUILD.md` for producing an installable APK via EAS Build.
