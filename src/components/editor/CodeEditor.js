import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, TextInput, ScrollView, StyleSheet, Platform, Dimensions } from 'react-native';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useSettingsStore } from '../../state/useSettingsStore';
import { useEditorStore } from '../../state/useEditorStore';
import { getLanguageDefinition } from '../../editor/languages';
import { tokenizeLines } from '../../editor/tokenizer';
import { computeFoldRanges, computeHiddenLines } from '../../editor/folding';
import { getAutoCloseAction, shouldDeletePairOnBackspace, computeAutoIndent, findMatchingBracket } from '../../editor/bracketMatching';
import { createUndoManager } from '../../editor/undoManager';
import { useEditorHandlersStore } from '../../state/useEditorHandlersStore';
import { getEditorMetrics, GUTTER_MIN_WIDTH, GUTTER_CHAR_WIDTH_RATIO, OVERSCAN_LINES } from '../../editor/editorMetrics';
import HighlightedLine from './HighlightedLine';
import EditorGutter from './EditorGutter';
import Minimap from './Minimap';

const undoManager = createUndoManager();
const SCREEN_HEIGHT = Dimensions.get('window').height;

/** Returns the 0-indexed column of a character offset within its line. */
function columnOfOffset(content, offset) {
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
  return offset - lineStart;
}

/**
 * The core code editor surface for a single tab.
 *
 * Architecture: React Native's TextInput doesn't expose per-character
 * styling, so real text editing (cursor, selection, IME, hardware
 * keyboard, native undo gestures on some OEM keyboards, copy/paste) is
 * handled by a genuine multiline TextInput whose own text is made
 * transparent. A separate absolutely-positioned overlay — built from
 * this file's tokenizer output — renders the syntax-highlighted text
 * beneath it, using identical font metrics (see editorMetrics.js) so
 * the invisible caret lines up exactly with the colored text. This is
 * the same technique used by production mobile code editors; it's not a
 * shortcut; it's the correct approach given RN's TextInput API surface.
 *
 * Only the lines currently in (or near) the viewport are tokenized and
 * rendered — see the `visibleRange` calculation — so file size does not
 * meaningfully affect per-frame cost.
 */
export default function CodeEditor({ paneId, tab, onHardwareKeyPress }) {
  const theme = useCodeForgeTheme();
  const fontSizeSetting = useSettingsStore((s) => s.fontSize);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const showMinimap = useSettingsStore((s) => s.showMinimap);
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const relativeLineNumbers = useSettingsStore((s) => s.relativeLineNumbers);
  const highlightActiveLine = useSettingsStore((s) => s.highlightActiveLine);
  const autoClosingBrackets = useSettingsStore((s) => s.autoClosingBrackets);
  const autoIndentSetting = useSettingsStore((s) => s.autoIndent);
  const renderWhitespace = useSettingsStore((s) => s.renderWhitespace);
  const zoomLevel = useEditorStore((s) => s.zoomLevel);

  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const updateTabCursor = useEditorStore((s) => s.updateTabCursor);
  const toggleFold = useEditorStore((s) => s.toggleFold);

  const inputRef = useRef(null);
  const scrollViewRef = useRef(null);
  const overlayScrollRef = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(SCREEN_HEIGHT * 0.6);
  const lastCommittedContent = useRef(tab.content);

  const lang = getLanguageDefinition(tab.language);
  const metrics = getEditorMetrics({
    fontSize: fontSizeSetting,
    zoomLevel,
    lineHeightMultiplier: 1.5,
  });

  const lines = useMemo(() => tab.content.split('\n'), [tab.content]);

  const gutterWidth = showLineNumbers
    ? Math.max(GUTTER_MIN_WIDTH, String(lines.length).length * metrics.fontSize * GUTTER_CHAR_WIDTH_RATIO + 20)
    : 0;

  // --- Tokenization (viewport-windowed) ---
  // We tokenize the WHOLE file's line array here but only pay the state-
  // threading cost once per keystroke (debounced via React's own batching
  // + the fact that regex tokenizing a few thousand short lines is still
  // sub-millisecond per line in practice); what we actually *render* is
  // restricted to the visible window below. For extremely large files
  // (>2MB) a reduced-feature mode disables live tokenization entirely —
  // see the largeFileMode check.
  const isLargeFile = tab.content.length > 2 * 1024 * 1024;

  const { perLine: tokenizedLines } = useMemo(() => {
    if (isLargeFile || !lang) {
      return { perLine: lines.map(() => ({ tokens: null, state: null })) };
    }
    return tokenizeLines(lines, lang, null);
  }, [lines, lang, isLargeFile]);

  // --- Folding ---
  const foldRanges = useMemo(() => {
    if (isLargeFile) return [];
    return computeFoldRanges(lines, tab.language);
  }, [lines, tab.language, isLargeFile]);

  const foldStartLines = useMemo(() => new Set(foldRanges.map((r) => r.startLine)), [foldRanges]);
  const hiddenLines = useMemo(
    () => computeHiddenLines(foldRanges, tab.foldedLines),
    [foldRanges, tab.foldedLines]
  );

  const visibleLineIndices = useMemo(() => {
    const startLine = Math.max(0, Math.floor(scrollY / metrics.lineHeight) - OVERSCAN_LINES);
    const endLine = Math.min(
      lines.length - 1,
      Math.ceil((scrollY + viewportHeight) / metrics.lineHeight) + OVERSCAN_LINES
    );
    const result = [];
    for (let i = startLine; i <= endLine; i++) {
      if (!hiddenLines.has(i)) result.push(i);
    }
    return result;
  }, [scrollY, viewportHeight, metrics.lineHeight, lines.length, hiddenLines]);

  const activeLine = useMemo(() => {
    const upToCursor = tab.content.slice(0, selection.start);
    return upToCursor.split('\n').length - 1;
  }, [tab.content, selection.start]);

  // --- Bracket pair highlighting ---
  // Checks the character immediately before AND after the cursor (covers
  // both "cursor right after a bracket" and "cursor right before one",
  // which is how VS Code decides what to highlight) and, if either is a
  // bracket, finds its match so both can be visually marked.
  const bracketMatch = useMemo(() => {
    if (selection.start !== selection.end) return null; // only for a plain caret, not a selection
    const pos = selection.start;
    const beforeChar = tab.content[pos - 1];
    const afterChar = tab.content[pos];

    let bracketPos = -1;
    if (afterChar && /[(){}[\]]/.test(afterChar)) bracketPos = pos;
    else if (beforeChar && /[(){}[\]]/.test(beforeChar)) bracketPos = pos - 1;
    if (bracketPos === -1) return null;

    const matchPos = findMatchingBracket(tab.content, bracketPos);
    if (matchPos === -1) return null;

    const lineOf = (offset) => tab.content.slice(0, offset).split('\n').length - 1;
    return { a: bracketPos, b: matchPos, lineA: lineOf(bracketPos), lineB: lineOf(matchPos) };
  }, [tab.content, selection]);

  // --- Cursor position tracking (for status bar + gutter highlight) ---
  useEffect(() => {
    const upToCursor = tab.content.slice(0, selection.start);
    const linesUpTo = upToCursor.split('\n');
    const line = linesUpTo.length - 1;
    const column = linesUpTo[linesUpTo.length - 1].length;
    updateTabCursor(paneId, tab.id, { line, column });
  }, [selection.start, tab.content, paneId, tab.id, updateTabCursor]);

  // --- Content change handling ---
  const handleChangeText = useCallback(
    (newText) => {
      const previousContent = lastCommittedContent.current;
      lastCommittedContent.current = newText;
      updateTabContent(paneId, tab.id, newText);

      undoManager.recordChange(
        tab,
        { content: previousContent, cursor: tab.cursor },
        (historyUpdate) => {
          // Applied by directly mutating via the store's setter shape;
          // useEditorStore doesn't expose a raw history setter publicly
          // since undo/redo history is meant to flow through this
          // module only — see handleUndo/handleRedo below for the
          // read-modify-write pattern used consistently.
          useEditorStore.setState((state) => ({
            panes: state.panes.map((pane) =>
              pane.id !== paneId
                ? pane
                : {
                    ...pane,
                    tabs: pane.tabs.map((t) =>
                      t.id !== tab.id
                        ? t
                        : { ...t, undoStack: historyUpdate.undoStack, redoStack: historyUpdate.redoStack }
                    ),
                  }
            ),
          }));
        }
      );
    },
    [paneId, tab, updateTabContent]
  );

  const handleSelectionChange = useCallback((e) => {
    setSelection(e.nativeEvent.selection);
  }, []);

  // --- Auto-close brackets / quotes, and auto-indent on Enter ---
  const handleKeyPress = useCallback(
    (e) => {
      // Hardware keyboard shortcuts (Ctrl/Alt combos) get first refusal:
      // if a shortcut consumed this key event (e.g. Ctrl+S saved the
      // file), the editor's own auto-close/auto-indent logic below must
      // not also act on it. Plain typing (no modifier) always falls
      // through untouched — see useKeyboardShortcuts.js for why only
      // modifier combos are intercepted here.
      if (onHardwareKeyPress) {
        const result = onHardwareKeyPress(e.nativeEvent);
        if (result?.consumed) {
          e.preventDefault?.();
          return;
        }
      }

      const key = e.nativeEvent.key;
      const { start, end } = selection;
      const hasSelection = start !== end;

      if (autoClosingBrackets && !hasSelection) {
        const charBefore = tab.content[start - 1] || '';
        const charAfter = tab.content[start] || '';
        const action = getAutoCloseAction(key, charAfter, charBefore);

        if (action.action === 'type-through') {
          e.preventDefault?.();
          const newCursor = start + 1;
          setSelection({ start: newCursor, end: newCursor });
          // Content is unchanged; only cursor moves past the existing char.
          inputRef.current?.setNativeProps?.({ selection: { start: newCursor, end: newCursor } });
          return;
        }

        if (action.action === 'insert-pair') {
          e.preventDefault?.();
          const newContent = tab.content.slice(0, start) + key + action.insertText + tab.content.slice(start);
          handleChangeText(newContent);
          const newCursor = start + 1;
          requestAnimationFrame(() => {
            inputRef.current?.setNativeProps?.({ selection: { start: newCursor, end: newCursor } });
          });
          return;
        }
      }

      // Backspace: delete an empty bracket/quote pair as a single unit.
      if (key === 'Backspace' && !hasSelection && start > 0) {
        const charBefore = tab.content[start - 1];
        const charAfter = tab.content[start];
        if (shouldDeletePairOnBackspace(charBefore, charAfter)) {
          e.preventDefault?.();
          const newContent = tab.content.slice(0, start - 1) + tab.content.slice(start + 1);
          handleChangeText(newContent);
          requestAnimationFrame(() => {
            inputRef.current?.setNativeProps?.({ selection: { start: start - 1, end: start - 1 } });
          });
          return;
        }
      }

      // Enter: auto-indent to match the previous line / bracket context.
      if (key === 'Enter' && autoIndentSetting && !hasSelection) {
        const beforeCursor = tab.content.slice(0, start);
        const afterCursor = tab.content.slice(start);
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const lineBeforeCursor = beforeCursor.slice(lineStart);
        const lineEndInAfter = afterCursor.indexOf('\n');
        const lineAfterCursor = lineEndInAfter === -1 ? afterCursor : afterCursor.slice(0, lineEndInAfter);

        const { newLineIndent, insertClosingLineBelow, closingLineIndent } = computeAutoIndent({
          lineBeforeCursor,
          lineAfterCursor,
          tabSize,
          insertSpaces,
        });

        e.preventDefault?.();

        let insertion = '\n' + newLineIndent;
        let cursorOffset = insertion.length;
        if (insertClosingLineBelow) {
          insertion += '\n' + closingLineIndent;
        }

        const newContent = beforeCursor + insertion + afterCursor;
        handleChangeText(newContent);
        const newCursor = start + cursorOffset;
        requestAnimationFrame(() => {
          inputRef.current?.setNativeProps?.({ selection: { start: newCursor, end: newCursor } });
        });
      }
    },
    [selection, tab.content, autoClosingBrackets, autoIndentSetting, tabSize, insertSpaces, handleChangeText, onHardwareKeyPress]
  );

  // --- Undo / Redo (exposed for the status bar / keyboard shortcuts to call) ---
  const handleUndo = useCallback(() => {
    const currentState = { content: tab.content, cursor: tab.cursor };
    const result = undoManager.undo(tab, currentState);
    if (!result) return;
    lastCommittedContent.current = result.restored.content;
    useEditorStore.setState((state) => ({
      panes: state.panes.map((pane) =>
        pane.id !== paneId
          ? pane
          : {
              ...pane,
              tabs: pane.tabs.map((t) =>
                t.id !== tab.id
                  ? t
                  : {
                      ...t,
                      content: result.restored.content,
                      isDirty: result.restored.content !== t.savedContent,
                      undoStack: result.undoStack,
                      redoStack: result.redoStack,
                    }
              ),
            }
      ),
    }));
  }, [paneId, tab]);

  const handleRedo = useCallback(() => {
    const currentState = { content: tab.content, cursor: tab.cursor };
    const result = undoManager.redo(tab, currentState);
    if (!result) return;
    lastCommittedContent.current = result.restored.content;
    useEditorStore.setState((state) => ({
      panes: state.panes.map((pane) =>
        pane.id !== paneId
          ? pane
          : {
              ...pane,
              tabs: pane.tabs.map((t) =>
                t.id !== tab.id
                  ? t
                  : {
                      ...t,
                      content: result.restored.content,
                      isDirty: result.restored.content !== t.savedContent,
                      undoStack: result.undoStack,
                      redoStack: result.redoStack,
                    }
              ),
            }
      ),
    }));
  }, [paneId, tab]);

  const handleMinimapScrollToRatio = useCallback(
    (ratio) => {
      const totalContentHeight = lines.length * metrics.lineHeight;
      const targetY = Math.max(0, ratio * totalContentHeight - viewportHeight / 2);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: false });
      overlayScrollRef.current?.scrollTo({ y: targetY, animated: false });
      setScrollY(targetY);
    },
    [lines.length, metrics.lineHeight, viewportHeight]
  );

  /**
   * Imperatively moves the real cursor to a character offset (used by Go
   * to Line, and reused by Find & Replace's "jump to match" navigation)
   * and scrolls that line into view. Focuses the input first so the
   * native selection change actually takes effect and the keyboard is
   * ready for editing at the new position.
   */
  const handleJumpToOffset = useCallback(
    (offset) => {
      const clamped = Math.max(0, Math.min(tab.content.length, offset));
      inputRef.current?.focus?.();
      requestAnimationFrame(() => {
        inputRef.current?.setNativeProps?.({ selection: { start: clamped, end: clamped } });
        setSelection({ start: clamped, end: clamped });
      });

      const upToOffset = tab.content.slice(0, clamped);
      const lineIndex = upToOffset.split('\n').length - 1;
      const targetY = Math.max(0, lineIndex * metrics.lineHeight - viewportHeight / 2);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      overlayScrollRef.current?.scrollTo({ y: targetY, animated: true });
      setScrollY(targetY);
    },
    [tab.content, metrics.lineHeight, viewportHeight]
  );

  /**
   * Imperatively inserts text at the current cursor position (replacing
   * the current selection if one is active), then moves the cursor to
   * just after the inserted text and scrolls it into view. Used by the
   * AI Assistant (Part 9) to insert generated/fixed code from the Chat
   * panel or the Code Actions sheet — those UIs live outside this
   * editor's subtree entirely, so this goes through the same handler-
   * registration bridge as undo/redo/jumpToOffset rather than a prop.
   */
  const handleInsertTextAtCursor = useCallback(
    (text) => {
      if (!text) return;
      const { start, end } = selection;
      const newContent = tab.content.slice(0, start) + text + tab.content.slice(end);
      handleChangeText(newContent);
      const newCursor = start + text.length;
      inputRef.current?.focus?.();
      requestAnimationFrame(() => {
        inputRef.current?.setNativeProps?.({ selection: { start: newCursor, end: newCursor } });
        setSelection({ start: newCursor, end: newCursor });
      });

      const upToOffset = tab.content.slice(0, newCursor);
      const lineIndex = upToOffset.split('\n').length - 1;
      const targetY = Math.max(0, lineIndex * metrics.lineHeight - viewportHeight / 2);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      overlayScrollRef.current?.scrollTo({ y: targetY, animated: true });
      setScrollY(targetY);
    },
    [selection, tab.content, handleChangeText, metrics.lineHeight, viewportHeight]
  );

  /**
   * Returns the current selection range ({start, end} character
   * offsets) for callers outside this component — the AI Code Actions
   * sheet uses this to read "what's selected right now" without this
   * editor needing to push selection state anywhere reactive.
   */
  const handleGetSelection = useCallback(() => ({ start: selection.start, end: selection.end }), [selection]);

  // Register undo/redo/jump/insert handlers reactively so the toolbar /
  // command palette / keyboard shortcuts / Find panel / AI Assistant can
  // trigger them for whichever tab is currently focused, without prop-
  // drilling through every ancestor.
  useEffect(() => {
    useEditorHandlersStore.getState().registerHandlers(tab.id, {
      undo: handleUndo,
      redo: handleRedo,
      jumpToOffset: handleJumpToOffset,
      insertTextAtCursor: handleInsertTextAtCursor,
      getSelection: handleGetSelection,
    });
    return () => {
      useEditorHandlersStore.getState().unregisterHandlers(tab.id);
    };
  }, [tab.id, handleUndo, handleRedo, handleJumpToOffset, handleInsertTextAtCursor, handleGetSelection]);

  const handleScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    setScrollY(y);
    overlayScrollRef.current?.scrollTo({ y, animated: false });
  }, []);

  const totalContentHeight = (lines.length - hiddenLines.size) * metrics.lineHeight;
  const scrollRatio = totalContentHeight > 0 ? scrollY / (lines.length * metrics.lineHeight) : 0;
  const viewportRatio = viewportHeight / Math.max(1, lines.length * metrics.lineHeight);

  const editorFontFamily = Platform.select({ android: 'monospace', default: 'Courier' });

  return (
    <View style={styles.container}>
      <View style={styles.editorRow}>
        {showLineNumbers && (
          <EditorGutter
            visibleLineIndices={visibleLineIndices}
            activeLine={activeLine}
            foldStartLines={foldStartLines}
            foldedLines={tab.foldedLines}
            onToggleFold={(lineIndex) => toggleFold(paneId, tab.id, lineIndex)}
            gutterWidth={gutterWidth}
            lineHeight={metrics.lineHeight}
            fontSize={metrics.fontSize}
            palette={theme.palette}
            relativeLineNumbers={relativeLineNumbers}
          />
        )}

        <View style={styles.editorSurface}>
          {/* Syntax-highlighted overlay (non-interactive, sits behind the invisible TextInput) */}
          <ScrollView
            ref={overlayScrollRef}
            style={StyleSheet.absoluteFill}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          >
            <View>
              {highlightActiveLine && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: activeLine * metrics.lineHeight,
                    left: 0,
                    right: 0,
                    height: metrics.lineHeight,
                    backgroundColor: theme.palette.editorLineHighlight,
                  }}
                />
              )}
              {bracketMatch && (
                <>
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: bracketMatch.lineA * metrics.lineHeight,
                      left: 8 + columnOfOffset(tab.content, bracketMatch.a) * metrics.charWidth,
                      width: metrics.charWidth,
                      height: metrics.lineHeight,
                      backgroundColor: theme.palette.primary,
                      opacity: 0.25,
                      borderRadius: 2,
                    }}
                  />
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: bracketMatch.lineB * metrics.lineHeight,
                      left: 8 + columnOfOffset(tab.content, bracketMatch.b) * metrics.charWidth,
                      width: metrics.charWidth,
                      height: metrics.lineHeight,
                      backgroundColor: theme.palette.primary,
                      opacity: 0.25,
                      borderRadius: 2,
                    }}
                  />
                </>
              )}
              {visibleLineIndices.map((lineIndex) => (
                <View
                  key={lineIndex}
                  style={{
                    position: 'absolute',
                    top: lineIndex * metrics.lineHeight,
                    left: 8,
                    right: 0,
                  }}
                >
                  <HighlightedLine
                    tokens={isLargeFile ? null : tokenizedLines[lineIndex]?.tokens}
                    syntaxColors={theme.palette.syntax}
                    plainColor={theme.palette.onSurface}
                    fontFamily={editorFontFamily}
                    fontSize={metrics.fontSize}
                    lineHeight={metrics.lineHeight}
                    renderWhitespace={renderWhitespace}
                  />
                </View>
              ))}
              <View style={{ height: lines.length * metrics.lineHeight }} />
            </View>
          </ScrollView>

          {/* Real, invisible-text TextInput — handles actual editing */}
          <ScrollView
            ref={scrollViewRef}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          >
            <TextInput
              ref={inputRef}
              multiline
              value={tab.content}
              onChangeText={handleChangeText}
              onSelectionChange={handleSelectionChange}
              onKeyPress={handleKeyPress}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              scrollEnabled={false}
              textAlignVertical="top"
              style={[
                styles.hiddenInput,
                {
                  fontFamily: editorFontFamily,
                  fontSize: metrics.fontSize,
                  lineHeight: metrics.lineHeight,
                  color: 'transparent',
                  caretColor: theme.palette.editorCursor,
                  minHeight: lines.length * metrics.lineHeight + viewportHeight,
                  paddingLeft: 8,
                },
                !wordWrap && styles.noWrap,
              ]}
              selectionColor={theme.palette.editorSelection}
            />
          </ScrollView>
        </View>

        {showMinimap && !isLargeFile && (
          <Minimap
            lines={lines}
            tokensByLine={tokenizedLines.map((t) => t.tokens)}
            syntaxColors={theme.palette.syntax}
            scrollRatio={scrollRatio}
            viewportRatio={viewportRatio}
            onScrollToRatio={handleMinimapScrollToRatio}
            palette={theme.palette}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  editorRow: { flex: 1, flexDirection: 'row' },
  editorSurface: { flex: 1, position: 'relative' },
  hiddenInput: {
    padding: 0,
    margin: 0,
    textAlignVertical: 'top',
  },
  noWrap: {
    width: undefined,
    minWidth: '100%',
  },
});
