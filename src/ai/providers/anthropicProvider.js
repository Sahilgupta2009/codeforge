/**
 * anthropicProvider.js
 * --------------------
 * Provider adapter for the Anthropic Messages API
 * (https://api.anthropic.com/v1/messages), used both for streaming chat
 * and one-off code-action requests.
 *
 * Anthropic-specific wire shape this adapter hides from the rest of the
 * app:
 *   - `system` is a TOP-LEVEL request field, not a message with
 *     role "system".
 *   - Streaming events are `message_start`, `content_block_start`,
 *     `content_block_delta` (the one that carries incremental text via
 *     `delta.text` for a `text_delta`), `content_block_stop`,
 *     `message_delta` (carries stop_reason + usage), `message_stop`,
 *     and `error`/`ping`.
 *   - Required headers: `x-api-key` and `anthropic-version`.
 *
 * This module exports pure functions for building the request and
 * parsing/accumulating stream events, so both pieces are independently
 * unit-testable without a network connection.
 */

export const ANTHROPIC_API_VERSION = '2023-06-01';
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Builds the fetch() request descriptor (url, headers, body) for an
 * Anthropic Messages API call.
 *
 * @param {Object} args
 * @param {string} args.apiKey
 * @param {string} [args.baseUrl] - overrides the default endpoint (e.g. a proxy)
 * @param {string} args.model
 * @param {string} [args.system]
 * @param {Array<{role: 'user'|'assistant', content: string}>} args.messages
 * @param {number} [args.maxTokens]
 * @param {boolean} [args.stream]
 */
export function buildAnthropicRequest({
  apiKey,
  baseUrl,
  model,
  system,
  messages,
  maxTokens = 4096,
  stream = true,
}) {
  if (!apiKey) throw new Error('Anthropic provider: apiKey is required');
  if (!model) throw new Error('Anthropic provider: model is required');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Anthropic provider: messages must be a non-empty array');
  }

  const url = baseUrl && baseUrl.trim() ? baseUrl.trim() : DEFAULT_ANTHROPIC_BASE_URL;

  const body = {
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
  };
  if (system) body.system = system;

  return {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
      // Required by Anthropic when calling the API directly from a
      // browser-like fetch context (React Native's fetch identifies
      // similarly enough to warrant this for compatibility).
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Given one already-parsed SSE event ({ event, data }) from
 * src/ai/sseParser.js, returns an incremental update describing what
 * happened, or null if the event carries no actionable content for the
 * chat UI. This keeps aiService.js's accumulation loop identical
 * regardless of which provider produced the event.
 *
 * Return shape: { type: 'text'|'error'|'done', textDelta?, message?,
 * stopReason?, usage? }
 */
export function parseAnthropicStreamEvent(sseEvent) {
  if (!sseEvent || !sseEvent.data) return null;
  if (sseEvent.data === '[DONE]') return { type: 'done' };

  let payload;
  try {
    payload = JSON.parse(sseEvent.data);
  } catch {
    return null; // malformed / partial JSON should never reach here if sseParser buffered correctly, but be defensive
  }

  const type = sseEvent.event || payload.type;

  switch (type) {
    case 'content_block_delta': {
      if (payload.delta && payload.delta.type === 'text_delta') {
        return { type: 'text', textDelta: payload.delta.text };
      }
      return null;
    }
    case 'message_delta': {
      const stopReason = payload.delta?.stop_reason || null;
      const usage = payload.usage || null;
      return { type: 'meta', stopReason, usage };
    }
    case 'message_stop':
      return { type: 'done' };
    case 'error': {
      const message = payload.error?.message || 'Anthropic API returned an error';
      return { type: 'error', message };
    }
    case 'ping':
    case 'message_start':
    case 'content_block_start':
    case 'content_block_stop':
      return null;
    default:
      return null;
  }
}

/**
 * Parses a NON-streaming Anthropic Messages API JSON response body into
 * a plain { text } result. Used by one-off code actions that don't need
 * streaming (though runOneOffAction currently reuses the streaming path
 * for a consistent UX — this is kept for completeness / potential
 * non-streaming fallback and is covered by the provider test suite).
 */
export function parseAnthropicResponse(json) {
  if (!json || !Array.isArray(json.content)) {
    throw new Error('Anthropic provider: unexpected response shape');
  }
  const text = json.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return { text, stopReason: json.stop_reason || null, usage: json.usage || null };
}

export default {
  ANTHROPIC_API_VERSION,
  DEFAULT_ANTHROPIC_BASE_URL,
  buildAnthropicRequest,
  parseAnthropicStreamEvent,
  parseAnthropicResponse,
};
