import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Text, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { Buffer } from 'buffer';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { FS } from '../../filesystem/FileSystemRouter';
import { buildDataUri, getExtension } from '../../preview/previewUtils';
import { formatFileSize } from '../../utils/pathUtils';

/**
 * Renders an image file read live from its real SAF/sandbox URI via
 * FS.readFileBase64 — no placeholder, no mock bytes. SVG is a special
 * case: RN's <Image> component cannot rasterize SVG (it's not a raster
 * format Skia/the platform image decoder understands out of the box),
 * so SVGs are decoded from base64 to their raw XML text and handed to
 * react-native-svg's <SvgXml>, which actually parses and renders SVG
 * markup. Every other supported extension (png/jpg/jpeg/gif/webp/bmp)
 * goes through <Image> via a `data:` URI built from the same base64
 * read — RN's image decoder handles all of those natively.
 *
 * Wrapped in a pinch-zoomable ScrollView (minimumZoomScale/
 * maximumZoomScale) since screenshots and diagrams are often larger
 * than a phone screen and need real inspection, not just a shrink-to-
 * fit thumbnail.
 */
export default function ImagePreview({ uri, name, size }) {
  const theme = useCodeForgeTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataUri, setDataUri] = useState(null);
  const [svgXml, setSvgXml] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null);

  const isSvg = getExtension(name) === 'svg';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDataUri(null);
      setSvgXml(null);
      setNaturalSize(null);
      try {
        const base64 = await FS.readFileBase64(uri);
        if (cancelled) return;

        if (isSvg) {
          // Decode base64 to a UTF-8 XML string via the project's
          // `buffer` dependency (a real, declared package — not a
          // probabilistic global check), since RN's JS engine doesn't
          // guarantee atob()/Buffer as ambient globals.
          const xml = Buffer.from(base64, 'base64').toString('utf-8');
          setSvgXml(xml);
          setLoading(false);
          return;
        }

        const uriForImage = buildDataUri(base64, name);
        setDataUri(uriForImage);
        Image.getSize(
          uriForImage,
          (w, h) => {
            if (!cancelled) setNaturalSize({ width: w, height: h });
          },
          () => {
            // getSize failing isn't fatal — the Image component will
            // still attempt to render at its natural size via the style
            // fallback below, just without upfront dimensions to plan
            // the initial zoom level around.
          }
        );
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load image');
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [uri, name, isSvg]);

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
        <MaterialCommunityIcons name="image-off-outline" size={32} color={theme.palette.onSurfaceDim} />
        <Text style={{ color: theme.palette.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.editorBackground }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        minimumZoomScale={0.5}
        maximumZoomScale={4}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {isSvg && svgXml ? (
          <SvgXml
            xml={svgXml}
            width={Math.min(windowWidth - 40, 400)}
            height={Math.min(windowHeight * 0.6, 400)}
          />
        ) : dataUri ? (
          <Image
            source={{ uri: dataUri }}
            style={
              naturalSize
                ? {
                    width: Math.min(windowWidth - 40, naturalSize.width),
                    height:
                      Math.min(windowWidth - 40, naturalSize.width) *
                      (naturalSize.height / naturalSize.width),
                  }
                : { width: windowWidth - 40, height: windowHeight * 0.5 }
            }
            resizeMode="contain"
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.palette.outlineVariant }]}>
        <Text numberOfLines={1} style={{ color: theme.palette.onSurfaceVariant, fontSize: 11.5, flex: 1 }}>
          {name}
          {naturalSize ? `  \u00b7  ${naturalSize.width}\u00d7${naturalSize.height}` : ''}
          {size != null ? `  \u00b7  ${formatFileSize(size)}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  footer: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
});
