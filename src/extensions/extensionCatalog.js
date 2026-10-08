import { PERMISSIONS } from './manifestSchema';

/**
 * ExtensionCatalog
 * -----------------
 * CodeForge's marketplace UI needs something to browse. A real product
 * would eventually fetch this list from a hosted registry (the way VS
 * Code's marketplace or npm does), but standing up and hosting that
 * service is out of scope for an on-device app delivery — there's
 * nothing here to point a URL at. So this is a curated, built-in catalog
 * bundled with the app, containing the example extensions actually
 * shipped in src/extensions/examples/ (Part 8 ships real, working ones,
 * not placeholder listings for extensions that don't exist).
 *
 * The marketplace UI is upfront about this rather than presenting it as
 * a live store — see ExtensionMarketplace.js's header copy. Swapping
 * this module for a real `fetch()` against a hosted catalog endpoint
 * later is a contained change: everything downstream (install flow,
 * permission approval, the store) already works off manifest objects
 * shaped exactly like these, regardless of where they came from.
 */

export const CATALOG = [
  {
    manifest: {
      id: 'codeforge.word-count',
      name: 'word-count',
      displayName: 'Word & Character Count',
      version: '1.0.0',
      description: 'Shows live word, character, and line counts for the active file in the status bar.',
      publisher: 'CodeForge',
      main: 'main.js',
      permissions: [PERMISSIONS.EDITOR_READ, PERMISSIONS.UI_STATUSBAR],
      categories: ['Other'],
    },
    icon: 'text-box-outline',
    sourceDir: 'word-count',
  },
  {
    manifest: {
      id: 'codeforge.todo-highlighter',
      name: 'todo-highlighter',
      displayName: 'TODO Finder',
      version: '1.0.0',
      description: 'Scans the workspace for TODO/FIXME comments and lists them as jump-to-able Command Palette entries.',
      publisher: 'CodeForge',
      main: 'main.js',
      permissions: [PERMISSIONS.WORKSPACE_READ, PERMISSIONS.COMMANDS_REGISTER],
      categories: ['Other'],
    },
    icon: 'clipboard-check-outline',
    sourceDir: 'todo-highlighter',
  },
  {
    manifest: {
      id: 'codeforge.json-formatter',
      name: 'json-formatter',
      displayName: 'JSON Formatter',
      version: '1.0.0',
      description: 'Adds a "Format JSON" command that pretty-prints the active JSON file with 2-space indentation.',
      publisher: 'CodeForge',
      main: 'main.js',
      permissions: [PERMISSIONS.EDITOR_READ, PERMISSIONS.EDITOR_WRITE, PERMISSIONS.COMMANDS_REGISTER],
      categories: ['Formatters'],
    },
    icon: 'code-json',
    sourceDir: 'json-formatter',
  },
];

export function getCatalogEntry(extensionId) {
  return CATALOG.find((e) => e.manifest.id === extensionId) || null;
}

export function searchCatalog(query) {
  if (!query) return CATALOG;
  const lower = query.toLowerCase();
  return CATALOG.filter(
    (e) =>
      e.manifest.displayName.toLowerCase().includes(lower) ||
      e.manifest.description.toLowerCase().includes(lower) ||
      e.manifest.categories?.some((c) => c.toLowerCase().includes(lower))
  );
}
