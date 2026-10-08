import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput as RNTextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useSearchStore } from '../state/useSearchStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { getFileIcon } from '../utils/pathUtils';

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Global project search sidebar panel — the "Find in Files" surface.
 * Debounces the query so search doesn't re-run on every keystroke, shows
 * results grouped by file (VS Code-style), and supports per-match,
 * per-file, and replace-all operations that write real changes to disk
 * through useSearchStore's replaceInFile/replaceAll.
 */
export default function GlobalSearchPanel({ onOpenMatch }) {
  const theme = useCodeForgeTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const excludePatterns = useSettingsStore((s) => s.excludePatterns);

  const query = useSearchStore((s) => s.query);
  const replacement = useSearchStore((s) => s.replacement);
  const useRegex = useSearchStore((s) => s.useRegex);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const wholeWord = useSearchStore((s) => s.wholeWord);
  const isSearching = useSearchStore((s) => s.isSearching);
  const filesScanned = useSearchStore((s) => s.filesScanned);
  const results = useSearchStore((s) => s.results);
  const errorMessage = useSearchStore((s) => s.errorMessage);
  const hasSearched = useSearchStore((s) => s.hasSearched);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setReplacement = useSearchStore((s) => s.setReplacement);
  const toggleUseRegex = useSearchStore((s) => s.toggleUseRegex);
  const toggleCaseSensitive = useSearchStore((s) => s.toggleCaseSensitive);
  const toggleWholeWord = useSearchStore((s) => s.toggleWholeWord);
  const toggleFileExpanded = useSearchStore((s) => s.toggleFileExpanded);
  const runSearch = useSearchStore((s) => s.runSearch);
  const cancelSearch = useSearchStore((s) => s.cancelSearch);
  const replaceInFile = useSearchStore((s) => s.replaceInFile);
  const replaceAll = useSearchStore((s) => s.replaceAll);

  const [showReplace, setShowReplace] = useState(false);
  const [replacingAll, setReplacingAll] = useState(false);
  const debounceRef = useRef(null);

  // Debounced auto-search whenever the query or any option changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || !workspace) return;
    debounceRef.current = setTimeout(() => {
      runSearch(workspace.uri, excludePatterns);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, useRegex, caseSensitive, wholeWord, workspace?.uri]);

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  const handleReplaceAll = useCallback(async () => {
    setReplacingAll(true);
    await replaceAll(replacement);
    setReplacingAll(false);
    if (workspace) runSearch(workspace.uri, excludePatterns); // refresh to confirm zero remaining matches
  }, [replaceAll, replacement, workspace, excludePatterns, runSearch]);

  if (!workspace) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.palette.surfaceContainerLow }]}>
        <Text style={{ color: theme.palette.onSurfaceDim }}>Open a folder to search</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}>
      <View style={styles.searchInputs}>
        <View style={styles.inputRow}>
          <Pressable onPress={() => setShowReplace((v) => !v)} hitSlop={8}>
            <MaterialCommunityIcons
              name={showReplace ? 'chevron-down' : 'chevron-right'}
              size={18}
              color={theme.palette.onSurfaceVariant}
            />
          </Pressable>
          <RNTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search across project"
            placeholderTextColor={theme.palette.onSurfaceDim}
            style={[styles.input, { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching ? (
            <Pressable onPress={cancelSearch} hitSlop={6} style={{ marginLeft: 6 }}>
              <ActivityIndicator size={16} color={theme.palette.primary} />
            </Pressable>
          ) : (
            query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={6} style={{ marginLeft: 6 }}>
                <MaterialCommunityIcons name="close" size={16} color={theme.palette.onSurfaceDim} />
              </Pressable>
            )
          )}
        </View>

        {showReplace && (
          <View style={styles.inputRow}>
            <View style={{ width: 26 }} />
            <RNTextInput
              value={replacement}
              onChangeText={setReplacement}
              placeholder="Replace"
              placeholderTextColor={theme.palette.onSurfaceDim}
              style={[styles.input, { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={handleReplaceAll}
              disabled={results.length === 0 || replacingAll}
              style={styles.replaceAllButton}
            >
              <Text
                style={{
                  color: results.length === 0 ? theme.palette.onSurfaceDim : theme.palette.primary,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {replacingAll ? 'Replacing…' : 'Replace All'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.optionsRow}>
          <ToggleChip label="Aa" active={caseSensitive} onPress={toggleCaseSensitive} theme={theme} />
          <ToggleChip label="ab" active={wholeWord} onPress={toggleWholeWord} theme={theme} />
          <ToggleChip label=".*" active={useRegex} onPress={toggleUseRegex} theme={theme} />
        </View>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={{ color: theme.palette.error, fontSize: 12 }}>{errorMessage}</Text>
        </View>
      )}

      {hasSearched && !errorMessage && (
        <View style={styles.summaryRow}>
          <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11 }}>
            {isSearching
              ? `Searching… ${filesScanned} files scanned`
              : totalMatches === 0
              ? 'No results'
              : `${totalMatches} result${totalMatches === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}`}
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.uri}
        renderItem={({ item: fileResult }) => (
          <FileResultGroup
            fileResult={fileResult}
            theme={theme}
            showReplace={showReplace}
            onToggleExpanded={() => toggleFileExpanded(fileResult.uri)}
            onOpenMatch={(match) => onOpenMatch?.(fileResult, match)}
            onReplaceFile={() => replaceInFile(fileResult, replacement)}
          />
        )}
      />
    </View>
  );
}

function FileResultGroup({ fileResult, theme, showReplace, onToggleExpanded, onOpenMatch, onReplaceFile }) {
  return (
    <View>
      <Pressable onPress={onToggleExpanded} style={styles.fileHeader}>
        <MaterialCommunityIcons
          name={fileResult.expanded ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={theme.palette.onSurfaceDim}
        />
        <MaterialCommunityIcons
          name={getFileIcon(fileResult.name, false)}
          size={15}
          color={theme.palette.onSurfaceVariant}
          style={{ marginHorizontal: 6 }}
        />
        <Text numberOfLines={1} style={{ color: theme.palette.onSurface, flex: 1, fontSize: 13 }}>
          {fileResult.name}
        </Text>
        <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11, marginRight: 4 }}>
          {fileResult.matches.length}
        </Text>
        {showReplace && (
          <Pressable onPress={onReplaceFile} hitSlop={6} style={{ marginLeft: 4 }}>
            <MaterialCommunityIcons name="find-replace" size={15} color={theme.palette.primary} />
          </Pressable>
        )}
      </Pressable>

      {fileResult.expanded &&
        fileResult.matches.map((match, idx) => (
          <Pressable
            key={`${match.line}-${match.column}-${idx}`}
            onPress={() => onOpenMatch(match)}
            style={styles.matchRow}
          >
            <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 10.5, width: 32, textAlign: 'right', marginRight: 8 }}>
              {match.line + 1}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.palette.onSurfaceVariant, flex: 1, fontSize: 12 }}>
              {renderMatchLine(match, theme)}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}

function renderMatchLine(match, theme) {
  const { lineText, column, matchLength } = match;
  const before = lineText.slice(0, column);
  const matched = lineText.slice(column, column + matchLength);
  const after = lineText.slice(column + matchLength);
  return (
    <>
      {before.trimStart()}
      <Text style={{ color: theme.palette.primary, fontWeight: '700' }}>{matched}</Text>
      {after}
    </>
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
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  searchInputs: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  input: { flex: 1, height: 32, borderRadius: 6, paddingHorizontal: 10, fontSize: 13, marginLeft: 4 },
  replaceAllButton: { paddingHorizontal: 8, paddingVertical: 6, marginLeft: 4 },
  optionsRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 30, marginTop: 2 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, marginRight: 6 },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6 },
  summaryRow: { paddingHorizontal: 12, paddingVertical: 4 },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 32,
    paddingRight: 12,
    paddingVertical: 3,
  },
});
