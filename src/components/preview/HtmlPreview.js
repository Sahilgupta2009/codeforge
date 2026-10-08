import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { IconButton, Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { wrapHtmlForPreview, getPreviewDebounceMs } from '../../preview/previewUtils';

/**
 * Live preview of an HTML tab's in-memory content — reflects unsaved
 * edits as they're typed, not just the last-saved-to-disk version,
 * since that's what "live preview" means for an editor and is what
 * makes it useful while actively working on markup.
 *
 * Renders via WebView's `source={{ html }}` (an offline `srcDoc`-style
 * load, no navigation to a real URL), so this works fully offline and
 * never leaves the sandboxed content the user is editing. Debounced by
 * content length (see previewUtils.getPreviewDebounceMs) so large files
 * don't force a full WebView reload on every keystroke.
 */
export default function HtmlPreview({ content, uri }) {
  const theme = useCodeForgeTheme();
  const [debouncedContent, setDebouncedContent] = useState(content);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const delay = getPreviewDebounceMs(content.length);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedContent(content);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content]);

  const html = useMemo(
    () => wrapHtmlForPreview(debouncedContent, { isDark: theme.dark }),
    [debouncedContent, theme.dark]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.editorBackground }]}>
      {loadError ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={theme.palette.error} />
          <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
            Preview failed to load: {loadError}
          </Text>
          <IconButton
            icon="refresh"
            onPress={() => {
              setLoadError(null);
              setReloadKey((k) => k + 1);
            }}
          />
        </View>
      ) : (
        <WebView
          key={reloadKey}
          originWhitelist={['*']}
          source={{ html, baseUrl: undefined }}
          style={{ backgroundColor: theme.palette.editorBackground }}
          onError={(syntheticEvent) => {
            setLoadError(syntheticEvent?.nativeEvent?.description || 'Unknown WebView error');
          }}
          // The preview is a read-only render surface for the active
          // file's own markup — it has no reason to navigate anywhere
          // else, so any link-driven top-level navigation away from the
          // initial about:blank document is blocked rather than
          // hijacking the app's own screen or opening an external URL.
          onShouldStartLoadWithRequest={(request) => request.navigationType !== 'click'}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
