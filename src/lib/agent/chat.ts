// The agentic chat loops: provider-aware multi-round turns that execute tool
// calls, feed results back to the model, and stream the spoken reaction.

import { Channel, invoke } from '@tauri-apps/api/core';
import { store } from '../store.svelte';
import { asRecord, contentToText, friendlyClaudeError, invokeRetry, type ChatMessage } from './llm';
import {
  AGENT_TOOLS,
  ANTHROPIC_TOOLS,
  TOOL_PROMPT,
  executeActions,
  executeTool,
  parseToolArgs,
  removeUnverifiedActionClaims,
} from './tools';

/**
 * Run an agent turn with native Ollama tool-calling: execute any tool calls,
 * loop so the model can react to results, and return the final reply + what ran.
 *
 * Tool-eligible calls are NEVER streamed — Ollama drops tool_calls in streaming
 * mode. When onToken is given, only the spoken reaction *after* tools have run
 * is streamed (a no-tools call), so live typing never costs us an action.
 * Falls back to the text protocol (<actions> / json) for models without tools.
 */
async function chatOllama(opts: {
  url: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxRounds?: number;
  onToken?: (token: string) => void;
}): Promise<{ content: string; results: string[] }> {
  const maxRounds = opts.maxRounds ?? 4;
  const results: string[] = [];
  // Ollama is text-only — flatten any image blocks down to text so it never chokes.
  const convo: ChatMessage[] = [
    { role: 'system', content: opts.system },
    ...opts.messages.map((m) => ({ ...m, content: contentToText(m.content) })),
  ];
  let useTools = true;
  let justRanTools = false;

  for (let round = 0; round < maxRounds; round++) {
    const streamThis = !!opts.onToken && justRanTools;
    const body: Record<string, unknown> = { model: opts.model, messages: convo, stream: streamThis };
    if (useTools && !streamThis) body.tools = AGENT_TOOLS;

    let data: Record<string, unknown>;
    try {
      if (streamThis && opts.onToken) {
        const onToken = opts.onToken;
        try {
          const channel = new Channel<string>();
          channel.onmessage = (token) => onToken(token);
          const message = await invoke<Record<string, unknown>>('ollama_stream', { url: opts.url, body, onChunk: channel });
          data = { message };
        } catch {
          // streaming transport failed — get the reply the reliable way
          data = await invoke<Record<string, unknown>>('ollama_chat', { url: opts.url, body: { ...body, stream: false } });
        }
      } else {
        data = await invoke<Record<string, unknown>>('ollama_chat', { url: opts.url, body });
      }
    } catch (e) {
      // model can't do native tools — drop to the text protocol and retry
      if (useTools && /does not support tools|not support tools|tools.*unsupported/i.test(String(e))) {
        useTools = false;
        convo[0] = { role: 'system', content: opts.system + '\n' + TOOL_PROMPT };
        continue;
      }
      throw e;
    }

    const message = asRecord(data.message);
    const content = String(message.content ?? '');
    const toolCalls = streamThis ? [] : Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (toolCalls.length === 0) {
      // final reply — either the streamed reaction or a non-tool response
      const fromText = executeActions(content);
      results.push(...fromText.results);
      const visible = fromText.visible || content;
      return { content: results.length ? visible : removeUnverifiedActionClaims(visible), results };
    }

    convo.push({ role: 'assistant', content, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const fn = asRecord(asRecord(call).function);
      const name = String(fn.name ?? '');
      if (!name) continue;
      const result = executeTool(name, parseToolArgs(fn.arguments));
      results.push(result);
      convo.push({ role: 'tool', content: result, tool_name: name });
    }
    justRanTools = true;
  }

  return { content: '', results };
}

/**
 * Claude (Anthropic Messages API). Same agentic loop, mapped to Anthropic's
 * shape: system is separate, tools use input_schema, tool results come back as
 * content blocks. Tool rounds run non-streamed; the spoken reaction streams.
 */
async function chatClaude(opts: {
  url: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxRounds?: number;
  onToken?: (token: string) => void;
}): Promise<{ content: string; results: string[] }> {
  const s = store.data.settings;
  const apiKey = s.anthropicApiKey?.trim();
  const model = s.anthropicModel?.trim() || 'claude-opus-4-8';
  if (!apiKey) {
    return {
      content: '⚠ No Claude API key set — open [CFG], paste your Anthropic key, or set BACKEND to OFF.',
      results: [],
    };
  }

  const maxRounds = opts.maxRounds ?? 4;
  const results: string[] = [];
  const messages: { role: string; content: unknown }[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  let justRanTools = false;

  // Prompt caching (top-level automatic mode): the API drops a cache breakpoint on
  // the last cacheable block of each request. Within one turn's agentic loop the
  // prefix (tools + system + history) is byte-identical and only grows, so round 1
  // writes the cache (1.25x) and every tool round / the final streamed reply reads
  // it back at ~0.1x input price. Cross-turn reuse is intentionally not chased:
  // buildAgentSystem() bakes in live app state + the clock, so the prefix shifts
  // between turns anyway. One-shot calls (rawComplete/visionComplete) stay uncached
  // — with no second request there is nothing to read, only a write premium.
  const cacheControl = { type: 'ephemeral' };

  // Deliberation: adaptive thinking lets Opus reason as long as a turn needs —
  // before answering AND between tool calls — without extra API round-trips.
  // Thinking spends from max_tokens, so the cap gets real headroom. Safety of
  // the surrounding plumbing: the Rust stream parser forwards only delta.text
  // (thinking deltas carry delta.thinking and are skipped), and the tool loop
  // pushes response blocks back verbatim, which satisfies the replay rule for
  // thinking blocks on multi-round turns.
  const thinking = { type: 'adaptive' };

  for (let round = 0; round < maxRounds; round++) {
    if (opts.onToken && justRanTools) {
      const onToken = opts.onToken;
      try {
        const channel = new Channel<string>();
        channel.onmessage = (token) => onToken(token);
        const final = await invoke<Record<string, unknown>>('claude_stream', {
          apiKey,
          body: { model, max_tokens: 8000, thinking, system: opts.system, messages, stream: true, cache_control: cacheControl },
          onChunk: channel,
        });
        return { content: String(asRecord(final).text ?? ''), results };
      } catch {
        // streaming transport failed — fall through to a blocking call
      }
    }

    let data: Record<string, unknown>;
    try {
      data = await invokeRetry<Record<string, unknown>>('claude_chat', {
        apiKey,
        body: { model, max_tokens: 8000, thinking, system: opts.system, messages, tools: ANTHROPIC_TOOLS, cache_control: cacheControl },
      });
    } catch (e) {
      return { content: friendlyClaudeError(e), results };
    }

    // cache visibility: input_tokens is only the uncached remainder
    const usage = asRecord(data.usage);
    if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
      console.debug(
        `[cache] round ${round}: read=${usage.cache_read_input_tokens ?? 0} wrote=${usage.cache_creation_input_tokens ?? 0} uncached=${usage.input_tokens ?? 0}`
      );
    }

    const blocks = Array.isArray(data.content) ? (data.content as unknown[]) : [];
    const text = blocks
      .filter((b) => asRecord(b).type === 'text')
      .map((b) => String(asRecord(b).text ?? ''))
      .join('')
      .trim();
    const toolUses = blocks.filter((b) => asRecord(b).type === 'tool_use');

    if (toolUses.length === 0) {
      // Claude normally uses native tools, but accept the same text-action
      // fallback as local models so a supported action is never merely prose.
      const fromText = executeActions(text);
      results.push(...fromText.results);
      const visible = fromText.visible || text;
      return { content: results.length ? visible : removeUnverifiedActionClaims(visible), results };
    }

    messages.push({ role: 'assistant', content: blocks });
    const toolResults = toolUses.map((b) => {
      const r = asRecord(b);
      const result = executeTool(String(r.name ?? ''), asRecord(r.input));
      results.push(result);
      return { type: 'tool_result', tool_use_id: String(r.id ?? ''), content: result };
    });
    messages.push({ role: 'user', content: toolResults });
    justRanTools = true;
  }

  return { content: '', results };
}

/** Provider-aware agent turn. Ollama is opt-in only; unknown/off providers never fall through to it. */
export async function chatWithTools(opts: {
  url: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxRounds?: number;
  onToken?: (token: string) => void;
}): Promise<{ content: string; results: string[] }> {
  const provider = store.data.settings.localAiProvider;
  if (provider === 'Claude') return chatClaude(opts);
  if (provider === 'Ollama') return chatOllama(opts);
  return { content: 'AI backend is off — no model call was made.', results: [] };
}
