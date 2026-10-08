import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { useCodeForgeTheme } from '../../theme/ThemeProvider';
import ExtensionMarketplace from './ExtensionMarketplace';
import InstalledExtensions from './InstalledExtensions';

export default function ExtensionsPanel() {
  const theme = useCodeForgeTheme();
  const [tab, setTab] = useState('marketplace'); // 'marketplace' | 'installed'

  return (
    <View style={[styles.container, { backgroundColor: theme.palette.surfaceContainerLow }]}>
      <View style={[styles.tabRow, { borderBottomColor: theme.palette.outlineVariant }]}>
        <Pressable onPress={() => setTab('marketplace')} style={styles.tabButton}>
          <Text
            style={{
              color: tab === 'marketplace' ? theme.palette.primary : theme.palette.onSurfaceVariant,
              fontSize: 12.5,
              fontWeight: tab === 'marketplace' ? '700' : '400',
            }}
          >
            Marketplace
          </Text>
          {tab === 'marketplace' && <View style={[styles.underline, { backgroundColor: theme.palette.primary }]} />}
        </Pressable>
        <Pressable onPress={() => setTab('installed')} style={styles.tabButton}>
          <Text
            style={{
              color: tab === 'installed' ? theme.palette.primary : theme.palette.onSurfaceVariant,
              fontSize: 12.5,
              fontWeight: tab === 'installed' ? '700' : '400',
            }}
          >
            Installed
          </Text>
          {tab === 'installed' && <View style={[styles.underline, { backgroundColor: theme.palette.primary }]} />}
        </Pressable>
      </View>

      {tab === 'marketplace' ? <ExtensionMarketplace /> : <InstalledExtensions />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  underline: { height: 2, width: '60%', marginTop: 6, borderRadius: 1 },
});
