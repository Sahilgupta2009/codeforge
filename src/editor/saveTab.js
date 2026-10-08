import { FS } from '../filesystem/FileSystemRouter';
import { useEditorStore } from '../state/useEditorStore';
import { formatDocument } from './formatDocument';

/**
 * saveTab.js
 * ----------
 * The single real implementation of "write a tab's content to disk and
 * mark it saved." Before Part 11 this logic was duplicated near-
 * identically in both commandContext.js (Ctrl+S / Save All / Command
 * Palette) and EditorPane.js (the toolbar's save button) — this module
 * is the one place it lives now, with both of those call sites and the
 * new auto-save subscriber (autoSave.js) calling through it.
 *
 * Deliberately NOT a Zustand action itself (useEditorStore only holds
 * state + pure reducers) — this needs to await a real async FS write
 * and show a toast on failure, which is orchestration, not state.
 */

/**
 * Writes one tab's current content to its real backing file via
 * FS.writeFile (SAF or sandbox, whichever the URI resolves to), applies
 * trim-trailing-whitespace-on-save and/or full formatOnSave (Part 11) if
 * enabled, and marks the tab saved in useEditorStore on success. No-ops
 * if the tab is falsy or already clean, so callers can call this
 * unconditionally on a timer/focus event without checking isDirty
 * themselves first.
 *
 * When `format` is provided and actually changes the content (see
 * formatDocument.needsFormatting), the tab's LIVE editor content is
 * updated too via updateTabContent — not just the on-disk bytes —
 * so the editor never silently shows different text than what was just
 * written to disk. trimTrailingWhitespace is a no-op when `format` is
 * provided, since formatDocument already strips trailing whitespace as
 * part of its own pass; the two are not run redundantly.
 *
 * @param {{paneId: string, tab: object, trimTrailingWhitespace?: boolean, format?: {tabSize: number, insertSpaces: boolean}}} args
 * @returns {Promise<{saved: boolean, error?: Error}>}
 */
export async function writeTabToDisk({ paneId, tab, trimTrailingWhitespace, format }) {
  if (!tab || !tab.isDirty) return { saved: false };

  try {
    let content = tab.content;
    if (format) {
      content = formatDocument(content, format);
    } else if (trimTrailingWhitespace) {
      content = content
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n');
    }

    await FS.writeFile(tab.uri, content);

    if (content !== tab.content) {
      // Keep the live editor buffer in sync with what was actually
      // written — updateTabContent recomputes isDirty by comparing
      // against savedContent, so this alone would leave the tab dirty
      // again; markTabSaved right after re-syncs savedContent to match.
      useEditorStore.getState().updateTabContent(paneId, tab.id, content);
    }
    useEditorStore.getState().markTabSaved(paneId, tab.id);
    return { saved: true };
  } catch (err) {
    return { saved: false, error: err };
  }
}

/**
 * Saves every dirty tab across every pane. Used by "Save All" (Part 4)
 * and by auto-save's afterDelay/onFocusChange modes (Part 11) — both
 * want the exact same "save whatever is dirty right now" behavior, just
 * triggered differently (a keybinding vs. a timer vs. an AppState
 * event).
 *
 * @param {{trimTrailingWhitespace?: boolean, format?: {tabSize: number, insertSpaces: boolean}}} args
 * @returns {Promise<{savedCount: number, failures: Array<{tab: object, error: Error}>}>}
 */
export async function writeAllDirtyTabsToDisk({ trimTrailingWhitespace, format }) {
  const panes = useEditorStore.getState().panes;
  let savedCount = 0;
  const failures = [];

  for (const pane of panes) {
    for (const tab of pane.tabs) {
      if (!tab.isDirty) continue;
      const result = await writeTabToDisk({ paneId: pane.id, tab, trimTrailingWhitespace, format });
      if (result.saved) savedCount++;
      else if (result.error) failures.push({ tab, error: result.error });
    }
  }

  return { savedCount, failures };
}

export default { writeTabToDisk, writeAllDirtyTabsToDisk };
