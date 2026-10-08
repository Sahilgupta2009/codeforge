import React, { useCallback, useMemo, useState } from 'react';
import { View, TextInput as RNTextInput, FlatList, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useExtensionStore } from '../../state/useExtensionStore';
import { CATALOG, searchCatalog } from '../../extensions/extensionCatalog';
import { installExtension } from '../../extensions/ExtensionInstaller';
import { EXAMPLE_EXTENSION_SOURCES } from '../../extensions/exampleSources';
import PermissionApprovalDialog from './PermissionApprovalDialog';

/**
 * The "marketplace" — a browsable list of installable extensions. This
 * is explicitly a curated, bundled catalog (see extensionCatalog.js's
 * header comment for why), and the panel says so plainly rather than
 * presenting itself as a live store with a search-the-internet feel.
 */
export default function ExtensionMarketplace() {
  const theme = useCodeForgeTheme();
  const [query, setQuery] = useState('');
  const [pendingManifest, setPendingManifest] = useState(null);
  const [installing, setInstalling] = useState(null); // extension id currently installing

  const isInstalled = useExtensionStore((s) => s.isInstalled);
  // Subscribed so the list re-renders (installed -> "Installed" label)
  // immediately after a successful install, without needing a manual refresh.
  const installedList = useExtensionStore((s) => s.installed);

  const results = useMemo(() => searchCatalog(query), [query]);

  const handleInstallPress = useCallback((manifest) => {
    setPendingManifest(manifest);
  }, []);

  const handleApprove = useCallback(
    async (grantedPermissions) => {
      const manifest = pendingManifest;
      setPendingManifest(null);
      setInstalling(manifest.id);

      const catalogEntry = CATALOG.find((e) => e.manifest.id === manifest.id);
      const sources = EXAMPLE_EXTENSION_SOURCES[catalogEntry.sourceDir] || {};

      const result = await installExtension(manifest, sources, grantedPermissions);
      setInstalling(null);

      if (result.success) {
        Toast.show({ type: 'success', text1: `Installed ${manifest.displayName}` });
      } else {
        Toast.show({ type: 'error', text1: 'Install failed', text2: result.error });
      }
    },
    [pendingManifest]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}>
      <View style={styles.header}>
        <RNTextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search extensions"
          placeholderTextColor={theme.palette.onSurfaceDim}
          style={[styles.searchInput, { color: theme.palette.onSurface, backgroundColor: theme.palette.surfaceContainer }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, marginTop: 6, paddingHorizontal: 2 }}>
          A small built-in catalog — not a live, internet-connected marketplace.
        </Text>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.manifest.id}
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={
          <Text style={{ color: theme.palette.onSurfaceDim, textAlign: 'center', padding: 24 }}>
            No extensions match "{query}"
          </Text>
        }
        renderItem={({ item }) => {
          const installed = isInstalled(item.manifest.id);
          const isBusy = installing === item.manifest.id;
          return (
            <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainer, borderColor: theme.palette.outlineVariant }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: theme.palette.primaryContainer }]}>
                  <MaterialCommunityIcons name={item.icon} size={20} color={theme.palette.onPrimaryContainer} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: theme.palette.onSurface, fontSize: 14, fontWeight: '600' }}>
                    {item.manifest.displayName}
                  </Text>
                  <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11 }}>
                    {item.manifest.publisher} · v{item.manifest.version}
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 12.5, marginTop: 8, marginBottom: 10 }}>
                {item.manifest.description}
              </Text>
              <Button
                mode={installed ? 'outlined' : 'contained'}
                disabled={installed || isBusy}
                loading={isBusy}
                onPress={() => handleInstallPress(item.manifest)}
                compact
              >
                {installed ? 'Installed' : 'Install'}
              </Button>
            </View>
          );
        }}
      />

      <PermissionApprovalDialog
        visible={!!pendingManifest}
        manifest={pendingManifest}
        onApprove={handleApprove}
        onCancel={() => setPendingManifest(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 8 },
  searchInput: { height: 34, borderRadius: 6, paddingHorizontal: 10, fontSize: 13 },
  card: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
