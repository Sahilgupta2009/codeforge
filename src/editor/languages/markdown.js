export const markdown = {
  id: 'markdown',
  initialState: null,
  stateHandlers: {
    'code-fence': { type: 'string', closeRegex: /```/ },
  },
  rules: [
    { type: 'comment', regex: /^```/, opensState: 'code-fence' },
    { type: 'keyword', regex: /^#{1,6}\s.*/ }, // heading line
    { type: 'string', regex: /^`[^`]+`/ }, // inline code
    { type: 'function', regex: /^\*\*[^*]+\*\*/ }, // bold
    { type: 'type', regex: /^\*[^*]+\*/ }, // italic
    { type: 'attribute', regex: /^!?\[[^\]]*\]\([^)]*\)/ }, // link / image
    { type: 'operator', regex: /^>\s?/ }, // blockquote marker
    { type: 'punctuation', regex: /^[-*+]\s/ }, // list marker
    { type: 'number', regex: /^\d+\.\s/ }, // ordered list marker
    { type: 'plain', regex: /^[^`*[\]#>\n]+/ },
    { type: 'whitespace', regex: /^[ \t]+/ },
  ],
};

export default markdown;
