/**
 * openaiProvider.js
 * -----------------
 * Provider adapter for OpenAI-compatible Chat Completions endpoints —
 * covers OpenAI itself, Groq, Together, Ollama, LM Studio, and any other
 * backend that implements the same `/v1/chat/completions` wire shape.
 *
 * OpenAI-compatible wire shape this adapter hides from the rest of the
 * app:
 *   - `system` is represented as a MESSAGE with role "system" prepended
 *     to the messages array — NOT a top-level field like Anthropic.
 *   - Streaming events are SSE `data:` lines each containing a JSON
 *     chunk with `choices[0].delta.content` carrying incremental text,
 *     and a final literal `data: [DONE]` line (not a JSON payload) that
 *     terminates the stream.
 *   - Auth is a standard `Authorization: Bearer <key>` header. Local
 *     servers (Ollama, LM Studio) generally ignore this header if no key
 *     is configured, so an empty/missing key is tolerated here rather
 *     than rejected — those backends often need no key at all.
 */

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Builds the fetch() request descriptor for an OpenAI-compatible Chat
 * Completions call.
 *
 * @param {Object} args
 * @param {string} [args.apiKey] - optional; local servers may not require one
 * @param {string} [args.baseUrl] - full completions URL, or a base the caller has already resolved
 * @param {string} args.model
 * @param {string} [args.system]
 * @param {Array<{role: 'user'|'assistant', content: string}>} args.messages
 * @param {number} [args.maxTokens]
 * @param {boolean} [args.stream]
 */
export function buildOpenAIRequest({
  apiKey,
  baseUrl,
  model,
  system,
  messages,
  maxTokens = 4096,
  stream = true,
}) {
  if (!model) throw new Error('OpenAI-compatible provider: model is required');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('OpenAI-compatible provider: messages must be a non-empty array');
  }

  const url = baseUrl && baseUrl.trim() ? baseUrl.trim() : DEFAULT_OPENAI_BASE_URL;

  const chatMessages = [];
  if (system) chatMessages.push({ role: 'system', content: system });
  for (const m of messages) {
    chatMessages.push({ role: m.role, content: m.content });
  }

  const body = {
    model,
    messages: chatMessages,
    max_tokens: maxTokens,
    stream,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  return { url, method: 'POST', headers, body: JSON.stringify(body) };
}

/**
 * Given one already-parsed SSE event ({ event, data }) from
 * src/ai/sseParser.js, returns the same normalized incremental-update
 * shape as parseAnthropicStreamEvent, so aiService.js's accumulation
 * loop is provider-agnostic.
 */
export function parseOpenAIStreamEvent(sseEvent) {
  if (!sseEvent || sseEvent.data == null) return null;

  const data = sseEvent.data.trim();
  if (data === '[DONE]') return { type: 'done' };
  if (!data) return null;

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return null; // defensive: should not happen if sseParser buffered correctly
  }

  if (payload.error) {
    const message = payload.error.message || 'OpenAI-compatible API returned an error';
    return { type: 'error', message };
  }

  const choice = payload.choices && payload.choices[0];
  if (!choice) return null;

  const deltaText = choice.delta && typeof choice.delta.content === 'string' ? choice.delta.content : null;
  if (deltaText) {
    return { type: 'text', textDelta: deltaText };
  }

  if (choice.finish_reason) {
    return { type: 'meta', stopReason: choice.finish_reason, usage: payload.usage || null };
  }

  return null;
}

/**
 * Parses a NON-streaming OpenAI-compatible Chat Completions JSON
 * response body into a plain { text } result.
 */
export function parseOpenAIResponse(json) {
  const choice = json && json.choices && json.choices[0];
  if (!choice || !choice.message || typeof choice.message.content !== 'string') {
    throw new Error('OpenAI-compatible provider: unexpected response shape');
  }
  return {
    text: choice.message.content,
    stopReason: choice.finish_reason || null,
    usage: json.usage || null,
  };
}

export default {
  DEFAULT_OPENAI_BASE_URL,
  buildOpenAIRequest,
  parseOpenAIStreamEvent,
  parseOpenAIResponse,
};
