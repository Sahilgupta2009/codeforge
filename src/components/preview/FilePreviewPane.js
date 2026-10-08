import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { isImageFile, isPdfFile } from '../../utils/pathUtils';
import ImagePreview from './ImagePreview';
import PdfPreview from './PdfPreview';

/**
 * Replaces WorkspaceScreen's old "Image/PDF preview lands in Part 10"
 * placeholder banner. Dispatches to the real ImagePreview or PdfPreview
 * renderer based on the file's extension — both read live content from
 * the file's actual URI (FS.readFileBase64), nothing mocked.
 *
 * Any other non-previewable binary file (the isBinaryFile-but-not-
 * image-or-pdf case, e.g. .apk, .zip, .mp3) still falls through to a
 * plain "not previewable" message here, same as before Part 10 — this
 * component only adds real rendering for the two types Part 10 was
 * actually scoped to cover.
 */
export default function FilePreviewPane({ file, onClose }) {
  const theme = useCodeForgeTheme();

  if (!file) return null;

  const showImage = isImageFile(file.name);
  const showPdf = isPdfFile(file.name);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.palette.outlineVariant }]}>
        <MaterialCommunityIcons
          name={showImage ? 'file-image-outline' : showPdf ? 'file-pdf-box' : 'file-question-outline'}
          size={16}
          color={theme.palette.onSurfaceVariant}
        />
        <Text numberOfLines={1} style={{ color: theme.palette.onSurface, fontSize: 13, marginLeft: 6, flex: 1 }}>
          {file.name}
        </Text>
        <IconButton icon="close" size={18} onPress={onClose} accessibilityLabel="Close preview" />
      </View>

      <View style={styles.body}>
        {showImage ? (
          <ImagePreview uri={file.uri} name={file.name} size={file.size} />
        ) : showPdf ? (
          <PdfPreview uri={file.uri} name={file.name} size={file.size} />
        ) : (
          <View style={styles.center}>
            <MaterialCommunityIcons name="file-question-outline" size={36} color={theme.palette.onSurfaceDim} />
            <Text
              variant="bodySmall"
              style={{ color: theme.palette.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}
            >
              This file type is not previewable.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
