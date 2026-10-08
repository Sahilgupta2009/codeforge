import React, { useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import Modal from 'react-native-modal';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useCodeForgeTheme } from '../theme/ThemeProvider';
import { useGitStore } from '../state/useGitStore';

export default function BranchSwitcher({ visible, onDismiss }) {
  const theme = useCodeForgeTheme();
  const branches = useGitStore((s) => s.branches);
  const currentBranch = useGitStore((s) => s.currentBranch);
  const isLoading = useGitStore((s) => s.isLoading);
  const checkoutBranch = useGitStore((s) => s.checkoutBranch);
  const createBranch = useGitStore((s) => s.createBranch);

  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const handleCheckout = async (branchName) => {
    if (branchName === currentBranch) {
      onDismiss();
      return;
    }
    const result = await checkoutBranch(branchName);
    if (result.success) {
      Toast.show({ type: 'success', text1: `Switched to ${branchName}` });
      onDismiss();
    } else {
      Toast.show({ type: 'error', text1: 'Checkout failed', text2: result.error });
    }
  };

  const handleCreate = async () => {
    if (!newBranchName.trim()) return;
    const result = await createBranch(newBranchName.trim(), { checkout: true });
    if (result.success) {
      Toast.show({ type: 'success', text1: `Created and switched to ${newBranchName.trim()}` });
      setNewBranchName('');
      setCreating(false);
      onDismiss();
    } else {
      Toast.show({ type: 'error', text1: 'Branch creation failed', text2: result.error });
    }
  };

  return (
    <Modal isVisible={visible} onBackdropPress={onDismiss} onSwipeComplete={onDismiss} swipeDirection="down" style={styles.modal} backdropOpacity={0.4}>
      <View style={[styles.sheet, { backgroundColor: theme.palette.surfaceContainerHigh }]}>
        <View style={styles.handle} />
        <Text variant="titleMedium" style={{ color: theme.palette.onSurface, paddingHorizontal: 20, marginBottom: 12 }}>
          Branches
        </Text>

        <FlatList
          data={branches}
          keyExtractor={(b) => b}
          style={{ maxHeight: 280 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleCheckout(item)}
              style={({ pressed }) => [
                styles.branchRow,
                { backgroundColor: pressed ? theme.palette.surfaceContainerHighest : 'transparent' },
              ]}
            >
              <MaterialCommunityIcons
                name={item === currentBranch ? 'check' : 'source-branch'}
                size={16}
                color={item === currentBranch ? theme.palette.primary : theme.palette.onSurfaceVariant}
              />
              <Text
                style={{
                  color: item === currentBranch ? theme.palette.primary : theme.palette.onSurface,
                  marginLeft: 12,
                  fontSize: 14,
                  fontWeight: item === currentBranch ? '600' : '400',
                }}
              >
                {item}
              </Text>
            </Pressable>
          )}
        />

        <View style={[styles.createSection, { borderTopColor: theme.palette.outlineVariant }]}>
          {creating ? (
            <>
              <TextInput
                mode="outlined"
                value={newBranchName}
                onChangeText={setNewBranchName}
                placeholder="new-branch-name"
                autoFocus
                dense
                onSubmitEditing={handleCreate}
              />
              <View style={styles.createButtons}>
                <Button onPress={() => setCreating(false)} textColor={theme.palette.onSurfaceVariant}>
                  Cancel
                </Button>
                <Button onPress={handleCreate} mode="contained" loading={isLoading} disabled={!newBranchName.trim()}>
                  Create & Switch
                </Button>
              </View>
            </>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={styles.newBranchButton}>
              <MaterialCommunityIcons name="plus" size={16} color={theme.palette.primary} />
              <Text style={{ color: theme.palette.primary, marginLeft: 8, fontSize: 14 }}>Create New Branch</Text>
            </Pressable>
          )}
          {isLoading && !creating && <ActivityIndicator size={16} color={theme.palette.primary} style={{ marginTop: 8 }} />}
        </View>
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
  branchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  createSection: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, marginTop: 8 },
  createButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 4 },
  newBranchButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
});
