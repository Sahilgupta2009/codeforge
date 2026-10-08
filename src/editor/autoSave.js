import { AppState } from 'react-native';

import { useEditorStore } from '../state/useEditorStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { writeAllDirtyTabsToDisk } from './saveTab';

/**
 * autoSave.js
 * -----------
 * Real auto-save, driven by useSettingsStore.autoSave ('off' |
 * 'afterDelay' | 'onFocusChange') and autoSaveDelayMs — both settings
 * fields existed since Part 1 but were never actually consumed anywhere
 * in the app until now. This module is that missing consumer.
 *
 * Not a React component or hook — a plain subscriber initialized once
 * from App.js (mirroring the existing FileSystemEventBus.init() /
 * teardown() pattern), since auto-save needs to react to store changes
 * and OS-level AppState transitions for the entire lifetime of the app,
 * not just while some particular screen is mounted.
 *
 * afterDelay: subscribes to useEditorStore and, on every change,
 * (re)starts a debounce timer; if the timer fires without further edits
 * arriving first, every currently-dirty tab is saved. The debounce
 * (rather than a fixed-interval poll) means a burst of fast typing
 * doesn't trigger a save mid-keystroke — it saves settleDelayMs after
 * the user actually stops typing, which is what "auto-save after a
 * delay" means in every editor that implements it (VS Code included).
 *
 * onFocusChange: subscribes to React Native's AppState and saves every
 * dirty tab whenever the app transitions away from 'active' (backgrounded,
 * inactive, or the OS is about to reclaim it) — this is the moment work
 * could otherwise be silently lost, so it's the right trigger, not an
 * arbitrary timer.
 *
 * The actual decision logic (should this AppState transition trigger a
 * save? what delay should the debounce timer use?) is factored out into
 * plain, exported functions below with no RN/Zustand dependency, so it
 * can be unit-tested with Node the same way sseParser/promptTemplates/
 * previewUtils were in Parts 9-10 — everything else here is orchestration
 * (real timers, a real store subscription, a real AppState listener)
 * that can't meaningfully run outside an actual RN app.
 */

/**
 * Decides whether an AppState transition should trigger a save. Only
 * transitions AWAY FROM 'active' (backgrounded, inactive, or the OS
 * reclaiming the app) are save-worthy — moving back TO 'active' is not,
 * since there's nothing new to persist at that point.
 */
export function shouldSaveOnAppStateChange(nextAppState) {
  return nextAppState !== 'active';
}

/**
 * Resolves the actual debounce delay to use for afterDelay auto-save,
 * clamping the user's configured autoSaveDelayMs to a sane floor so an
 * accidentally-tiny or zero/negative configured value can't turn
 * auto-save into a save-on-every-keystroke thrash.
 */
export function resolveAutoSaveDelayMs(configuredDelayMs) {
  return Math.max(300, configuredDelayMs || 1000);
}

/** True if at least one tab across any pane is currently dirty. */
export function hasAnyDirtyTab(panes) {
  return panes.some((p) => p.tabs.some((t) => t.isDirty));
}

let editorStoreUnsubscribe = null;
let appStateSubscription = null;
let debounceTimer = null;
let initialized = false;

async function saveAllDirty() {
  const { trimTrailingWhitespaceOnSave, formatOnSave, tabSize, insertSpaces } = useSettingsStore.getState();
  await writeAllDirtyTabsToDisk({
    trimTrailingWhitespace: trimTrailingWhitespaceOnSave,
    format: formatOnSave ? { tabSize, insertSpaces } : null,
  });
  // Deliberately silent on success — a toast firing every time the user
  // pauses typing would be constant, distracting noise, unlike an
  // explicit Ctrl+S which the user just asked for and expects
  // confirmation of. Failures are swallowed here too for the same
  // reason auto-save shouldn't interrupt someone mid-flow with an error
  // about a background operation they didn't initiate; the tab's
  // isDirty flag simply stays true (visible via the existing dirty-dot
  // tab indicator) and the next save attempt — manual or automatic —
  // will retry it.
}

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function handleEditorStoreChange() {
  const { autoSave, autoSaveDelayMs } = useSettingsStore.getState();
  if (autoSave !== 'afterDelay') return;

  if (!hasAnyDirtyTab(useEditorStore.getState().panes)) {
    clearDebounce();
    return;
  }

  clearDebounce();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    saveAllDirty();
  }, resolveAutoSaveDelayMs(autoSaveDelayMs));
}

function handleAppStateChange(nextState) {
  const { autoSave } = useSettingsStore.getState();
  if (autoSave !== 'onFocusChange') return;
  if (!shouldSaveOnAppStateChange(nextState)) return;
  saveAllDirty();
}

/** Starts the auto-save subscriptions. Idempotent — safe to call more than once. */
export function initAutoSave() {
  if (initialized) return;
  initialized = true;

  editorStoreUnsubscribe = useEditorStore.subscribe(handleEditorStoreChange);
  const sub = AppState.addEventListener('change', handleAppStateChange);
  appStateSubscription = sub;
}

/** Stops the auto-save subscriptions and clears any pending timer. */
export function teardownAutoSave() {
  initialized = false;
  clearDebounce();
  if (editorStoreUnsubscribe) {
    editorStoreUnsubscribe();
    editorStoreUnsubscribe = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

export default {
  initAutoSave,
  teardownAutoSave,
  shouldSaveOnAppStateChange,
  resolveAutoSaveDelayMs,
  hasAnyDirtyTab,
};

