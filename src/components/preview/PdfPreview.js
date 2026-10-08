import React, { useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Pdf from 'react-native-pdf';
import { Text, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { FS } from '../../filesystem/FileSystemRouter';
import { buildDataUri } from '../../preview/previewUtils';
import { formatFileSize } from '../../utils/pathUtils';

/**
 * Renders a PDF read live from its real SAF/sandbox URI. react-native-
 * pdf accepts a `{ uri }` source that can be a `data:` URI directly, so
 * this reuses the exact same FS.readFileBase64 + buildDataUri path
 * ImagePreview uses for raster images — no temp-file copy step needed,
 * the base64 read goes straight into the PDF renderer.
 *
 * Shows a page indicator (current/total) and pinch-to-zoom (native to
 * react-native-pdf's own gesture handling), since PDFs are frequently
 * multi-page and often need zooming to read comfortably on a phone.
 */
export default function PdfPreview({ uri, name, size }) {
  const theme = useCodeForgeTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataUri, setDataUri] = useState(null);
  const [pageInfo, setPageInfo] = useState({ page: 1, numberOfPages: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDataUri(null);
      try {
        const base64 = await FS.readFileBase64(uri);
        if (cancelled) return;
        setDataUri(buildDataUri(base64, name));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [uri, name]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.palette.editorBackground }]}>
        <ActivityIndicator color={theme.palette.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.palette.editorBackground }]}>
        <MaterialCommunityIcons name="file-pdf-box" size={32} color={theme.palette.onSurfaceDim} />
        <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.editorBackground }]}>
      {dataUri && (
        <Pdf
          source={{ uri: dataUri, cache: false }}
          style={{ width: windowWidth, height: windowHeight, backgroundColor: theme.palette.editorBackground }}
          onLoadComplete={(numberOfPages) => setPageInfo((p) => ({ ...p, numberOfPages }))}
          onPageChanged={(page, numberOfPages) => setPageInfo({ page, numberOfPages })}
          onError={(err) => setError(typeof err === 'string' ? err : err?.message || 'Failed to render PDF')}
          enablePaging={false}
          fitPolicy={0}
        />
      )}

      <View style={[styles.footer, { borderTopColor: theme.palette.outlineVariant }]}>
        <Text numberOfLines={1} style={{ color: theme.palette.onSurfaceVariant, fontSize: 11.5, flex: 1 }}>
          {name}
          {size != null ? `  \u00b7  ${formatFileSize(size)}` : ''}
        </Text>
        {pageInfo.numberOfPages > 0 && (
          <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11.5 }}>
            {pageInfo.page} / {pageInfo.numberOfPages}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
});
