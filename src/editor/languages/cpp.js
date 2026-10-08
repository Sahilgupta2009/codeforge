import { COMMON, keywordRule, identifierRule, functionCallRule } from './shared';

const KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile',
  'while', 'class', 'public', 'private', 'protected', 'virtual', 'friend',
  'this', 'new', 'delete', 'namespace', 'using', 'template', 'typename',
  'operator', 'try', 'catch', 'throw', 'const_cast', 'static_cast',
  'dynamic_cast', 'reinterpret_cast', 'explicit', 'mutable', 'nullptr',
  'true', 'false', 'bool', 'override', 'final', 'constexpr', 'auto',
  'decltype', 'noexcept', 'std',
];

export const cpp = {
  id: 'cpp',
  initialState: null,
  stateHandlers: {
    'block-comment': { type: 'comment', closeRegex: /\*\// },
  },
  rules: [
    { type: 'comment', regex: /^\/\/.*/ },
    { type: 'comment', regex: /^\/\*/, opensState: 'block-comment' },
    { type: 'attribute', regex: /^#\s*[a-zA-Z]+/ },
    { type: 'string', regex: /^<[A-Za-z0-9_./]+>/ },
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: /^'(?:\\.|[^'\\])'/ },
    { type: 'number', regex: COMMON.number },
    keywordRule(KEYWORDS, 'keyword'),
    functionCallRule(),
    { type: 'type', regex: /^\b[A-Z][A-Za-z0-9_]*\b/ },
    identifierRule('variable'),
    { type: 'operator', regex: /^(::|->|\+\+|--|&&|\|\||[-+*/%<>!=&|^~]=?)/ },
    { type: 'punctuation', regex: COMMON.punctuation },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default cpp;
