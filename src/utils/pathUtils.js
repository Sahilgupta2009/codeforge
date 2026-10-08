/**
 * Path and file-classification utilities.
 *
 * SAF URIs on Android are content:// URIs, not filesystem paths, so we
 * can't use Node's `path` module semantics directly. These helpers work
 * off the *document name* (the last path segment as reported by SAF's
 * DocumentFile-equivalent metadata) rather than parsing the URI itself,
 * since SAF tree URIs are opaque and shouldn't be string-manipulated.
 */

const LANGUAGE_BY_EXTENSION = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  java: 'java',
  dart: 'dart',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plaintext',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  gradle: 'groovy',
  sh: 'shell',
  bash: 'shell',
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const BINARY_EXTENSIONS = new Set([
  'apk', 'zip', 'tar', 'gz', '7z', 'rar', 'jar', 'class', 'so', 'dex', 'exe', 'dll',
  'ttf', 'otf', 'woff', 'woff2', 'mp3', 'mp4', 'wav', 'ogg', 'mov', 'avi', 'db', 'sqlite',
]);

export function getExtension(name) {
  if (!name || typeof name !== 'string') return '';
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function getBaseName(name) {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === 0) return name;
  return name.slice(0, idx);
}

export function detectLanguage(name) {
  const ext = getExtension(name);
  return LANGUAGE_BY_EXTENSION[ext] || 'plaintext';
}

export function isImageFile(name) {
  return IMAGE_EXTENSIONS.has(getExtension(name));
}

export function isPdfFile(name) {
  return getExtension(name) === 'pdf';
}

export function isBinaryFile(name) {
  return BINARY_EXTENSIONS.has(getExtension(name));
}

export function isMarkdownFile(name) {
  return detectLanguage(name) === 'markdown';
}

export function isHtmlFile(name) {
  return detectLanguage(name) === 'html';
}

/**
 * Icon identifier (MaterialCommunityIcons name) for a given file/folder,
 * used by the Explorer tree. Kept centralized so Explorer rows, tab bar,
 * and search results render consistent icons.
 */
export function getFileIcon(name, isDirectory) {
  if (isDirectory) return 'folder';
  const lang = detectLanguage(name);
  const iconByLanguage = {
    python: 'language-python',
    javascript: 'language-javascript',
    typescript: 'language-typescript',
    html: 'language-html5',
    css: 'language-css3',
    json: 'code-json',
    c: 'language-c',
    cpp: 'language-cpp',
    java: 'language-java',
    dart: 'language-dart',
    markdown: 'language-markdown',
    yaml: 'file-cog-outline',
    xml: 'xml',
    shell: 'console',
    plaintext: 'file-document-outline',
  };
  if (isImageFile(name)) return 'file-image-outline';
  if (isPdfFile(name)) return 'file-pdf-box';
  return iconByLanguage[lang] || 'file-outline';
}

export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Sort directory entries the way most IDEs do: folders first (alpha), then
 * files (alpha), case-insensitive.
 */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Validates a proposed file/folder name against illegal characters and
 * reserved names, used by create/rename dialogs before hitting SAF.
 */
export function validateFileName(name) {
  if (!name || !name.trim()) return 'Name cannot be empty';
  if (name.length > 255) return 'Name is too long';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f<>:"/\\|?*]/.test(name)) return 'Name contains invalid characters';
  if (name === '.' || name === '..') return 'Invalid name';
  if (/[. ]$/.test(name)) return 'Name cannot end with a space or period';
  return null;
}

export default {
  getExtension,
  getBaseName,
  detectLanguage,
  isImageFile,
  isPdfFile,
  isBinaryFile,
  isMarkdownFile,
  isHtmlFile,
  getFileIcon,
  formatFileSize,
  sortEntries,
  validateFileName,
};
