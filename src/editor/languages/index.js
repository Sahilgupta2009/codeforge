import python from './python';
import { javascript, typescript } from './javascript';
import html from './html';
import css from './css';
import json from './json';
import c from './c';
import cpp from './cpp';
import java from './java';
import dart from './dart';
import markdown from './markdown';

/**
 * Maps a language id (as returned by utils/pathUtils.detectLanguage) to
 * its tokenizer definition. Languages not in this map (plaintext, yaml,
 * xml, shell, groovy) render as unhighlighted plain text — a graceful
 * fallback rather than an error, since the editor is still fully usable
 * for those file types.
 */
export const LANGUAGE_REGISTRY = {
  python,
  javascript,
  typescript,
  html,
  css,
  json,
  c,
  cpp,
  java,
  dart,
  markdown,
};

export function getLanguageDefinition(languageId) {
  return LANGUAGE_REGISTRY[languageId] || null;
}

/** Human-readable display names for the status bar / tab tooltips. */
export const LANGUAGE_DISPLAY_NAMES = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  dart: 'Dart',
  markdown: 'Markdown',
  plaintext: 'Plain Text',
  yaml: 'YAML',
  xml: 'XML',
  shell: 'Shell Script',
  groovy: 'Groovy',
};

export default LANGUAGE_REGISTRY;
