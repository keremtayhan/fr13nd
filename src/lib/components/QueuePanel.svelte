<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { pickFromQueue } from '$lib/agent';
  import type { QueueKind, QueueStatus } from '$lib/types';

  let kind = $state<QueueKind>('watch');
  let draft = $state('');
  let picking = $state(false);
  let pickText = $state('');
  let showDone = $state(false);
  let confirmId = $state<string | null>(null);

  const items = $derived(store.data.queue.items);
  const counts = $derived({
    watch: items.filter((i) => i.kind === 'watch' && i.status !== 'done').length,
    read: items.filter((i) => i.kind === 'read' && i.status !== 'done').length,
  });
  // active first, then queued; stable by add order within a status
  const live = $derived(
    items
      .filter((i) => i.kind === kind && i.status !== 'done')
      .slice()
      .sort((a, b) => (a.status === b.status ? a.addedAt.localeCompare(b.addedAt) : a.status === 'active' ? -1 : 1))
  );
  const done = $derived(items.filter((i) => i.kind === kind && i.status === 'done').slice().reverse());

  function statusMark(s: QueueStatus) {
    return s === 'active' ? '[▸]' : s === 'done' ? '[✓]' : '[ ]';
  }

  function add() {
    const t = draft.trim();
    if (!t) return;
    store.addQueueItem(kind, t);
    draft = '';
  }
  function addKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }
  async function pick() {
    if (picking || live.length === 0) return;
    picking = true;
    pickText = '';
    try {
      pickText = (await pickFromQueue(kind)).trim() || '⚠ no reply — switch BACKEND to Claude in AGENT [CFG].';
    } catch (e) {
      pickText = '⚠ ' + (e instanceof Error ? e.message : String(e));
    } finally {
      picking = false;
    }
  }
  function switchKind(k: QueueKind) {
    kind = k;
    pickText = '';
    confirmId = null;
  }
</script>

<div class="panel queue-deck">
  <div class="q-tabs">
    <button class:active={kind === 'watch'} onclick={() => switchKind('watch')}>WATCH<i>{counts.watch}</i></button>
    <button class:active={kind === 'read'} onclick={() => switchKind('read')}>READ<i>{counts.read}</i></button>
  </div>

  <div class="q-add">
    <input bind:value={draft} onkeydown={addKey} placeholder={kind === 'watch' ? 'add a film / show…' : 'add a book / article…'} />
    <button class="btn btn-q" onclick={add} disabled={!draft.trim()}>[+]</button>
  </div>

  <div class="q-pick">
    <button class="btn pick-btn" onclick={pick} disabled={picking || live.length === 0}>{picking ? '✦ deciding…' : '✦ PICK ONE FOR ME'}</button>
    {#if pickText}
      <div class="pick-out">
        <span class="sigil">✦</span>
        <pre>{pickText}</pre>
        <button class="pick-x" onclick={() => (pickText = '')} aria-label="dismiss">✕</button>
      </div>
    {/if}
  </div>

  <div class="q-list">
    {#if live.length === 0}
      <div class="empty muted">- nothing queued · catch something above -</div>
    {/if}
    {#each live as it (it.id)}
      <div class="q-item st-{it.status}">
        <button class="q-status" title="queued → {kind === 'watch' ? 'watching' : 'reading'} → done" onclick={() => store.cycleQueueStatus(it.id)}>{statusMark(it.status)}</button>
        <div class="q-body">
          <input class="q-title" bind:value={it.title} oninput={() => store.touchQueueItem(it.id)} placeholder="title" />
          <input class="q-note" bind:value={it.note} oninput={() => store.touchQueueItem(it.id)} placeholder="where · who recced · rating…" />
        </div>
        {#if confirmId === it.id}
          <button class="del del-confirm" onclick={() => store.deleteQueueItem(it.id)} title="confirm delete">✓</button>
          <button class="del" onclick={() => (confirmId = null)} title="cancel">✕</button>
        {:else}
          <button class="del" onclick={() => (confirmId = it.id)} title="remove">x</button>
        {/if}
      </div>
    {/each}
  </div>

  {#if done.length > 0}
    <button class="q-donehead" onclick={() => (showDone = !showDone)}>{showDone ? '▾' : '▸'} FINISHED · {done.length}</button>
    {#if showDone}
      <div class="q-done">
        {#each done as it (it.id)}
          <div class="q-donerow">
            <button class="q-status done" onclick={() => store.cycleQueueStatus(it.id)} title="reopen">[✓]</button>
            <span class="q-donetitle">{it.title}</span>
            {#if it.note}<span class="q-donenote muted">{it.note}</span>{/if}
            <button class="del" onclick={() => store.deleteQueueItem(it.id)} title="remove">x</button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; --q: var(--fuchsia); }
  .queue-deck { padding: 8px; gap: 7px; }

  .q-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; flex-shrink: 0; }
  .q-tabs button {
    height: 26px; border: 1px solid var(--line); color: var(--muted);
    font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  }
  .q-tabs button.active { border-color: var(--q); color: var(--q); background: color-mix(in srgb, var(--q) 13%, transparent); }
  .q-tabs button i { font-style: normal; font-size: 9px; opacity: 0.7; }

  .q-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px; flex-shrink: 0; }
  .q-add input:focus { border-color: var(--q); }
  .btn-q { color: var(--q); border-color: color-mix(in srgb, var(--q) 45%, var(--line)); }
  .btn-q:hover:not(:disabled) { background: var(--q); color: var(--void); }

  .q-pick { display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; }
  .pick-btn { width: 100%; color: var(--q); border-color: color-mix(in srgb, var(--q) 50%, var(--line)); letter-spacing: 0.12em; font-weight: 700; }
  .pick-btn:hover:not(:disabled) { background: var(--q); color: var(--void); }
  .pick-out { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; background: color-mix(in srgb, var(--q) 9%, transparent); padding: 7px 20px 7px 8px; }
  .pick-out .sigil { color: var(--q); }
  .pick-out pre { margin: 0; white-space: pre-wrap; color: var(--ink); font-size: 11px; line-height: 1.5; }
  .pick-x { position: absolute; top: 2px; right: 3px; width: 16px; height: 16px; padding: 0; background: none; color: var(--muted); font-size: 10px; }
  .pick-x:hover { color: var(--red); }

  .q-list { flex: 1; min-height: 0; overflow-y: auto; }
  .q-item {
    display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 6px; align-items: center;
    padding: 5px 0; border-bottom: 1px solid var(--line);
  }
  .q-status { color: var(--muted); font-size: 11px; padding: 0; }
  .st-active .q-status { color: var(--q); }
  .q-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .q-title { border-color: transparent; background: transparent; padding: 1px 2px; font-size: 11px; color: var(--ink); }
  .q-title:focus { border-color: var(--q); background: color-mix(in srgb, var(--q) 5%, transparent); }
  .st-active .q-title { color: var(--q); }
  .q-note { border-color: transparent; background: transparent; padding: 1px 2px; font-size: 9px; color: var(--muted); }
  .q-note:focus { border-color: var(--q); background: color-mix(in srgb, var(--q) 5%, transparent); }
  .del { color: var(--line); font-size: 11px; padding: 0 3px; }
  .del:hover { color: var(--red); }
  .del-confirm { color: var(--red); }

  .q-donehead { color: var(--muted); font-size: 9px; letter-spacing: 0.1em; text-align: left; padding: 5px 2px; flex-shrink: 0; border-top: 1px solid var(--line); }
  .q-donehead:hover { color: var(--q); }
  .q-done { max-height: 140px; overflow-y: auto; flex-shrink: 0; }
  .q-donerow { display: grid; grid-template-columns: 30px auto minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 3px 0; font-size: 10px; }
  .q-donerow .q-status.done { color: var(--green); }
  .q-donetitle { color: var(--muted); text-decoration: line-through; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .q-donenote { font-size: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .empty { padding: 16px; text-align: center; font-size: 11px; }
</style>
