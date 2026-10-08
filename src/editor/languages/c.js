import { COMMON, keywordRule, identifierRule, functionCallRule } from './shared';

const KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline',
  'int', 'long', 'register', 'restrict', 'return', 'short', 'signed',
  'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned',
  'void', 'volatile', 'while', '_Bool', 'NULL',
];

export const c = {
  id: 'c',
  initialState: null,
  stateHandlers: {
    'block-comment': { type: 'comment', closeRegex: /\*\// },
  },
  rules: [
    { type: 'comment', regex: /^\/\/.*/ },
    { type: 'comment', regex: /^\/\*/, opensState: 'block-comment' },
    { type: 'attribute', regex: /^#\s*[a-zA-Z]+/ }, // preprocessor directives
    { type: 'string', regex: /^<[A-Za-z0-9_./]+\.h>/ }, // #include <foo.h>
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: /^'(?:\\.|[^'\\])'/ }, // char literal
    { type: 'number', regex: COMMON.number },
    keywordRule(KEYWORDS, 'keyword'),
    functionCallRule(),
    { type: 'type', regex: /^\b[A-Z][A-Za-z0-9_]*_t?\b/ },
    identifierRule('variable'),
    { type: 'operator', regex: /^(->|\+\+|--|&&|\|\||[-+*/%<>!=&|^~]=?)/ },
    { type: 'punctuation', regex: COMMON.punctuation },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default c;
