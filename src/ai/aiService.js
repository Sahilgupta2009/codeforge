import { getProvider } from './providers';
import { createSSEParser } from './sseParser';
import { buildChatPrompt, buildCodeActionPrompt } from './promptTemplates';

/**
 * aiService.js
 * ------------
 * The only module that actually calls fetch() against an AI provider.
 * useAIStore.js drives this; this module has no knowledge of Zustand or
 * React and could be swapped for a different state layer without
 * changes here.
 *
 * IMPLEMENTATION NOTE (verification limitation — see README): this is
 * implemented against the documented/stable Anthropic Messages API and
 * OpenAI-compatible Chat Completions API request/response shapes, using
 * standard fetch() + ReadableStream body reading. It has NOT been
 * executed against a real Anthropic/OpenAI endpoint or inside a real
 * React Native runtime in this sandbox — only the pure request-building,
 * event-parsing, and prompt-construction logic (sseParser.js,
 * providers/*, promptTemplates.js) has been unit-tested with Node. RN's
 * fetch() streaming body support has matured across RN/Hermes versions;
 * if the ReadableStream branch below is unavailable on a given device,
 * this falls back to a single non-streaming read of the whole response
 * body (see `readStreamOrFallback`), so the feature still works — just
 * without incremental token-by-token rendering — rather than failing
 * outright.
 */

/**
 * Reads a fetch Response body incrementally via getReader(), decoding
 * bytes to text and pushing them through an SSE parser, invoking
 * onEvent(sseEvent) for each complete event as it's assembled. Falls
 * back to a single .text() read (parsed as one shot) if the runtime
 * doesn't expose a readable stream reader on the response body — this
 * keeps the feature functional (non-incrementally) on RN configurations
 * where streaming bodies aren't available.
 */
async function readStreamOrFallback(response, onEvent) {
  const parser = createSSEParser();

  const body = response.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      const events = parser.push(chunkText);
      for (const evt of events) onEvent(evt);
    }
    const trailing = parser.flush();
    for (const evt of trailing) onEvent(evt);
    return;
  }

  // Fallback: no streaming reader available — read the whole body as
  // text and parse it as a (possibly single) SSE payload.
  const fullText = await response.text();
  const events = parser.push(fullText);
  for (const evt of events) onEvent(evt);
  const trailing = parser.flush();
  for (const evt of trailing) onEvent(evt);
}

/**
 * Resolves which provider adapter + credentials to use from the
 * settings snapshot. `aiProvider` of 'anthropic' or 'openai' map
 * directly; anything else (or an explicit 'custom') is treated as a
 * custom OpenAI-compatible endpoint, since that's the only other wire
 * format this app speaks.
 */
function resolveProvider(settings) {
  const providerId = settings.aiProvider === 'anthropic' || settings.aiProvider === 'openai'
    ? settings.aiProvider
    : 'custom';
  const adapter = getProvider(providerId);
  if (!adapter) {
    throw new Error(`Unknown AI provider: ${settings.aiProvider}`);
  }
  if (adapter.apiKeyRequired && !settings.aiApiKey) {
    throw new Error(
      `${adapter.label} requires an API key. Add one in Settings \u2192 AI Assistant.`
    );
  }
  const model = settings.aiModel && settings.aiModel.trim() ? settings.aiModel.trim() : adapter.defaultModel;
  if (!model) {
    throw new Error('No model configured. Set a model in Settings \u2192 AI Assistant.');
  }
  return { adapter, model };
}

/**
 * Streams a chat completion. Calls `callbacks.onTextDelta(delta)` for
 * each incremental piece of text, `callbacks.onDone({stopReason,usage})`
 * once complete, and `callbacks.onError(error)` if anything fails.
 * Returns an abort() function the caller can use to cancel mid-stream.
 *
 * @param {Object} args
 * @param {object} args.settings - snapshot of useSettingsStore's AI fields (aiProvider, aiApiKey, aiApiBaseUrl, aiModel)
 * @param {Array<{role:'user'|'assistant', content:string}>} args.history
 * @param {{fileName?:string, language?:string}} [args.activeFileContext]
 */
export function streamChat({ settings, history, activeFileContext }, callbacks) {
  const controller = new AbortController();
  let settled = false;

  (async () => {
    try {
      const { adapter, model } = resolveProvider(settings);
      const { system, messages } = buildChatPrompt({ history, activeFileContext });

      const req = adapter.buildRequest({
        apiKey: settings.aiApiKey,
        baseUrl: settings.aiApiBaseUrl,
        model,
        system,
        messages,
        stream: true,
      });

      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`${adapter.label} request failed (${response.status}): ${errText.slice(0, 300)}`);
      }

      let sawDone = false;
      await readStreamOrFallback(response, (sseEvent) => {
        if (settled) return;
        const update = adapter.parseStreamEvent(sseEvent);
        if (!update) return;
        if (update.type === 'text') {
          callbacks.onTextDelta?.(update.textDelta);
        } else if (update.type === 'error') {
          settled = true;
          callbacks.onError?.(new Error(update.message));
        } else if (update.type === 'done') {
          sawDone = true;
        }
      });

      if (!settled) {
        settled = true;
        callbacks.onDone?.({});
      }
      void sawDone; // reserved for future stop-reason surfacing in the UI
    } catch (err) {
      if (settled) return;
      settled = true;
      if (err?.name === 'AbortError') {
        callbacks.onAborted?.();
      } else {
        callbacks.onError?.(err);
      }
    }
  })();

  return () => {
    controller.abort();
  };
}

/**
 * Runs a single non-conversational code action (Explain / Generate /
 * Fix / Refactor / Comment / Continue) and streams its response the
 * same way streamChat does, for a consistent incremental-rendering UX
 * in AICodeActionsSheet. `params` is passed straight through to
 * promptTemplates.buildCodeActionPrompt(actionId, params).
 */
export function runOneOffAction({ settings, actionId, params }, callbacks) {
  const controller = new AbortController();
  let settled = false;

  (async () => {
    try {
      const { adapter, model } = resolveProvider(settings);
      const { system, user } = buildCodeActionPrompt(actionId, params);

      const req = adapter.buildRequest({
        apiKey: settings.aiApiKey,
        baseUrl: settings.aiApiBaseUrl,
        model,
        system,
        messages: [{ role: 'user', content: user }],
        stream: true,
      });

      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`${adapter.label} request failed (${response.status}): ${errText.slice(0, 300)}`);
      }

      await readStreamOrFallback(response, (sseEvent) => {
        if (settled) return;
        const update = adapter.parseStreamEvent(sseEvent);
        if (!update) return;
        if (update.type === 'text') {
          callbacks.onTextDelta?.(update.textDelta);
        } else if (update.type === 'error') {
          settled = true;
          callbacks.onError?.(new Error(update.message));
        }
      });

      if (!settled) {
        settled = true;
        callbacks.onDone?.({});
      }
    } catch (err) {
      if (settled) return;
      settled = true;
      if (err?.name === 'AbortError') {
        callbacks.onAborted?.();
      } else {
        callbacks.onError?.(err);
      }
    }
  })();

  return () => {
    controller.abort();
  };
}

export default { streamChat, runOneOffAction };
