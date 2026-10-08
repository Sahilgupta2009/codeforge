/**
 * Command Registry
 * -----------------
 * Every user-triggerable IDE action (save, find, new file, toggle
 * sidebar, split editor, ...) is registered here exactly once, with:
 *   - a unique id
 *   - a human-readable label (shown in the Command Palette)
 *   - a category (groups palette results)
 *   - a default keybinding id (looked up in useSettingsStore.keybindings)
 *   - a `run(context)` function that performs the action
 *
 * Both the Command Palette and the hardware-keyboard shortcut listener
 * dispatch through this same registry, so there is exactly one place
 * that defines "what Ctrl+S does" — no risk of the palette and the
 * keyboard shortcut silently drifting apart.
 *
 * `context` is assembled fresh at dispatch time by useCommandContext()
 * (see commandContext.js) and contains live references to the stores
 * and handlers a command might need (active tab, active pane, editor
 * handlers, navigation, etc.) — commands themselves stay pure functions
 * of (context) => void, which keeps them independently testable.
 */

/**
 * @typedef {Object} Command
 * @property {string} id
 * @property {string} label
 * @property {string} category
 * @property {string} [keybindingId]  key into useSettingsStore.keybindings
 * @property {(ctx: import('./commandContext').CommandContext) => void} run
 * @property {(ctx: import('./commandContext').CommandContext) => boolean} [isEnabled]
 */

/** @type {Command[]} */
export const COMMANDS = [
  // --- File ---
  {
    id: 'file.save',
    label: 'Save File',
    category: 'File',
    keybindingId: 'save',
    isEnabled: (ctx) => !!ctx.activeTab?.isDirty,
    run: (ctx) => ctx.saveActiveTab(),
  },
  {
    id: 'file.saveAll',
    label: 'Save All Files',
    category: 'File',
    keybindingId: 'saveAll',
    isEnabled: (ctx) => ctx.anyDirtyTabs,
    run: (ctx) => ctx.saveAllTabs(),
  },
  {
    id: 'file.newFile',
    label: 'New File',
    category: 'File',
    keybindingId: 'newFile',
    isEnabled: (ctx) => !!ctx.workspace,
    run: (ctx) => ctx.openNewFileDialog(),
  },
  {
    id: 'file.closeTab',
    label: 'Close Tab',
    category: 'File',
    keybindingId: 'closeTab',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.closeActiveTab(),
  },

  // --- Edit ---
  {
    id: 'edit.undo',
    label: 'Undo',
    category: 'Edit',
    keybindingId: 'undo',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.editorHandlers?.undo?.(),
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    category: 'Edit',
    keybindingId: 'redo',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.editorHandlers?.redo?.(),
  },
  {
    id: 'edit.find',
    label: 'Find',
    category: 'Edit',
    keybindingId: 'find',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.setFindVisible(true),
  },
  {
    id: 'edit.findReplace',
    label: 'Find and Replace',
    category: 'Edit',
    keybindingId: 'findReplace',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.setFindVisible(true, { withReplace: true }),
  },
  {
    id: 'edit.findInFiles',
    label: 'Find in Files (Global Search)',
    category: 'Edit',
    keybindingId: 'findInFiles',
    isEnabled: (ctx) => !!ctx.workspace,
    run: (ctx) => ctx.openGlobalSearch(),
  },
  {
    id: 'edit.goToLine',
    label: 'Go to Line...',
    category: 'Edit',
    keybindingId: 'goToLine',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.setGoToLineVisible(true),
  },
  {
    id: 'edit.formatDocument',
    label: 'Format Document',
    category: 'Edit',
    keybindingId: 'formatDocument',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.formatActiveTab(),
  },

  // --- View ---
  {
    id: 'view.commandPalette',
    label: 'Show Command Palette',
    category: 'View',
    keybindingId: 'commandPalette',
    run: (ctx) => ctx.openCommandPalette(),
  },
  {
    id: 'view.toggleSidebar',
    label: 'Toggle Sidebar',
    category: 'View',
    keybindingId: 'toggleSidebar',
    run: (ctx) => ctx.toggleSidebar(),
  },
  {
    id: 'view.toggleTerminal',
    label: 'Toggle Terminal',
    category: 'View',
    keybindingId: 'toggleTerminal',
    run: (ctx) => ctx.toggleTerminal(),
  },
  {
    id: 'terminal.new',
    label: 'New Terminal',
    category: 'View',
    isEnabled: (ctx) => !!ctx.workspace,
    run: (ctx) => ctx.newTerminal(),
  },
  {
    id: 'view.splitEditor',
    label: 'Split Editor Right',
    category: 'View',
    keybindingId: 'splitEditor',
    isEnabled: (ctx) => ctx.paneCount < 2,
    run: (ctx) => ctx.splitPane('horizontal'),
  },
  {
    id: 'view.closeSplit',
    label: 'Close Split Editor',
    category: 'View',
    isEnabled: (ctx) => ctx.paneCount > 1,
    run: (ctx) => ctx.closeOtherSplit(),
  },
  {
    id: 'view.togglePreview',
    label: 'Toggle Live Preview',
    category: 'View',
    keybindingId: 'togglePreview',
    isEnabled: (ctx) => ctx.activeTab && (ctx.activeTab.language === 'html' || ctx.activeTab.language === 'markdown'),
    run: (ctx) => ctx.togglePreview(),
  },
  {
    id: 'file.run',
    label: 'Run Current File',
    category: 'File',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.runFile(),
  },
  {
    id: 'view.zoomIn',
    label: 'Zoom In (Editor Font Size)',
    category: 'View',
    keybindingId: 'zoomIn',
    run: (ctx) => ctx.zoomIn(),
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom Out (Editor Font Size)',
    category: 'View',
    keybindingId: 'zoomOut',
    run: (ctx) => ctx.zoomOut(),
  },
  {
    id: 'view.toggleTheme',
    label: 'Toggle Light / Dark Theme',
    category: 'View',
    run: (ctx) => ctx.toggleTheme(),
  },

  // --- Git ---
  {
    id: 'git.showChanges',
    label: 'Show Source Control',
    category: 'Git',
    isEnabled: (ctx) => !!ctx.workspace,
    run: (ctx) => ctx.openGitPanel(),
  },
  {
    id: 'git.switchBranch',
    label: 'Switch Branch...',
    category: 'Git',
    isEnabled: (ctx) => ctx.isGitRepo,
    run: (ctx) => ctx.openBranchSwitcher(),
  },
  {
    id: 'git.viewHistory',
    label: 'View Commit History',
    category: 'Git',
    isEnabled: (ctx) => ctx.isGitRepo,
    run: (ctx) => ctx.openCommitHistory(),
  },
  {
    id: 'git.pull',
    label: 'Pull',
    category: 'Git',
    isEnabled: (ctx) => ctx.isGitRepo,
    run: (ctx) => ctx.gitPull(),
  },
  {
    id: 'git.push',
    label: 'Push',
    category: 'Git',
    isEnabled: (ctx) => ctx.isGitRepo,
    run: (ctx) => ctx.gitPush(),
  },

  // --- AI Assistant ---
  {
    id: 'ai.openChat',
    label: 'Open AI Assistant Chat',
    category: 'AI',
    run: (ctx) => ctx.openAIChat(),
  },
  {
    id: 'ai.openActions',
    label: 'AI Code Actions...',
    category: 'AI',
    isEnabled: (ctx) => !!ctx.activeTab,
    run: (ctx) => ctx.openAIActions(),
  },

  // --- Navigation ---
  {
    id: 'nav.nextTab',
    label: 'Next Tab',
    category: 'Navigate',
    keybindingId: 'nextTab',
    isEnabled: (ctx) => ctx.tabCount > 1,
    run: (ctx) => ctx.cycleTab(1),
  },
  {
    id: 'nav.prevTab',
    label: 'Previous Tab',
    category: 'Navigate',
    keybindingId: 'prevTab',
    isEnabled: (ctx) => ctx.tabCount > 1,
    run: (ctx) => ctx.cycleTab(-1),
  },
  {
    id: 'nav.openSettings',
    label: 'Open Settings',
    category: 'Navigate',
    run: (ctx) => ctx.navigation?.navigate('Settings'),
  },
  {
    id: 'nav.backToWelcome',
    label: 'Close Workspace',
    category: 'Navigate',
    run: (ctx) => ctx.closeWorkspaceAndGoHome(),
  },
];

export function getCommandById(id) {
  return COMMANDS.find((c) => c.id === id) || null;
}

export function getCommandsByCategory() {
  const byCategory = {};
  for (const cmd of COMMANDS) {
    if (!byCategory[cmd.category]) byCategory[cmd.category] = [];
    byCategory[cmd.category].push(cmd);
  }
  return byCategory;
}
