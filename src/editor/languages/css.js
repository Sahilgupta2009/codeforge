import { COMMON } from './shared';

export const css = {
  id: 'css',
  initialState: null,
  stateHandlers: {
    comment: { type: 'comment', closeRegex: /\*\// },
  },
  rules: [
    { type: 'comment', regex: /^\/\*/, opensState: 'comment' },
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: COMMON.singleQuoteString },
    { type: 'tag', regex: /^\.[A-Za-z_-][A-Za-z0-9_-]*/ }, // class selector
    { type: 'tag', regex: /^#[A-Za-z_-][A-Za-z0-9_-]*/ }, // id selector
    { type: 'attribute', regex: /^[A-Za-z-]+(?=\s*:)/ }, // property name
    { type: 'number', regex: /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg|fr)?/ },
    { type: 'constant', regex: /^#[0-9a-fA-F]{3,8}\b/ }, // hex color
    { type: 'function', regex: /^[A-Za-z-]+(?=\()/ },
    { type: 'punctuation', regex: /^[{}();,:]/ },
    { type: 'operator', regex: /^[>+~]/ },
    { type: 'plain', regex: /^[A-Za-z-]+/ },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default css;
