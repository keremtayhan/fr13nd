<script lang="ts">
  import { store } from '$lib/store.svelte';

  let addOpen   = $state(false);
  let newTitle  = $state('');
  let newNote   = $state('');
  let newCadence = $state('Daily');
  const CADENCES = ['Daily', 'Weekly', 'Monthly'];

  const doneCount  = $derived(store.data.pet.tasks.filter(t => t.completed).length);
  const totalCount = $derived(store.data.pet.tasks.length);

  // ♡ → ◉ when all daily done
  const statusKitty = $derived(() => {
    const daily = store.data.pet.tasks.filter(t => t.cadence === 'Daily');
    const dailyDone = daily.filter(t => t.completed).length;
    if (daily.length === 0) return { glyph: '♡', cls: 'muted' };
    if (dailyDone === daily.length) return { glyph: '◉', cls: 'teal' };
    if (dailyDone > 0) return { glyph: '◎', cls: 'gold' };
    return { glyph: '○', cls: 'muted' };
  });

  function toggle(id: string) {
    const t = store.data.pet.tasks.find(t => t.id === id);
    if (!t) return;
    t.completed = !t.completed;
    store.save();
  }

  function deleteTask(id: string) {
    store.data.pet.tasks = store.data.pet.tasks.filter(t => t.id !== id);
    store.save();
  }

  function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    store.data.pet.tasks.push({
      id: store.newId(),
      title,
      kind: 'Care',
      cadence: newCadence,
      note: newNote.trim(),
      progress: 0,
      target: 1,
      completed: false,
    });
    store.save();
    newTitle = ''; newNote = '';
    addOpen = false;
  }
</script>

<div class="panel">
  <div class="summary">
    <span class="status-kitty {statusKitty().cls}">{statusKitty().glyph} pet</span>
    <span class:teal={doneCount === totalCount} class:muted={doneCount < totalCount}>
      {doneCount}/{totalCount} done
    </span>
  </div>

  <hr class="divider" />

  <div class="list">
    {#each store.data.pet.tasks as t (t.id)}
      <div class="task-row" class:done={t.completed}>
        <button class="check" onclick={() => toggle(t.id)}>
          {t.completed ? '◉' : '○'}
        </button>
        <div class="task-info">
          <span class="title">{t.title}</span>
          {#if t.note}<span class="note muted">{t.note}</span>{/if}
        </div>
        <span class="cadence muted">{t.cadence[0]}</span>
        <button class="del" onclick={() => deleteTask(t.id)}>×</button>
      </div>
    {/each}
    {#if store.data.pet.tasks.length === 0}
      <div class="empty muted">— no kitty tasks —</div>
    {/if}
  </div>

  <hr class="divider" />

  {#if addOpen}
    <div class="add-form">
      <input bind:value={newTitle} placeholder="task title" />
      <div class="row-selects">
        <select bind:value={newCadence}>
          {#each CADENCES as c}<option value={c}>{c}</option>{/each}
        </select>
        <input bind:value={newNote} placeholder="note (optional)" />
      </div>
      <div class="row-actions">
        <button class="btn btn-gold" onclick={addTask}>[ADD]</button>
        <button class="btn" onclick={() => addOpen = false}>[CANCEL]</button>
      </div>
    </div>
  {:else}
    <button class="add-btn" onclick={() => addOpen = true}>+ new task</button>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .summary {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 8px; font-size: 10px; flex-shrink: 0;
  }
  .status-kitty { font-size: 11px; letter-spacing: 0.05em; }
  .teal { color: var(--teal); }
  .list { flex: 1; overflow-y: auto; }
  .task-row {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; border-bottom: 1px solid var(--line);
  }
  .task-row.done .title { color: var(--muted); text-decoration: line-through; }
  .check { font-size: 12px; color: var(--rose); flex-shrink: 0; }
  .check:hover { color: var(--teal); }
  .task-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .title { font-size: 11px; }
  .note  { font-size: 9px; }
  .cadence { font-size: 9px; flex-shrink: 0; }
  .del { font-size: 12px; color: var(--line); flex-shrink: 0; }
  .del:hover { color: var(--red); }
  .empty { padding: 16px; text-align: center; font-size: 11px; }
  .add-form { padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
  .row-selects { display: flex; gap: 4px; }
  .row-selects select { width: 90px; }
  .row-selects input { flex: 1; }
  .row-actions { display: flex; gap: 6px; }
  .add-btn { padding: 8px; font-size: 11px; color: var(--muted); text-align: left; width: 100%; }
  .add-btn:hover { color: var(--rose); }
</style>
