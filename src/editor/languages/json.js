import { COMMON } from './shared';

export const json = {
  id: 'json',
  initialState: null,
  stateHandlers: {},
  rules: [
    { type: 'attribute', regex: /^"(?:\\.|[^"\\])*"(?=\s*:)/ }, // key
    { type: 'string', regex: COMMON.doubleQuoteString }, // value
    { type: 'number', regex: /^-?\d+(\.\d+)?([eE][+-]?\d+)?/ },
    { type: 'keyword', regex: /^\b(true|false|null)\b/ },
    { type: 'punctuation', regex: /^[{}[\],:]/ },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default json;
