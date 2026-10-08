import { COMMON, keywordRule, identifierRule, functionCallRule } from './shared';

const KEYWORDS = [
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch',
  'class', 'const', 'continue', 'covariant', 'default', 'deferred', 'do',
  'dynamic', 'else', 'enum', 'export', 'extends', 'extension', 'external',
  'factory', 'false', 'final', 'finally', 'for', 'Function', 'get', 'hide',
  'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library',
  'mixin', 'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow',
  'return', 'set', 'show', 'static', 'super', 'switch', 'sync', 'this',
  'throw', 'true', 'try', 'typedef', 'var', 'void', 'while', 'with', 'yield',
  'int', 'double', 'String', 'bool', 'List', 'Map', 'Set', 'num', 'Object',
  'Widget', 'StatelessWidget', 'StatefulWidget', 'BuildContext',
];

export const dart = {
  id: 'dart',
  initialState: null,
  stateHandlers: {
    'block-comment': { type: 'comment', closeRegex: /\*\// },
    'triple-string': { type: 'string', closeRegex: /'''/ },
  },
  rules: [
    { type: 'comment', regex: /^\/\/.*/ },
    { type: 'comment', regex: /^\/\*/, opensState: 'block-comment' },
    { type: 'attribute', regex: /^@[A-Za-z_][A-Za-z0-9_]*/ }, // annotations like @override
    { type: 'string', regex: /^'''/, opensState: 'triple-string' },
    { type: 'string', regex: /^r?"(?:\\.|[^"\\])*"?/ },
    { type: 'string', regex: /^r?'(?:\\.|[^'\\])*'?/ },
    { type: 'number', regex: COMMON.number },
    keywordRule(KEYWORDS, 'keyword'),
    functionCallRule(),
    { type: 'type', regex: /^\b[A-Z][A-Za-z0-9_]*\b/ },
    identifierRule('variable'),
    { type: 'operator', regex: /^(\?\?=?|\?\.|=>|\.\.\.?|==|!=|<=|>=|&&|\|\||[-+*/%<>!]=?)/ },
    { type: 'punctuation', regex: COMMON.punctuation },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default dart;
