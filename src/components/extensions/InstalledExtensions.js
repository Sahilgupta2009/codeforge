import React, { useCallback, useState } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useExtensionStore } from '../../state/useExtensionStore';
import { uninstallExtension } from '../../extensions/ExtensionInstaller';
import { PERMISSION_DESCRIPTIONS } from '../../extensions/manifestSchema';
import { getCatalogEntry } from '../../extensions/extensionCatalog';

/**
 * Lists everything currently installed with live enable/disable toggles
 * and an uninstall action. Expanding an entry shows exactly which
 * permissions were granted at install time (the actual enforced set,
 * per ExtensionRuntime.js's isMethodAllowed checks — not just what the
 * manifest requested).
 */
export default function InstalledExtensions() {
  const theme = useCodeForgeTheme();
  const installed = useExtensionStore((s) => s.installed);
  const setEnabled = useExtensionStore((s) => s.setEnabled);
  const [expandedId, setExpandedId] = useState(null);

  const handleUninstall = useCallback(async (extensionId, displayName) => {
    const result = await uninstallExtension(extensionId);
    if (result.success) {
      Toast.show({ type: 'success', text1: `Uninstalled ${displayName}` });
    } else {
      Toast.show({ type: 'error', text1: 'Uninstall failed', text2: result.error });
    }
  }, []);

  if (installed.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.palette.surfaceContainerLow }]}>
        <MaterialCommunityIcons name="puzzle-outline" size={32} color={theme.palette.onSurfaceDim} />
        <Text style={{ color: theme.palette.onSurfaceDim, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
          No extensions installed yet. Browse the marketplace to add some.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}>
      <FlatList
        data={installed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 8 }}
        renderItem={({ item }) => {
          const catalogEntry = getCatalogEntry(item.id);
          const isExpanded = expandedId === item.id;
          return (
            <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainer, borderColor: theme.palette.outlineVariant }]}>
              <Pressable onPress={() => setExpandedId(isExpanded ? null : item.id)} style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name={catalogEntry?.icon || 'puzzle-outline'}
                  size={20}
                  color={item.enabled ? theme.palette.primary : theme.palette.onSurfaceDim}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: theme.palette.onSurface, fontSize: 14, fontWeight: '600' }}>
                    {item.manifest.displayName}
                  </Text>
                  <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 11 }}>
                    v{item.manifest.version} · installed {formatDate(item.installedAt)}
                  </Text>
                </View>
                <Switch value={item.enabled} onValueChange={(v) => setEnabled(item.id, v)} color={theme.palette.primary} />
              </Pressable>

              {isExpanded && (
                <View style={styles.expandedSection}>
                  <Text style={{ color: theme.palette.onSurfaceVariant, fontSize: 12, marginBottom: 6 }}>
                    Granted permissions:
                  </Text>
                  {item.grantedPermissions.length === 0 ? (
                    <Text style={{ color: theme.palette.onSurfaceDim, fontSize: 12 }}>None</Text>
                  ) : (
                    item.grantedPermissions.map((perm) => (
                      <Text key={perm} style={{ color: theme.palette.onSurfaceDim, fontSize: 12, marginLeft: 8 }}>
                        • {PERMISSION_DESCRIPTIONS[perm] || perm}
                      </Text>
                    ))
                  )}
                  <Pressable
                    onPress={() => handleUninstall(item.id, item.manifest.displayName)}
                    style={styles.uninstallButton}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={15} color={theme.palette.error} />
                    <Text style={{ color: theme.palette.error, fontSize: 12.5, marginLeft: 6 }}>Uninstall</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString();
  } catch (err) {
    return '';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 10, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  expandedSection: { paddingHorizontal: 12, paddingBottom: 12 },
  uninstallButton: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
});
