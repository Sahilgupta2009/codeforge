import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Modal from 'react-native-modal';
import { Text, Button, Checkbox } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { PERMISSION_DESCRIPTIONS } from '../../extensions/manifestSchema';

/**
 * Shown before installing an extension: lists every permission it
 * declared in plain language (via PERMISSION_DESCRIPTIONS), letting the
 * user uncheck individual ones before confirming. Unchecked permissions
 * are simply not included in the grant set passed to installExtension —
 * per manifestSchema.js's permission model, the extension's bridge
 * calls for anything unchecked will be denied by ExtensionRuntime's
 * isMethodAllowed check at runtime, not silently degraded.
 */
export default function PermissionApprovalDialog({ visible, manifest, onApprove, onCancel }) {
  const theme = useCodeForgeTheme();
  const [checkedPermissions, setCheckedPermissions] = useState(() => new Set(manifest?.permissions || []));

  if (!manifest) return null;

  const toggle = (perm) => {
    setCheckedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const handleApprove = () => {
    onApprove(Array.from(checkedPermissions));
  };

  return (
    <Modal isVisible={visible} onBackdropPress={onCancel} style={styles.modal}>
      <View style={[styles.card, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <Text variant="titleMedium" style={{ color: theme.palette.onSurface }}>
          Install "{manifest.displayName}"?
        </Text>
        <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, marginTop: 4, marginBottom: 12 }}>
          by {manifest.publisher || 'Unknown'} · v{manifest.version}
        </Text>

        <Text style={{ color: theme.palette.onSurfaceVariant, marginBottom: 8, fontSize: 13 }}>
          This extension will be able to:
        </Text>

        <ScrollView style={{ maxHeight: 260 }}>
          {(manifest.permissions || []).map((perm) => (
            <View key={perm} style={styles.permissionRow}>
              <Checkbox
                status={checkedPermissions.has(perm) ? 'checked' : 'unchecked'}
                onPress={() => toggle(perm)}
                color={theme.palette.primary}
              />
              <Text style={{ color: theme.palette.onSurface, flex: 1, fontSize: 13 }}>
                {PERMISSION_DESCRIPTIONS[perm] || perm}
              </Text>
            </View>
          ))}
          {(!manifest.permissions || manifest.permissions.length === 0) && (
            <View style={styles.permissionRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={theme.palette.onSurfaceDim} />
              <Text style={{ color: theme.palette.onSurfaceDim, marginLeft: 8, fontSize: 13 }}>
                No special permissions requested.
              </Text>
            </View>
          )}
        </ScrollView>

        <Text variant="bodySmall" style={{ color: theme.palette.onSurfaceDim, marginTop: 8 }}>
          Uncheck anything you don't want to allow — the extension simply won't be able to do it.
        </Text>

        <View style={styles.buttonRow}>
          <Button onPress={onCancel} textColor={theme.palette.onSurfaceVariant}>
            Cancel
          </Button>
          <Button onPress={handleApprove} mode="contained">
            Install
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', margin: 16 },
  card: { borderRadius: 16, padding: 20 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 4 },
});
