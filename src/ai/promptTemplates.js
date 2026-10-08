/**
 * promptTemplates.js
 * ------------------
 * Pure prompt-construction logic for the AI Assistant. Every function
 * here takes plain data (code strings, language ids, selections,
 * conversation history) and returns either:
 *   - a `{ system, user }` pair for one-off code actions, or
 *   - a `{ system, messages }` pair for multi-turn chat,
 * with no dependency on React Native, Zustand, or any provider — so
 * these can be (and are) unit tested with plain Node.
 *
 * Code-action prompts are deliberately instructed to respond with a
 * single fenced code block (plus optional brief prose before/after) so
 * `extractFirstCodeBlock` below can reliably pull out just the code for
 * "Insert" actions, while Explain intentionally does NOT ask for a code
 * fence, since its output is prose.
 */

const LANGUAGE_LABELS = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  dart: 'Dart',
  markdown: 'Markdown',
  plaintext: 'plain text',
};

function languageLabel(languageId) {
  if (!languageId) return 'code';
  return LANGUAGE_LABELS[languageId] || languageId;
}

function fence(languageId, code) {
  const tag = languageId && languageId !== 'plaintext' ? languageId : '';
  return '```' + tag + '\n' + code + '\n```';
}

const BASE_SYSTEM_PROMPT =
  'You are the AI Assistant built into CodeForge, a mobile code editor for Android. ' +
  'You help with reading, writing, explaining, and fixing code directly inside the ' +
  "editor. Be concise and technically precise; the user is on a phone screen, so " +
  'avoid padding responses with unnecessary preamble or restating the request.';

/** Explain the given code (or selection). Prose-only response, no fence requested. */
export function buildExplainPrompt({ code, language, selection, fileName }) {
  const label = languageLabel(language);
  const scope = selection ? 'the selected snippet' : 'this file';
  const target = selection || code;
  const system = BASE_SYSTEM_PROMPT;
  const user =
    `Explain ${scope} of ${label} code${fileName ? ` from ${fileName}` : ''}.\n` +
    `Cover what it does, and call out anything non-obvious (edge cases, side effects, complexity).\n\n` +
    fence(language, target);
  return { system, user };
}

/** Generate new code from a natural-language instruction, given surrounding file context. */
export function buildGeneratePrompt({ instruction, code, language, cursorContext, fileName }) {
  const label = languageLabel(language);
  const system =
    BASE_SYSTEM_PROMPT +
    ' When asked to generate code, respond with a single fenced code block containing ' +
    'ONLY the new code to insert (no surrounding explanation inside the fence), optionally ' +
    'preceded or followed by at most one short sentence of context outside the fence.';

  let user = `Write ${label} code for the following request${fileName ? ` in ${fileName}` : ''}:\n\n${instruction}`;
  if (cursorContext) {
    user += `\n\nSurrounding code for context (the new code will be inserted at the cursor position, marked <CURSOR>):\n\n${fence(
      language,
      cursorContext
    )}`;
  } else if (code) {
    user += `\n\nExisting file content for context:\n\n${fence(language, code)}`;
  }
  return { system, user };
}

/** Fix bugs in the given code, optionally guided by an error message. */
export function buildFixPrompt({ code, language, selection, errorMessage, fileName }) {
  const label = languageLabel(language);
  const target = selection || code;
  const system =
    BASE_SYSTEM_PROMPT +
    ' When fixing code, respond with a single fenced code block containing the corrected ' +
    'version of the ENTIRE snippet provided (not just the changed lines), followed by a short ' +
    'bullet list of what was wrong and what changed.';

  let user = `Find and fix the bug(s) in this ${label} code${fileName ? ` from ${fileName}` : ''}:\n\n${fence(
    language,
    target
  )}`;
  if (errorMessage) {
    user += `\n\nReported error / symptom:\n${errorMessage}`;
  }
  return { system, user };
}

/** Refactor the given code for readability/maintainability without changing behavior. */
export function buildRefactorPrompt({ code, language, selection, goal, fileName }) {
  const label = languageLabel(language);
  const target = selection || code;
  const system =
    BASE_SYSTEM_PROMPT +
    ' When refactoring code, respond with a single fenced code block containing the ' +
    'refactored ENTIRE snippet, preserving external behavior, followed by a short bullet ' +
    'list explaining the key changes.';

  let user = `Refactor this ${label} code${fileName ? ` from ${fileName}` : ''} for clarity and maintainability` +
    `${goal ? `, specifically: ${goal}` : ''}, without changing its behavior:\n\n${fence(language, target)}`;
  return { system, user };
}

/** Add explanatory comments/docstrings to the given code. */
export function buildCommentPrompt({ code, language, selection, fileName }) {
  const label = languageLabel(language);
  const target = selection || code;
  const system =
    BASE_SYSTEM_PROMPT +
    ' When commenting code, respond with a single fenced code block containing the ENTIRE ' +
    'snippet with appropriate comments/docstrings added, using the idiomatic comment style ' +
    'for the language. Do not change any actual logic. No prose outside the fence is needed.';

  const user = `Add clear, idiomatic comments (and a docstring where appropriate) to this ${label} code${
    fileName ? ` from ${fileName}` : ''
  }:\n\n${fence(language, target)}`;
  return { system, user };
}

/** Continue writing from wherever the cursor / selection currently ends. */
export function buildContinuePrompt({ code, language, cursorContext, fileName }) {
  const label = languageLabel(language);
  const system =
    BASE_SYSTEM_PROMPT +
    ' When continuing code, respond with a single fenced code block containing ONLY the new ' +
    'continuation text to append (not a repeat of what already exists), matching the existing ' +
    'style and indentation.';

  const context = cursorContext || code || '';
  const user =
    `Continue writing this ${label} code${fileName ? ` from ${fileName}` : ''} naturally from where it leaves off:\n\n` +
    fence(language, context);
  return { system, user };
}

/**
 * Builds the prompt payload for a one-off code action by name. Keeping
 * this dispatch table here (rather than in aiService.js) means
 * aiService only needs to know the action id, not each template's
 * individual argument shape.
 */
export function buildCodeActionPrompt(actionId, params) {
  switch (actionId) {
    case 'explain':
      return buildExplainPrompt(params);
    case 'generate':
      return buildGeneratePrompt(params);
    case 'fix':
      return buildFixPrompt(params);
    case 'refactor':
      return buildRefactorPrompt(params);
    case 'comment':
      return buildCommentPrompt(params);
    case 'continue':
      return buildContinuePrompt(params);
    default:
      throw new Error(`Unknown code action: ${actionId}`);
  }
}

/**
 * Builds the system prompt + message list for the multi-turn Chat panel.
 * `history` is an array of { role: 'user'|'assistant', content: string }
 * already trimmed to whatever window useAIStore decides to send; this
 * function does not itself do any truncation.
 */
export function buildChatPrompt({ history, activeFileContext }) {
  let system = BASE_SYSTEM_PROMPT;
  if (activeFileContext?.fileName) {
    system +=
      `\n\nThe user currently has "${activeFileContext.fileName}" open` +
      `${activeFileContext.language ? ` (${languageLabel(activeFileContext.language)})` : ''}` +
      '. Only reference its contents if the user asks about it or it is otherwise relevant — ' +
      'do not assume every message is about this file.';
  }
  const messages = (history || []).map((m) => ({ role: m.role, content: m.content }));
  return { system, messages };
}

/**
 * Extracts the first fenced code block (```lang\ncode\n```` or plain
 * ```\ncode\n````) from a text response. Returns { code, language } or
 * null if no fence is present. Used by the Chat panel's "Insert" action
 * and by the code-action sheet to pull out just the code portion of a
 * response that may also contain surrounding prose.
 */
export function extractFirstCodeBlock(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/);
  if (!match) return null;
  const language = match[1] ? match[1].trim() : null;
  // Strip exactly one trailing newline that commonly precedes the
  // closing fence, but preserve any intentional blank lines within the
  // code itself.
  let code = match[2];
  if (code.endsWith('\n')) code = code.slice(0, -1);
  return { code, language: language || null };
}

export default {
  buildExplainPrompt,
  buildGeneratePrompt,
  buildFixPrompt,
  buildRefactorPrompt,
  buildCommentPrompt,
  buildContinuePrompt,
  buildCodeActionPrompt,
  buildChatPrompt,
  extractFirstCodeBlock,
};
