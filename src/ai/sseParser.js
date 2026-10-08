/**
 * sseParser.js
 * ------------
 * A minimal, dependency-free incremental parser for the
 * `text/event-stream` (SSE) wire format used by both Anthropic's and
 * OpenAI-compatible streaming Messages/Chat Completions APIs.
 *
 * React Native's fetch() delivers a streamed HTTP body as a sequence of
 * arbitrarily-sized chunks — a single SSE "event" (terminated by a blank
 * line) is NOT guaranteed to land in one chunk. It can be split anywhere,
 * including mid-field-name, mid-data-line, or mid-blank-line-terminator.
 * This parser is therefore built as a small state machine over a
 * persistent string buffer rather than a one-shot string.split('\n\n'),
 * which would silently drop or corrupt events that straddle chunk
 * boundaries.
 *
 * Usage:
 *   const parser = createSSEParser();
 *   for await (const chunk of stream) {
 *     const events = parser.push(chunk); // string chunk -> SSEEvent[]
 *     for (const evt of events) { ... }
 *   }
 *   const trailing = parser.flush(); // call once the stream ends
 *
 * An SSEEvent is { event: string|null, data: string, id: string|null }.
 * Per the SSE spec, multiple `data:` lines within one event are joined
 * with '\n'; a bare `data` line (no colon) contributes an empty string.
 * Lines beginning with ':' are comments and are ignored. The `event:`
 * field defaults to null (equivalent to the spec's implicit "message").
 */

/**
 * @typedef {Object} SSEEvent
 * @property {string|null} event
 * @property {string} data
 * @property {string|null} id
 */

function parseFieldLine(line) {
  // Per spec: "field: value" (single optional leading space after colon
  // is stripped) or "field:value" or a bare "field" (empty value). Lines
  // starting with ':' are comments and handled by the caller before this
  // is reached.
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    return { field: line, value: '' };
  }
  const field = line.slice(0, colonIndex);
  let value = line.slice(colonIndex + 1);
  if (value.startsWith(' ')) value = value.slice(1);
  return { field, value };
}

/**
 * Parses one complete raw event block (the text between two blank-line
 * separators, with the trailing separator already removed) into an
 * SSEEvent. Returns null for an event block that produced no data at all
 * (e.g. a block consisting only of comment lines or blank content),
 * matching the SSE spec's rule that an event with an empty data buffer
 * dispatches only if at least one `data:` line was seen — callers of
 * this parser (the provider adapters) treat `data: ''` as a valid but
 * empty payload, not "no event".
 */
function parseEventBlock(block) {
  const lines = block.split('\n');
  let eventType = null;
  let id = null;
  const dataLines = [];
  let sawDataField = false;

  for (const rawLine of lines) {
    if (rawLine === '') continue; // blank lines inside a block shouldn't occur post-split, but be safe
    if (rawLine.startsWith(':')) continue; // comment

    const { field, value } = parseFieldLine(rawLine);
    if (field === 'event') {
      eventType = value;
    } else if (field === 'data') {
      dataLines.push(value);
      sawDataField = true;
    } else if (field === 'id') {
      id = value;
    }
    // 'retry' and unknown fields are intentionally ignored — not needed
    // for the request/response chat use case this parser serves.
  }

  if (!sawDataField && eventType === null && id === null) return null;

  return {
    event: eventType,
    data: dataLines.join('\n'),
    id,
  };
}

/**
 * Splits a buffer into complete event blocks plus a trailing remainder
 * that has not yet seen its terminating blank line. Handles all three
 * line-ending styles (\n, \r\n, \r) since some proxies/backends
 * normalize differently, and — importantly — handles the terminator
 * itself being split across chunks (e.g. buffer ends in '\r' and the
 * next chunk starts with '\n').
 */
function splitBuffer(buffer) {
  // Normalize CRLF and lone CR to LF first. This is safe to do
  // incrementally EXCEPT for the one edge case of a lone trailing '\r'
  // that might be the first half of a split '\r\n' terminator — the
  // caller (push) holds back a trailing lone '\r' from normalization to
  // avoid corrupting that case.
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const blocks = [];
  let searchFrom = 0;
  while (true) {
    const sepIndex = normalized.indexOf('\n\n', searchFrom);
    if (sepIndex === -1) break;
    blocks.push(normalized.slice(searchFrom, sepIndex));
    searchFrom = sepIndex + 2;
  }
  const remainder = normalized.slice(searchFrom);
  return { blocks, remainder };
}

export function createSSEParser() {
  let buffer = '';

  function push(chunk) {
    if (!chunk) return [];

    // Hold back a lone trailing '\r' so a '\r\n' terminator split across
    // two chunks (chunk A ends "...\r", chunk B starts "\n...") is not
    // misinterpreted as two separate line endings by splitBuffer's
    // per-chunk normalization.
    buffer += chunk;
    let toProcess = buffer;
    let heldCR = '';
    if (toProcess.endsWith('\r')) {
      heldCR = '\r';
      toProcess = toProcess.slice(0, -1);
    }

    const { blocks, remainder } = splitBuffer(toProcess);
    buffer = remainder + heldCR;

    const events = [];
    for (const block of blocks) {
      const evt = parseEventBlock(block);
      if (evt) events.push(evt);
    }
    return events;
  }

  /**
   * Call once the underlying stream has ended. Some servers omit the
   * final blank-line terminator on the last event, so any remaining
   * buffered content is parsed as one last block.
   */
  function flush() {
    const remaining = buffer;
    buffer = '';
    if (!remaining || !remaining.trim()) return [];
    const evt = parseEventBlock(remaining.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    return evt ? [evt] : [];
  }

  function reset() {
    buffer = '';
  }

  return { push, flush, reset };
}

export default { createSSEParser };
