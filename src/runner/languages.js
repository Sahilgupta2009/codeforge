/**
 * Maps CodeForge language ids (see utils/pathUtils.js) to Judge0 CE
 * language ids. Judge0 is an open-source online code-execution service;
 * its public instance compiles/runs real GCC, CPython, Node, OpenJDK, etc.
 * on a server (a phone cannot ship a C/C++ compiler).
 */
export const RUNNABLE = {
  python: { id: 71, label: 'Python 3', file: 'main.py' },
  c: { id: 50, label: 'C (GCC)', file: 'main.c' },
  cpp: { id: 54, label: 'C++ (GCC)', file: 'main.cpp' },
  javascript: { id: 63, label: 'JavaScript (Node)', file: 'main.js' },
  typescript: { id: 74, label: 'TypeScript', file: 'main.ts' },
  java: { id: 62, label: 'Java', file: 'Main.java' },
  shell: { id: 46, label: 'Bash', file: 'main.sh' },
};

export function isRunnableLanguage(language) {
  return Object.prototype.hasOwnProperty.call(RUNNABLE, language);
}
