import { COMMON, keywordRule, identifierRule, functionCallRule } from './shared';

const KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
  'var', 'record', 'sealed', 'permits', 'yield',
];

export const java = {
  id: 'java',
  initialState: null,
  stateHandlers: {
    'block-comment': { type: 'comment', closeRegex: /\*\// },
  },
  rules: [
    { type: 'comment', regex: /^\/\/.*/ },
    { type: 'comment', regex: /^\/\*/, opensState: 'block-comment' },
    { type: 'attribute', regex: /^@[A-Za-z_][A-Za-z0-9_]*/ }, // annotations
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: /^'(?:\\.|[^'\\])'/ },
    { type: 'number', regex: COMMON.number },
    keywordRule(KEYWORDS, 'keyword'),
    functionCallRule(),
    { type: 'type', regex: /^\b[A-Z][A-Za-z0-9_]*\b/ },
    identifierRule('variable'),
    { type: 'operator', regex: /^(->|::|\+\+|--|&&|\|\||[-+*/%<>!=&|^~]=?)/ },
    { type: 'punctuation', regex: COMMON.punctuation },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default java;
