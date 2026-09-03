import React, { createContext, useContext, useMemo } from 'react';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';
import { getPalette, typography, spacing, radii, elevation } from './tokens';
import { useSettingsStore } from '../state/useSettingsStore';

const CodeForgeThemeContext = createContext(null);

/**
 * Builds a full theme object combining:
 *  - Material 3 (react-native-paper) theme, for standard components
 *  - CodeForge-specific tokens (editor colors, syntax colors, git colors)
 *    consumed directly by editor/terminal/git components that need finer
 *    control than Paper's theme shape provides.
 */
function buildTheme(mode) {
  const palette = getPalette(mode);
  const base = mode === 'dark' ? MD3DarkTheme : MD3LightTheme;

  const paperTheme = {
    ...base,
    dark: mode === 'dark',
    colors: {
      ...base.colors,
      primary: palette.primary,
      onPrimary: palette.onPrimary,
      primaryContainer: palette.primaryContainer,
      onPrimaryContainer: palette.onPrimaryContainer,
      secondary: palette.secondary,
      onSecondary: palette.onSecondary,
      secondaryContainer: palette.secondaryContainer,
      onSecondaryContainer: palette.onSecondaryContainer,
      background: palette.surface,
      onBackground: palette.onSurface,
      surface: palette.surface,
      onSurface: palette.onSurface,
      surfaceVariant: palette.surfaceVariant,
      onSurfaceVariant: palette.onSurfaceVariant,
      outline: palette.outline,
      outlineVariant: palette.outlineVariant,
      error: palette.error,
      onError: palette.onError,
      errorContainer: palette.errorContainer,
      onErrorContainer: palette.onErrorContainer,
      elevation: {
        level0: 'transparent',
        level1: palette.surfaceContainerLow,
        level2: palette.surfaceContainer,
        level3: palette.surfaceContainerHigh,
        level4: palette.surfaceContainerHigh,
        level5: palette.surfaceContainerHighest,
      },
      surfaceDisabled: palette.surfaceVariant,
      onSurfaceDisabled: palette.onSurfaceDim,
      backdrop: palette.scrim,
    },
  };

  return {
    mode,
    palette,
    paperTheme,
    typography,
    spacing,
    radii,
    elevation,
  };
}

export function CodeForgeThemeProvider({ children }) {
  const themeMode = useSettingsStore((s) => s.themeMode); // 'light' | 'dark' | 'system'
  const systemScheme = useSettingsStore((s) => s.systemColorScheme);

  const resolvedMode = themeMode === 'system' ? systemScheme || 'dark' : themeMode;
  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);

  return (
    <CodeForgeThemeContext.Provider value={theme}>
      <PaperProvider theme={theme.paperTheme}>{children}</PaperProvider>
    </CodeForgeThemeContext.Provider>
  );
}

/**
 * Primary hook for accessing CodeForge theme tokens (palette, spacing,
 * typography, editor/syntax/git colors) from any component.
 */
export function useCodeForgeTheme() {
  const ctx = useContext(CodeForgeThemeContext);
  if (!ctx) {
    throw new Error('useCodeForgeTheme must be used within CodeForgeThemeProvider');
  }
  return ctx;
}
