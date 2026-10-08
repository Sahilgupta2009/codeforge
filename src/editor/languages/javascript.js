import { COMMON, keywordRule, identifierRule, functionCallRule } from './shared';

const KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'default', 'break', 'continue', 'class', 'extends',
  'super', 'new', 'this', 'import', 'export', 'from', 'as', 'default',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
  'in', 'of', 'void', 'delete', 'yield', 'static', 'get', 'set', 'null',
  'undefined', 'true', 'false',
  // TS-specific — harmless to include for plain JS since they just won't
  // appear, and this lets one definition serve both .js and .ts/.tsx.
  'interface', 'type', 'enum', 'implements', 'namespace', 'declare',
  'readonly', 'public', 'private', 'protected', 'abstract', 'as',
];

export const javascript = {
  id: 'javascript',
  initialState: null,
  stateHandlers: {
    'block-comment': { type: 'comment', closeRegex: /\*\// },
    'template-literal': { type: 'string', closeRegex: /(?<!\\)`/ },
  },
  rules: [
    { type: 'comment', regex: /^\/\/.*/ },
    { type: 'comment', regex: /^\/\*/, opensState: 'block-comment' },
    { type: 'string', regex: /^`(?:\\.|[^`\\])*`?/ }, // simple template literal without ${} nesting; good enough for a token color pass
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: COMMON.singleQuoteString },
    { type: 'number', regex: COMMON.number },
    { type: 'tag', regex: /^<\/?[A-Za-z][A-Za-z0-9.]*/ }, // JSX opening tags (heuristic)
    keywordRule(KEYWORDS, 'keyword'),
    functionCallRule(),
    { type: 'type', regex: /^\b[A-Z][A-Za-z0-9_]*\b/ },
    identifierRule('variable'),
    { type: 'operator', regex: /^(\?\?=?|\?\.|=>|\.\.\.|===|!==|[-+*/%<>!~^&|?]=?|&&|\|\|)/ },
    { type: 'punctuation', regex: COMMON.punctuation },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export const typescript = { ...javascript, id: 'typescript' };

export default javascript;
