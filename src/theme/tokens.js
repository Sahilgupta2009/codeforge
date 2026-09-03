/**
 * Material 3 color and typography tokens for CodeForge.
 *
 * These are original color values (not copied from any existing IDE or
 * Microsoft product). The dark theme is tuned for long editing sessions —
 * low-glare surfaces, a desaturated blue-gray family, and a single accent
 * (teal) used sparingly for focus/selection states.
 */

const darkPalette = {
  // Surfaces
  surface: '#141518',
  surfaceContainerLowest: '#0e0f11',
  surfaceContainerLow: '#191a1d',
  surfaceContainer: '#1d1f23',
  surfaceContainerHigh: '#25272c',
  surfaceContainerHighest: '#2f3237',
  surfaceVariant: '#2a2d32',
  inverseSurface: '#e3e2e6',

  // Text / on-surface
  onSurface: '#e3e2e6',
  onSurfaceVariant: '#9a9da3',
  onSurfaceDim: '#6d7077',
  inverseOnSurface: '#1d1f23',

  // Brand / accent
  primary: '#5cc9c0',
  onPrimary: '#00332f',
  primaryContainer: '#0a4a44',
  onPrimaryContainer: '#9de5db',

  secondary: '#b8c4c2',
  onSecondary: '#22312f',
  secondaryContainer: '#384845',
  onSecondaryContainer: '#d4e0de',

  // Semantic
  error: '#ff8a80',
  onError: '#5c0a02',
  errorContainer: '#7a1408',
  onErrorContainer: '#ffdad4',
  success: '#7fd99a',
  warning: '#f2c465',
  info: '#7fb8e8',

  // Structural
  outline: '#3a3d42',
  outlineVariant: '#26282c',
  scrim: 'rgba(0,0,0,0.55)',

  // Editor-specific
  editorBackground: '#101114',
  editorGutter: '#16171a',
  editorLineHighlight: '#1c1e22',
  editorSelection: 'rgba(92,201,192,0.22)',
  editorCursor: '#5cc9c0',
  editorFold: '#3a3d42',

  // Syntax token colors (original palette, not copied from any theme)
  syntax: {
    keyword: '#c98ee0',
    string: '#9dd88d',
    number: '#e0a15c',
    comment: '#6d7077',
    function: '#7fb8e8',
    variable: '#e3e2e6',
    type: '#5cc9c0',
    operator: '#d68fb0',
    tag: '#e08a8a',
    attribute: '#e0a15c',
    punctuation: '#9a9da3',
    constant: '#e0a15c',
  },

  // Git status colors
  git: {
    added: '#7fd99a',
    modified: '#f2c465',
    deleted: '#ff8a80',
    untracked: '#7fb8e8',
    conflict: '#e08a8a',
  },
};

const lightPalette = {
  surface: '#fbfaf9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f3f2',
  surfaceContainer: '#eeedec',
  surfaceContainerHigh: '#e8e7e6',
  surfaceContainerHighest: '#e2e1e0',
  surfaceVariant: '#e0e3e2',
  inverseSurface: '#2e3032',

  onSurface: '#1a1c1e',
  onSurfaceVariant: '#484b4d',
  onSurfaceDim: '#75787a',
  inverseOnSurface: '#f0f1f2',

  primary: '#006a60',
  onPrimary: '#ffffff',
  primaryContainer: '#9de5db',
  onPrimaryContainer: '#00201c',

  secondary: '#4a635f',
  onSecondary: '#ffffff',
  secondaryContainer: '#cce8e3',
  onSecondaryContainer: '#05201c',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad4',
  onErrorContainer: '#410001',
  success: '#1e7a3d',
  warning: '#8a5f00',
  info: '#2e6187',

  outline: '#d9dcda',
  outlineVariant: '#e8e7e6',
  scrim: 'rgba(0,0,0,0.35)',

  editorBackground: '#ffffff',
  editorGutter: '#f4f3f2',
  editorLineHighlight: '#f0f1ee',
  editorSelection: 'rgba(0,106,96,0.16)',
  editorCursor: '#006a60',
  editorFold: '#d9dcda',

  syntax: {
    keyword: '#8b3fa8',
    string: '#1e7a3d',
    number: '#a15c00',
    comment: '#75787a',
    function: '#2e6187',
    variable: '#1a1c1e',
    type: '#006a60',
    operator: '#a13d68',
    tag: '#b3261e',
    attribute: '#a15c00',
    punctuation: '#484b4d',
    constant: '#a15c00',
  },

  git: {
    added: '#1e7a3d',
    modified: '#8a5f00',
    deleted: '#ba1a1a',
    untracked: '#2e6187',
    conflict: '#b3261e',
  },
};

export const typography = {
  fontFamilyOptions: [
    { id: 'mono-regular', label: 'Default Mono', family: 'monospace' },
    { id: 'mono-condensed', label: 'Condensed Mono', family: 'monospace' },
    { id: 'mono-rounded', label: 'Rounded Mono', family: 'monospace' },
  ],
  uiFontFamily: 'System',
  editorFontSizeDefault: 14,
  editorFontSizeMin: 9,
  editorFontSizeMax: 32,
  editorLineHeightMultiplier: 1.5,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
};

export const elevation = {
  level0: 'none',
  level1: '0px 1px 2px rgba(0,0,0,0.15)',
  level2: '0px 2px 6px rgba(0,0,0,0.2)',
  level3: '0px 4px 12px rgba(0,0,0,0.25)',
};

export function getPalette(mode) {
  return mode === 'dark' ? darkPalette : lightPalette;
}

export default { darkPalette, lightPalette, typography, spacing, radii, elevation, getPalette };
