import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import WelcomeScreen from '../screens/WelcomeScreen';
import WorkspaceScreen from '../screens/WorkspaceScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useWorkspaceStore } from '../state/useWorkspaceStore';
import { useCodeForgeTheme } from '../theme/ThemeProvider';

const Stack = createNativeStackNavigator();

/**
 * Top-level stack:
 *  - Welcome: shown when no workspace is open (recent projects, open folder)
 *  - Workspace: the main IDE shell (explorer + editor + terminal + panels)
 *  - Settings: pushed modally over Workspace
 *
 * Deeper navigation (git panel, extensions marketplace, AI panel, search)
 * is handled as in-shell panels within WorkspaceScreen rather than stack
 * routes, since on mobile those need to coexist with the editor rather
 * than replace it — see src/screens/WorkspaceScreen.js in Part 4.
 */
export default function RootNavigator() {
  const theme = useCodeForgeTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);

  const navTheme = {
    dark: theme.mode === 'dark',
    colors: {
      primary: theme.palette.primary,
      background: theme.palette.surface,
      card: theme.palette.surfaceContainer,
      text: theme.palette.onSurface,
      border: theme.palette.outline,
      notification: theme.palette.error,
    },
    fonts: theme.paperTheme.fonts,
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={workspace ? 'Workspace' : 'Welcome'}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Workspace" component={WorkspaceScreen} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
