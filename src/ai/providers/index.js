/**
 * providers/index.js
 * -------------------
 * Unifies the Anthropic and OpenAI-compatible provider adapters behind
 * one small interface so aiService.js never has to branch on provider
 * identity itself — it just calls `getProvider(providerId).buildRequest(...)`
 * / `.parseStreamEvent(...)`.
 *
 * NOTE on import depth: this file lives at src/ai/providers/index.js, so
 * the SSE parser (src/ai/sseParser.js) is one directory ABOVE this file
 * and must be imported as '../sseParser' — NOT './sseParser'. The
 * individual provider adapter files (anthropicProvider.js,
 * openaiProvider.js) are siblings of this file, so they're imported as
 * './anthropicProvider' / './openaiProvider'.
 */

import {
  DEFAULT_ANTHROPIC_BASE_URL,
  buildAnthropicRequest,
  parseAnthropicStreamEvent,
  parseAnthropicResponse,
} from './anthropicProvider';
import {
  DEFAULT_OPENAI_BASE_URL,
  buildOpenAIRequest,
  parseOpenAIStreamEvent,
  parseOpenAIResponse,
} from './openaiProvider';

/**
 * @typedef {Object} ProviderAdapter
 * @property {string} id
 * @property {string} label
 * @property {string} defaultBaseUrl
 * @property {string} defaultModel
 * @property {boolean} apiKeyRequired
 * @property {(args: object) => {url:string, method:string, headers:object, body:string}} buildRequest
 * @property {(sseEvent: {event:string|null,data:string}) => object|null} parseStreamEvent
 * @property {(json: object) => {text:string, stopReason:string|null, usage:object|null}} parseResponse
 */

/** @type {Object<string, ProviderAdapter>} */
const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: DEFAULT_ANTHROPIC_BASE_URL,
    defaultModel: 'claude-sonnet-4-6',
    apiKeyRequired: true,
    buildRequest: buildAnthropicRequest,
    parseStreamEvent: parseAnthropicStreamEvent,
    parseResponse: parseAnthropicResponse,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
    defaultModel: 'gpt-4o',
    apiKeyRequired: true,
    buildRequest: buildOpenAIRequest,
    parseStreamEvent: parseOpenAIStreamEvent,
    parseResponse: parseOpenAIResponse,
  },
  // 'custom' covers Groq / Together / Ollama / LM Studio / any other
  // OpenAI-compatible endpoint — same wire format as 'openai', just with
  // a user-supplied base URL and (often) no required key.
  custom: {
    id: 'custom',
    label: 'OpenAI-compatible (custom)',
    defaultBaseUrl: '',
    defaultModel: '',
    apiKeyRequired: false,
    buildRequest: buildOpenAIRequest,
    parseStreamEvent: parseOpenAIStreamEvent,
    parseResponse: parseOpenAIResponse,
  },
};

/** Returns the adapter for a provider id, or null if unknown. */
export function getProvider(providerId) {
  return PROVIDERS[providerId] || null;
}

/**
 * Returns the list of providers for populating a picker UI, in a stable
 * display order (Anthropic first as the default/first-class provider).
 */
export function getProviderList() {
  return [PROVIDERS.anthropic, PROVIDERS.openai, PROVIDERS.custom];
}

export default { getProvider, getProviderList };
