import { COMMON, keywordRule, identifierRule, functionCallRule } from './shared';

const KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'match', 'case',
];

const BUILTINS = [
  'print', 'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict',
  'set', 'tuple', 'type', 'isinstance', 'super', 'self', 'enumerate', 'zip',
  'map', 'filter', 'open', 'input', 'sorted', 'reversed', 'sum', 'min', 'max',
];

export const python = {
  id: 'python',
  initialState: null,
  stateHandlers: {
    'triple-double': { type: 'string', closeRegex: /"""/ },
    'triple-single': { type: 'string', closeRegex: /'''/ },
  },
  rules: [
    { type: 'comment', regex: COMMON.lineComment('#') },
    { type: 'string', regex: /^"""/, opensState: 'triple-double' },
    { type: 'string', regex: /^'''/, opensState: 'triple-single' },
    { type: 'string', regex: /^[rRbBfFuU]{1,2}"(?:\\.|[^"\\])*"?/ },
    { type: 'string', regex: /^[rRbBfFuU]{1,2}'(?:\\.|[^'\\])*'?/ },
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: COMMON.singleQuoteString },
    { type: 'number', regex: COMMON.number },
    { type: 'attribute', regex: /^@[A-Za-z_][A-Za-z0-9_.]*/ }, // decorators
    keywordRule(KEYWORDS, 'keyword'),
    keywordRule(BUILTINS, 'function'),
    functionCallRule(),
    { type: 'type', regex: /^\b[A-Z][A-Za-z0-9_]*\b/ }, // heuristic: capitalized = class/type
    identifierRule('variable'),
    { type: 'operator', regex: /^(\*\*|\/\/|[-+*/%<>!]=?|==|!=|<=|>=|:=)/ },
    { type: 'punctuation', regex: COMMON.punctuation },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default python;
