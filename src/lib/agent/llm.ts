// LLM transport layer: provider-aware completions (plain + vision), transient
// retry, and error humanizing. No prompts, no tools — just moving text/images
// to a model and back. Everything above this (chat loops, features) builds on it.

import { invoke } from '@tauri-apps/api/core';
import { store } from '../store.svelte';

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export interface ChatMessage {
  role: string;
  // string for plain text, or an array of Anthropic content blocks (text + image)
  // when the operator shows fr13nd a picture. Only the Claude backend sees images.
  content: string | unknown[];
  tool_calls?: unknown[];
  tool_name?: string;
}

/** Flatten content (string or content-block array) to plain text — for text-only backends. */
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const r = b as Record<string, unknown>;
        if (r.type === 'text') return String(r.text ?? '');
        if (r.type === 'image') return '[image]';
        return '';
      })
      .join(' ')
      .trim();
  }
  return '';
}

/** Retry transient Anthropic errors (429 / 5xx / overloaded) with capped backoff + jitter. */
export async function invokeRetry<T>(cmd: string, args: Record<string, unknown>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      const msg = String(e);
      const transient = /(?:^|\D)(?:429|500|502|503|529)(?:\D|$)|overloaded|rate.?limit/i.test(msg);
      if (i < tries - 1 && transient) {
        // 0.6s, 1.2s, 2.4s, 4.8s (capped 6s) + jitter — rides out a transient overload.
        const wait = Math.min(6000, 600 * Math.pow(2, i)) + Math.random() * 300;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

/** Turn a raw Anthropic transport error into a short, human explanation. */
export function friendlyClaudeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/overloaded|(?:^|\D)529(?:\D|$)/i.test(msg)) {
    return "⚠ Anthropic's servers are overloaded right now (529) — that's their capacity, not your data. I retried a few times and they're still slammed; give it a few seconds and send again.";
  }
  if (/(?:^|\D)429(?:\D|$)|rate.?limit/i.test(msg)) {
    return '⚠ Rate-limited by Anthropic (429) — too many requests too fast. Wait a moment and resend.';
  }
  if (/401|403|authentication|invalid.{0,8}api.?key|x-api-key/i.test(msg)) {
    return '⚠ Claude rejected the API key — open [CFG] and re-paste your Anthropic key.';
  }
  return `⚠ Claude error — ${msg}`;
}

/** Provider-aware plain completion (no tools, no streaming) — used by reflection. */
export async function rawComplete(system: string, user: string, maxTokens = 700): Promise<string> {
  const s = store.data.settings;
  if (s.localAiProvider === 'Claude') {
    const apiKey = s.anthropicApiKey?.trim();
    if (!apiKey) return '';
    const data = await invokeRetry<Record<string, unknown>>('claude_chat', {
      apiKey,
      body: { model: s.anthropicModel?.trim() || 'claude-opus-4-8', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
    });
    const blocks = Array.isArray(asRecord(data).content) ? (asRecord(data).content as unknown[]) : [];
    return blocks
      .filter((b) => asRecord(b).type === 'text')
      .map((b) => String(asRecord(b).text ?? ''))
      .join('');
  }
  if (s.localAiProvider !== 'Ollama') return '';

  const data = await invoke<Record<string, unknown>>('ollama_chat', {
    url: s.localAiUrl,
    body: { model: s.localAiModel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false },
  });
  return String(asRecord(asRecord(data).message).content ?? '');
}

/**
 * Local-only completion via Ollama — for lightweight private tasks (e.g. food
 * logging) that shouldn't touch the cloud backend even when Claude is the
 * active provider. Talks straight to the configured Ollama endpoint and
 * returns '' when Ollama is down or errors, so callers degrade gracefully.
 */
export async function localComplete(system: string, user: string): Promise<string> {
  const s = store.data.settings;
  if (s.localAiProvider !== 'Ollama') return '';
  const url = s.localAiUrl?.trim() || 'http://localhost:11434/api/chat';
  const model = s.localAiModel?.trim() || 'qwen2.5:7b';
  try {
    const data = await invoke<Record<string, unknown>>('ollama_chat', {
      url,
      body: { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false },
    });
    return String(asRecord(asRecord(data).message).content ?? '');
  } catch {
    return '';
  }
}

/** A one-shot Claude vision call: system + text + image blocks → text. Claude backend only. */
export async function visionComplete(
  system: string,
  text: string,
  images: { media: string; data: string }[],
  maxTokens = 700
): Promise<string> {
  const s = store.data.settings;
  if (s.localAiProvider !== 'Claude') return '';
  const apiKey = s.anthropicApiKey?.trim();
  if (!apiKey) return '';
  const content: unknown[] = [{ type: 'text', text }];
  for (const im of images) content.push({ type: 'image', source: { type: 'base64', media_type: im.media, data: im.data } });
  const data = await invokeRetry<Record<string, unknown>>('claude_chat', {
    apiKey,
    body: { model: s.anthropicModel?.trim() || 'claude-opus-4-8', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] },
  });
  const blocks = Array.isArray(asRecord(data).content) ? (asRecord(data).content as unknown[]) : [];
  return blocks
    .filter((b) => asRecord(b).type === 'text')
    .map((b) => String(asRecord(b).text ?? ''))
    .join('')
    .trim();
}
