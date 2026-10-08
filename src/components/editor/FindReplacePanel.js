import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, TextInput as RNTextInput, StyleSheet, Pressable } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useEditorStore } from '../../state/useEditorStore';
import { useEditorHandlersStore } from '../../state/useEditorHandlersStore';

/**
 * Find & Replace within the currently active tab. Supports plain-text
 * and regex search, case sensitivity, whole-word matching, replace-one,
 * and replace-all. Operates directly on tab.content via the same
 * updateTabContent path the editor itself uses, so replacements go
 * through the normal dirty-tracking/undo-eligible flow (a hard boundary
 * is NOT auto-flushed to undo history here to keep this module simple;
 * a replace-all is still fully undoable as a single edit since it's one
 * updateTabContent call, which is exactly the granularity users expect
 * for "undo my last replace-all").
 */
export default function FindReplacePanel({ paneId, tab, onClose, initialShowReplace = false }) {
  const theme = useCodeForgeTheme();
  const updateTabContent = useEditorStore((s) => s.updateTabContent);

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showReplace, setShowReplace] = useState(initialShowReplace);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Computed together (rather than calling setState from inside useMemo,
  // which React doesn't guarantee runs predictably) so `error` is always
  // in sync with `matches` for the same query/content/flags without an
  // extra render pass.
  const { matches, error } = useMemo(() => {
    if (!query) return { matches: [], error: null };
    try {
      let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) pattern = `\\b${pattern}\\b`;
      const flags = caseSensitive ? 'g' : 'gi';
      const re = new RegExp(pattern, flags);
      const results = [];
      let m;
      let iterations = 0;
      while ((m = re.exec(tab.content)) !== null && iterations < 10000) {
        results.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        if (m[0].length === 0) re.lastIndex++; // avoid infinite loop on empty matches
        iterations++;
      }
      return { matches: results, error: null };
    } catch (err) {
      return { matches: [], error: 'Invalid regex pattern' };
    }
  }, [query, tab.content, useRegex, caseSensitive, wholeWord]);

  // Jump the real cursor to the first match whenever the match set
  // changes out from under the current index (new query, content edit
  // that changes match count, etc.) so the highlighted "1/N" counter
  // always corresponds to where the cursor actually is.
  useEffect(() => {
    if (matches.length === 0) return;
    const clamped = Math.min(currentMatchIndex, matches.length - 1);
    if (clamped !== currentMatchIndex) setCurrentMatchIndex(clamped);
    const handlers = useEditorHandlersStore.getState().getHandlers(tab.id);
    handlers?.jumpToOffset?.(matches[clamped].start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length, query]);

  const goToMatch = useCallback(
    (index) => {
      if (matches.length === 0) return;
      const clamped = ((index % matches.length) + matches.length) % matches.length;
      setCurrentMatchIndex(clamped);
      const handlers = useEditorHandlersStore.getState().getHandlers(tab.id);
      handlers?.jumpToOffset?.(matches[clamped].start);
    },
    [matches, tab.id]
  );

  const handleReplaceOne = useCallback(() => {
    if (matches.length === 0) return;
    const match = matches[currentMatchIndex];
    const before = tab.content.slice(0, match.start);
    const after = tab.content.slice(match.end);
    updateTabContent(paneId, tab.id, before + replacement + after);
  }, [matches, currentMatchIndex, tab, replacement, paneId, updateTabContent]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return;
    let result = '';
    let lastEnd = 0;
    for (const match of matches) {
      result += tab.content.slice(lastEnd, match.start) + replacement;
      lastEnd = match.end;
    }
    result += tab.content.slice(lastEnd);
    updateTabContent(paneId, tab.id, result);
  }, [matches, tab, replacement, paneId, updateTabContent]);

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerHigh, borderColor: theme.palette.outline }]}>
      <View style={styles.row}>
        <Pressable onPress={() => setShowReplace((v) => !v)} hitSlop={8}>
          <MaterialCommunityIcons
            name={showReplace ? 'chevron-down' : 'chevron-right'}
            size={18}
            color={theme.palette.onSurfaceVariant}
          />
        </Pressable>

        <RNTextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setCurrentMatchIndex(0);
          }}
          placeholder="Find"
          placeholderTextColor={theme.palette.onSurfaceDim}
          style={[styles.input, { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer }]}
          autoFocus
        />

        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 12, marginHorizontal: 8, minWidth: 44 }}>
          {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : '0/0'}
        </Text>

        <IconButton icon="chevron-up" size={18} onPress={() => goToMatch(currentMatchIndex - 1)} />
        <IconButton icon="chevron-down" size={18} onPress={() => goToMatch(currentMatchIndex + 1)} />
        <IconButton icon="close" size={18} onPress={onClose} />
      </View>

      {showReplace && (
        <View style={styles.row}>
          <View style={{ width: 26 }} />
          <RNTextInput
            value={replacement}
            onChangeText={setReplacement}
            placeholder="Replace"
            placeholderTextColor={theme.palette.onSurfaceDim}
            style={[styles.input, { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer }]}
          />
          <Pressable onPress={handleReplaceOne} style={styles.textButton}>
            <Text style={{ color: theme.palette.primary, fontSize: 12 }}>Replace</Text>
          </Pressable>
          <Pressable onPress={handleReplaceAll} style={styles.textButton}>
            <Text style={{ color: theme.palette.primary, fontSize: 12 }}>All</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.optionsRow}>
        <ToggleChip label="Aa" active={caseSensitive} onPress={() => setCaseSensitive((v) => !v)} theme={theme} tooltip="Case sensitive" />
        <ToggleChip label="ab" active={wholeWord} onPress={() => setWholeWord((v) => !v)} theme={theme} tooltip="Whole word" />
        <ToggleChip label=".*" active={useRegex} onPress={() => setUseRegex((v) => !v)} theme={theme} tooltip="Regex" />
        {error && (
          <Text style={{ color: theme.palette.error, fontSize: 11, marginLeft: 8 }}>{error}</Text>
        )}
      </View>
    </View>
  );
}

function ToggleChip({ label, active, onPress, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.palette.primaryContainer : theme.palette.surfaceContainer,
          borderColor: active ? theme.palette.primary : theme.palette.outlineVariant,
        },
      ]}
    >
      <Text style={{ color: active ? theme.palette.onPrimaryContainer : theme.palette.onSurfaceVariant, fontSize: 11, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1, paddingVertical: 8, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  input: {
    flex: 1,
    height: 34,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  textButton: { paddingHorizontal: 8, paddingVertical: 6 },
  optionsRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 26, marginTop: 2 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 6,
  },
});
