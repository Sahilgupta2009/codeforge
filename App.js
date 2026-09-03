import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Appearance } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';

import { CodeForgeThemeProvider, useCodeForgeTheme } from './src/theme/ThemeProvider';
import { useSettingsStore } from './src/state/useSettingsStore';
import RootNavigator from './src/navigation/RootNavigator';
import { FileSystemEventBus } from './src/filesystem/FileSystemEventBus';

function AppShell() {
  const theme = useCodeForgeTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
      <Toast />
    </>
  );
}

export default function App() {
  const setSystemColorScheme = useSettingsStore((s) => s.setSystemColorScheme);

  useEffect(() => {
    // Keep the store in sync with the OS theme so 'system' mode reacts live.
    setSystemColorScheme(Appearance.getColorScheme() || 'dark');
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(colorScheme || 'dark');
    });
    return () => sub.remove();
  }, [setSystemColorScheme]);

  useEffect(() => {
    // Initialize the app-wide file mutation event bus once at startup.
    FileSystemEventBus.init();
    return () => FileSystemEventBus.teardown();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CodeForgeThemeProvider>
          <AppShell />
        </CodeForgeThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
