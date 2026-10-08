import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Modal from 'react-native-modal';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import { useEditorStore } from '../../state/useEditorStore';

export default function TabContextMenu({ paneId, tab, onDismiss }) {
  const theme = useCodeForgeTheme();
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const pinTab = useEditorStore((s) => s.pinTab);
  const splitPane = useEditorStore((s) => s.splitPane);

  const isOpen = !!tab;
  if (!tab) return null;

  const actions = [
    ...(tab.isPreview
      ? [{ icon: 'pin-outline', label: 'Keep Open (Pin Tab)', onPress: () => pinTab(paneId, tab.id) }]
      : []),
    { icon: 'dock-right', label: 'Split Right', onPress: () => splitPane('horizontal') },
    { icon: 'close', label: 'Close', onPress: () => closeTab(paneId, tab.id) },
    { icon: 'close-box-multiple-outline', label: 'Close Others', onPress: () => closeOtherTabs(paneId, tab.id) },
    { icon: 'close-box-outline', label: 'Close All', onPress: () => closeAllTabs(paneId) },
  ];

  const handlePress = (action) => {
    action.onPress();
    onDismiss();
  };

  return (
    <Modal isVisible={isOpen} onBackdropPress={onDismiss} onSwipeComplete={onDismiss} swipeDirection="down" style={styles.modal} backdropOpacity={0.4}>
      <View style={[styles.sheet, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={styles.handle} />
        <Text numberOfLines={1} style={{ color: theme.palette.onSurfaceVariant, paddingHorizontal: 20, marginBottom: 8 }}>
          {tab.name}
        </Text>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => handlePress(action)}
            style={({ pressed }) => [
              styles.actionRow,
              { backgroundColor: pressed ? theme.palette.surfaceContainerHighest : 'transparent' },
            ]}
          >
            <MaterialCommunityIcons name={action.icon} size={20} color={theme.palette.onSurfaceVariant} />
            <Text style={{ color: theme.palette.onSurface, marginLeft: 16, fontSize: 15 }}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24, paddingTop: 8 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.4)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
});
