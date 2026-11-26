<script lang="ts">
  import { store } from '$lib/store.svelte';

  let addOpen = $state(false);
  let newRoom   = $state('');
  let newTitle  = $state('');
  let newCadence = $state('Daily');
  let newNote   = $state('');

  const CADENCES = ['Daily', 'Weekly', 'Monthly'];

  const byRoom = $derived(() => {
    const map = new Map<string, typeof store.data.abode.tasks>();
    for (const t of store.data.abode.tasks) {
      if (!map.has(t.room)) map.set(t.room, []);
      map.get(t.room)!.push(t);
    }
    return map;
  });

  const doneCount  = $derived(store.data.abode.tasks.filter(t => t.completed).length);
  const totalCount = $derived(store.data.abode.tasks.length);

  function toggle(id: string) {
    const t = store.data.abode.tasks.find(t => t.id === id);
    if (!t) return;
    t.completed = !t.completed;
    store.save();
  }

  function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    store.data.abode.tasks.push({
      id: store.newId(),
      room: newRoom.trim() || 'General',
      title,
      cadence: newCadence,
      note: newNote.trim(),
      progress: 0,
      target: 1,
      completed: false,
    });
    store.save();
    newTitle = ''; newNote = ''; newRoom = '';
    addOpen = false;
  }

  function deleteTask(id: string) {
    store.data.abode.tasks = store.data.abode.tasks.filter(t => t.id !== id);
    store.save();
  }
</script>

<div class="panel">
  <div class="summary">
    <span class="muted">BASE STATUS</span>
    <span class:gold={doneCount === totalCount} class:muted={doneCount < totalCount}>
      {doneCount}/{totalCount} done
    </span>
  </div>

  <hr class="divider" />

  <div class="list">
    {#each [...byRoom().entries()] as [room, tasks]}
      <div class="room-group">
        <div class="room-label muted">{room.toUpperCase()}</div>
        {#each tasks as t (t.id)}
          <div class="task-row" class:done={t.completed}>
            <button class="check" onclick={() => toggle(t.id)}>
              {t.completed ? '◉' : '○'}
            </button>
            <span class="title">{t.title}</span>
            <span class="cadence muted">{t.cadence[0]}</span>
            <button class="del" onclick={() => deleteTask(t.id)}>×</button>
          </div>
          {#if t.note}
            <div class="note muted">{t.note}</div>
          {/if}
        {/each}
      </div>
    {/each}

    {#if store.data.abode.tasks.length === 0}
      <div class="empty muted">— no base tasks —</div>
    {/if}
  </div>

  <hr class="divider" />

  {#if addOpen}
    <div class="add-form">
      <input bind:value={newRoom}    placeholder="room (e.g. Kitchen)" />
      <input bind:value={newTitle}   placeholder="task title" />
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
  .list { flex: 1; overflow-y: auto; }
  .room-group { border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-bottom: 2px; }
  .room-label { font-size: 9px; letter-spacing: 0.1em; padding: 5px 8px 2px; }
  .task-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px; font-size: 11px;
  }
  .task-row.done .title { color: var(--muted); text-decoration: line-through; }
  .check { font-size: 12px; color: var(--teal); flex-shrink: 0; }
  .check:hover { color: var(--gold); }
  .title { flex: 1; }
  .cadence { font-size: 9px; flex-shrink: 0; }
  .del { font-size: 12px; color: var(--line); flex-shrink: 0; }
  .del:hover { color: var(--red); }
  .note { font-size: 10px; padding: 0 8px 3px 30px; color: var(--muted); }
  .empty { padding: 16px; text-align: center; font-size: 11px; }
  .add-form { padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
  .row-selects { display: flex; gap: 4px; }
  .row-selects select { width: 90px; }
  .row-selects input { flex: 1; }
  .row-actions { display: flex; gap: 6px; }
  .add-btn { padding: 8px; font-size: 11px; color: var(--muted); text-align: left; width: 100%; }
  .add-btn:hover { color: var(--gold); }
</style>
