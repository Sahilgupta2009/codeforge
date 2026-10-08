import { COMMON } from './shared';

export const html = {
  id: 'html',
  initialState: null,
  stateHandlers: {
    comment: { type: 'comment', closeRegex: /-->/ },
  },
  rules: [
    { type: 'comment', regex: /^<!--/, opensState: 'comment' },
    { type: 'punctuation', regex: /^<\/?/ },
    { type: 'tag', regex: /^[A-Za-z][A-Za-z0-9-]*/ },
    { type: 'attribute', regex: /^[A-Za-z-][A-Za-z0-9-]*(?=\s*=)/ },
    { type: 'string', regex: COMMON.doubleQuoteString },
    { type: 'string', regex: COMMON.singleQuoteString },
    { type: 'operator', regex: /^=/ },
    { type: 'punctuation', regex: /^\/?>/ },
    { type: 'plain', regex: /^[^<>]+/ },
    { type: 'whitespace', regex: COMMON.whitespace },
  ],
};

export default html;
