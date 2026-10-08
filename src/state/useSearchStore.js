import { create } from 'zustand';
import { buildSearchRegex, searchWorkspace, searchFileContent, applyReplacements } from '../search/searchEngine';
import { FS } from '../filesystem/FileSystemRouter';
import { FileSystemEventBus, FS_EVENTS } from '../filesystem/FileSystemEventBus';

/**
 * @typedef {Object} FileSearchResult
 * @property {string} uri
 * @property {string} name
 * @property {Array} matches
 * @property {boolean} expanded
 */

export const useSearchStore = create((set, get) => ({
  query: '',
  replacement: '',
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,

  isSearching: false,
  filesScanned: 0,
  results: [], // FileSearchResult[]
  errorMessage: null,
  hasSearched: false,

  cancelToken: null,

  setQuery: (query) => set({ query }),
  setReplacement: (replacement) => set({ replacement }),
  toggleUseRegex: () => set((s) => ({ useRegex: !s.useRegex })),
  toggleCaseSensitive: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleWholeWord: () => set((s) => ({ wholeWord: !s.wholeWord })),

  toggleFileExpanded: (uri) =>
    set((s) => ({
      results: s.results.map((r) => (r.uri === uri ? { ...r, expanded: !r.expanded } : r)),
    })),

  /**
   * Runs a fresh workspace-wide search, canceling any search already in
   * flight first. Results stream in via onFileResult so the UI shows
   * matches appearing progressively rather than waiting for the entire
   * project to finish scanning before showing anything.
   */
  runSearch: async (rootUri, excludePatterns) => {
    const state = get();

    // Cancel any prior in-flight search before starting a new one.
    if (state.cancelToken) {
      state.cancelToken.cancelled = true;
    }

    const { query, useRegex, caseSensitive, wholeWord } = state;
    if (!query || !rootUri) {
      set({ results: [], hasSearched: false, errorMessage: null });
      return;
    }

    const regex = buildSearchRegex({ query, useRegex, caseSensitive, wholeWord });
    if (!regex) {
      set({ errorMessage: 'Invalid regex pattern', results: [], isSearching: false });
      return;
    }

    const cancelToken = { cancelled: false };
    set({
      isSearching: true,
      results: [],
      filesScanned: 0,
      errorMessage: null,
      hasSearched: true,
      cancelToken,
    });

    await searchWorkspace({
      rootUri,
      regex,
      excludePatterns,
      cancelToken,
      onFileResult: (fileResult) => {
        if (cancelToken.cancelled) return;
        set((s) => ({
          results: [...s.results, { ...fileResult, expanded: true }],
        }));
      },
      onProgress: ({ filesScanned }) => {
        if (cancelToken.cancelled) return;
        set({ filesScanned });
      },
    });

    if (!cancelToken.cancelled) {
      set({ isSearching: false });
    }
  },

  cancelSearch: () => {
    const state = get();
    if (state.cancelToken) {
      state.cancelToken.cancelled = true;
    }
    set({ isSearching: false });
  },

  clearSearch: () => {
    const state = get();
    if (state.cancelToken) state.cancelToken.cancelled = true;
    set({ query: '', results: [], hasSearched: false, errorMessage: null, isSearching: false, filesScanned: 0 });
  },

  /**
   * Replaces every match in a single file and writes the result to disk.
   * Re-reads the file fresh immediately before writing (rather than
   * trusting potentially-stale in-memory match offsets from when the
   * search ran) to avoid corrupting a file that changed on disk since
   * the search completed — if the file changed, matches are re-computed
   * against the live content before applying the replacement.
   */
  replaceInFile: async (fileResult, replacement) => {
    try {
      const liveContent = await FS.readFile(fileResult.uri);
      const state = get();
      const regex = buildSearchRegex({
        query: state.query,
        useRegex: state.useRegex,
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
      });
      if (!regex) return { success: false, error: 'Invalid regex pattern' };

      const liveMatches = searchFileContent(liveContent, regex);
      if (liveMatches.length === 0) {
        // File no longer has any matches (edited since search ran) —
        // drop it from results rather than writing a no-op.
        set((s) => ({ results: s.results.filter((r) => r.uri !== fileResult.uri) }));
        return { success: true, matchesReplaced: 0 };
      }

      const newContent = applyReplacements(liveContent, liveMatches, replacement);
      await FS.writeFile(fileResult.uri, newContent);

      set((s) => ({ results: s.results.filter((r) => r.uri !== fileResult.uri) }));
      return { success: true, matchesReplaced: liveMatches.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Replaces every match across every file currently in results. Runs
   * file-by-file sequentially (not Promise.all) so that a huge replace-
   * all operation doesn't attempt hundreds of concurrent SAF writes at
   * once, which risks overwhelming the content resolver on lower-end
   * Android devices.
   */
  replaceAll: async (replacement) => {
    const state = get();
    const filesToReplace = [...state.results];
    let succeeded = 0;
    let failed = 0;

    for (const fileResult of filesToReplace) {
      const result = await get().replaceInFile(fileResult, replacement);
      if (result.success) succeeded++;
      else failed++;
    }

    return { succeeded, failed };
  },
}));

// Keep search results roughly in sync with external file mutations
// (e.g. a file matched by search gets deleted via the Explorer while
// the search panel is still open) by dropping stale entries — a full
// re-search is more correctness-guaranteeing than trying to patch
// individual results, but for a MVP-consistent UX we at least drop
// entries for files that no longer exist rather than showing dead links.
FileSystemEventBus.on(FS_EVENTS.DELETED, ({ uri }) => {
  useSearchStore.setState((s) => ({
    results: s.results.filter((r) => r.uri !== uri && !r.uri.startsWith(uri)),
  }));
});
