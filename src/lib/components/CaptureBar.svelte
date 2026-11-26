<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { listen } from '$lib/runtime';
  import { store } from '$lib/store.svelte';
  import { buildCaptureSystem, chatWithTools, executeTool, heuristicCapture } from '$lib/agent';
  import type { AppData } from '$lib/types';

  let input = $state('');
  let busy = $state(false);
  let offline = $state(false);
  let results = $state<string[]>([]);
  let inputEl = $state<HTMLTextAreaElement | null>(null);

  // global hotkey (Ctrl+Shift+Space) emits this from the Rust side
  let unlisten: (() => void) | undefined;
  onMount(async () => {
    unlisten = await listen('focus-capture', () => {
      inputEl?.focus();
      inputEl?.select();
    });
  });
  onDestroy(() => unlisten?.());

  // whole-data snapshot taken right before a capture, so a misroute is one click away from undo
  let undoSnapshot: AppData | null = $state(null);

  function runHeuristic(text: string): string {
    const { name, args } = heuristicCapture(text);
    return executeTool(name, args);
  }

  async function capture() {
    const text = input.trim();
    if (!text || busy) return;

    busy = true;
    offline = false;
    results = [];
    undoSnapshot = structuredClone($state.snapshot(store.data)) as AppData;
    input = '';

    try {
      if (!['Claude', 'Ollama'].includes(store.data.settings.localAiProvider)) {
        offline = true;
        results = [runHeuristic(text)];
        return;
      }

      const ran = await chatWithTools({
        url: store.data.settings.localAiUrl,
        model: store.data.settings.localAiModel,
        system: buildCaptureSystem(),
        messages: [{ role: 'user', content: text }],
        maxRounds: 2,
      });

      results = ran.results.length > 0 ? ran.results : [runHeuristic(text)];
    } catch {
      // model unreachable — file it locally so the thought is never lost
      offline = true;
      results = [runHeuristic(text)];
    } finally {
      busy = false;
      if (results.length) store.reportToOverseer('capture', results.join(' | '));
    }
  }

  function undo() {
    if (!undoSnapshot) return;
    store.data = structuredClone(undoSnapshot) as AppData;
    store.save();
    undoSnapshot = null;
    results = [];
    offline = false;
  }

  function dismiss() {
    results = [];
    offline = false;
    undoSnapshot = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      capture();
    }
  }
</script>

<div class="capture">
  <div class="cap-row">
    <span class="cap-sigil" class:busy>⊕</span>
    <textarea
      bind:this={inputEl}
      bind:value={input}
      onkeydown={onKeydown}
      rows="1"
      placeholder="dump a thought — it gets filed…"
      disabled={busy}
    ></textarea>
    <button class="cap-send" onclick={capture} disabled={busy}>{busy ? '···' : '[FILE]'}</button>
  </div>

  {#if results.length > 0}
    <div class="cap-result" class:offline>
      <span class="cap-mark">{offline ? '⚠ offline · filed' : '▸ filed'}</span>
      <div class="cap-tags">
        {#each results as r}
          <span class="cap-tag">{r}</span>
        {/each}
      </div>
      <button class="cap-undo" onclick={undo} title="undo this capture">[undo]</button>
      <button class="cap-x" onclick={dismiss} title="dismiss">[×]</button>
    </div>
  {/if}
</div>

<style>
  .capture {
    flex-shrink: 0;
    border-bottom: 1px solid var(--line);
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--gold) 7%, transparent) 0 1px, transparent 1px 11px),
      color-mix(in srgb, var(--gold) 4%, transparent);
  }

  .cap-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
  }

  .cap-sigil {
    color: var(--gold);
    font-size: 13px;
    flex-shrink: 0;
    line-height: 1;
  }
  .cap-sigil.busy {
    animation: cap-pulse 0.9s ease-in-out infinite;
  }
  @keyframes cap-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .cap-row textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    font-size: 11px;
    line-height: 1.4;
    background: var(--void);
  }
  .cap-row textarea:focus {
    border-color: var(--gold);
  }

  .cap-send {
    flex-shrink: 0;
    font-size: 10px;
    letter-spacing: 0.05em;
    padding: 3px 6px;
    border: 1px solid var(--gold);
    color: var(--gold);
  }
  .cap-send:hover:not(:disabled) {
    background: var(--gold);
    color: var(--void);
  }
  .cap-send:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .cap-result {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 5px;
    flex-wrap: wrap;
  }

  .cap-mark {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--teal);
    flex-shrink: 0;
  }
  .cap-result.offline .cap-mark {
    color: var(--red);
  }

  .cap-tags {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  }

  .cap-tag {
    font-size: 9px;
    padding: 1px 5px;
    border: 1px solid var(--line);
    color: var(--ink);
    background: var(--void);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cap-undo {
    font-size: 9px;
    color: var(--gold);
    flex-shrink: 0;
  }
  .cap-undo:hover { color: var(--ink); }

  .cap-x {
    font-size: 9px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .cap-x:hover { color: var(--red); }
</style>
