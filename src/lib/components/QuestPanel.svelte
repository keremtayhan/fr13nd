<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Quest, QuestStep, QuestKind, QuestCadence } from '$lib/types';

  const SECTIONS = ['All', 'Main', 'School', 'Daily', 'Weekly', 'Monthly'] as const;
  const KINDS: QuestKind[] = ['Main', 'Job', 'School', 'Side', 'Ritual'];
  const CADENCES: QuestCadence[] = ['Today', 'Daily', 'Weekly', 'Monthly', 'Long Arc'];
  const CADENCE_WEIGHT: Record<QuestCadence, number> = {
    Today: 0, Daily: 1, Weekly: 2, Monthly: 3, 'Long Arc': 4,
  };

  let section = $state<string>('All');
  let editingId = $state<string | null>(null);
  let expandedId = $state<string | null>(null);
  let stepDraft = $state('');
  let addOpen = $state(false);

  let newTitle    = $state('');
  let newKind     = $state<QuestKind>('Main');
  let newCadence  = $state<QuestCadence>('Daily');
  let newTarget   = $state(1);
  let newNote     = $state('');
  let newAdvice   = $state('');

  let editTitle   = $state('');
  let editKind    = $state<QuestKind>('Main');
  let editCadence = $state<QuestCadence>('Daily');
  let editTarget  = $state(1);
  let editNote    = $state('');
  let editAdvice  = $state('');
  let adviceQuestId = $state<string | null>(null);

  const adviceQuest = $derived(store.data.quests.find(q => q.id === adviceQuestId));

  const visibleQuests = $derived.by(() => {
    const q = store.data.quests.filter(q => {
      if (section === 'All') return true;
      if (section === 'Main')    return q.kind === 'Main';
      if (section === 'School')  return q.kind === 'School';
      if (section === 'Daily')   return q.cadence === 'Daily' || q.cadence === 'Today';
      if (section === 'Weekly')  return q.cadence === 'Weekly';
      if (section === 'Monthly') return q.cadence === 'Monthly';
      return true;
    });
    return [...q].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return CADENCE_WEIGHT[a.cadence] - CADENCE_WEIGHT[b.cadence];
    });
  });

  function kindColor(kind: QuestKind): string {
    return { Main: 'kind-main', Job: 'kind-job', School: 'kind-school', Side: 'kind-side', Ritual: 'kind-ritual' }[kind];
  }

  function progress(q: Quest) {
    if (q.target <= 1) return q.completed ? '✓' : '○';
    return `${q.progress}/${q.target}`;
  }

  function addProgress(q: Quest) {
    if (q.completed) return;
    q.progress = Math.min(q.progress + 1, q.target);
    if (q.progress >= q.target) q.completed = true;
    store.save();
  }

  function toggleComplete(q: Quest) {
    q.completed = !q.completed;
    if (q.completed) q.progress = q.target;
    else q.progress = 0;
    store.save();
  }

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
    stepDraft = '';
  }

  function stepsOf(q: Quest): QuestStep[] {
    return q.steps ?? [];
  }

  /** "2/4" when a quest has a breakdown, else '' */
  function stepSummary(q: Quest): string {
    const s = q.steps ?? [];
    return s.length ? `${s.filter((x) => x.done).length}/${s.length}` : '';
  }

  function addStep(q: Quest) {
    const t = stepDraft.trim();
    if (!t) return;
    (q.steps ??= []).push({ id: store.newId(), text: t, done: false });
    stepDraft = '';
    store.save();
  }

  function toggleStep(s: QuestStep) {
    s.done = !s.done;
    store.save();
  }

  function deleteStep(q: Quest, id: string) {
    q.steps = (q.steps ?? []).filter((x) => x.id !== id);
    store.save();
  }

  function startEdit(q: Quest) {
    editingId  = q.id;
    editTitle   = q.title;
    editKind    = q.kind;
    editCadence = q.cadence;
    editTarget  = q.target;
    editNote    = q.note;
    editAdvice  = q.advice ?? '';
  }

  function saveEdit(q: Quest) {
    q.title   = editTitle.trim() || q.title;
    q.kind    = editKind;
    q.cadence = editCadence;
    q.target  = Math.max(1, editTarget);
    q.note    = editNote;
    q.advice  = editAdvice;
    editingId = null;
    store.save();
  }

  function deleteQuest(id: string) {
    store.data.quests = store.data.quests.filter(q => q.id !== id);
    if (adviceQuestId === id) adviceQuestId = null;
    if (expandedId === id) expandedId = null;
    store.save();
  }

  function questHint(q: Quest) {
    const written = q.advice?.trim();
    if (written) return written;

    const firstMove = q.target > 1
      ? 'Touch the counter once. One mark is enough to break the seal.'
      : 'Make the first move small enough that it feels almost rude to avoid.';
    const note = q.note?.trim()
      ? `Signal already attached: ${q.note.trim()}`
      : 'No note attached. Name the next visible action before you begin.';

    return `${firstMove}\n\n${note}\n\nFor "${q.title}", do not solve the whole quest. Find the nearest handle, pull once, then reassess.`;
  }

  function addQuest() {
    const t = newTitle.trim();
    if (!t) return;
    store.data.quests.push({
      id: store.newId(),
      title: t,
      kind: newKind,
      cadence: newCadence,
      target: Math.max(1, newTarget),
      progress: 0,
      completed: false,
      note: newNote,
      advice: newAdvice,
    });
    store.save();
    newTitle = ''; newNote = ''; newAdvice = ''; newTarget = 1;
    addOpen = false;
  }
</script>

<div class="panel">
  <!-- section filter -->
  <div class="sections">
    {#each SECTIONS as s}
      <button class="sect" class:active={section === s} onclick={() => section = s}>
        {s.toUpperCase()}
      </button>
    {/each}
  </div>

  <hr class="divider" />

  <!-- quest list -->
  <div class="list">
    {#each visibleQuests as q (q.id)}
      {#if editingId === q.id}
        <div class="edit-row">
          <input bind:value={editTitle} placeholder="title" />
          <div class="edit-selects">
            <select bind:value={editKind}>
              {#each KINDS as k}<option value={k}>{k}</option>{/each}
            </select>
            <select bind:value={editCadence}>
              {#each CADENCES as c}<option value={c}>{c}</option>{/each}
            </select>
            <input type="number" bind:value={editTarget} min="1" max="99" style="width:48px;" />
          </div>
          <textarea bind:value={editNote} rows="2" placeholder="requirements / what counts as done"></textarea>
          <textarea bind:value={editAdvice} rows="3" placeholder="advice / hint window text"></textarea>
          <div class="edit-actions">
            <button class="btn btn-gold" onclick={() => saveEdit(q)}>[SAVE]</button>
            <button class="btn" onclick={() => editingId = null}>[CANCEL]</button>
            <button class="btn" style="color:var(--red);" onclick={() => deleteQuest(q.id)}>[DEL]</button>
          </div>
        </div>
      {:else}
        <div class="quest-row" class:done={q.completed}>
          <button
            class="caret"
            class:open={expandedId === q.id}
            class:has-steps={stepsOf(q).length > 0}
            onclick={() => toggleExpand(q.id)}
            title="steps"
          >{expandedId === q.id ? '▾' : '▸'}</button>
          <span class="badge {kindColor(q.kind)}">{q.kind[0]}</span>
          <span class="title" title={q.note || q.title}>{q.title}</span>
          {#if stepsOf(q).length > 0}
            <span class="step-count" title="steps done">{stepSummary(q)}</span>
          {/if}
          <span class="prog muted">{progress(q)}</span>
          <div class="actions">
            {#if !q.completed && q.target > 1}
              <button onclick={() => addProgress(q)} title="progress">[+]</button>
            {/if}
            <button onclick={() => toggleComplete(q)} title="toggle complete">
              {q.completed ? '[↺]' : '[✓]'}
            </button>
            <button onclick={() => adviceQuestId = q.id} title="advice">[?]</button>
            <button onclick={() => startEdit(q)} title="edit">[⋯]</button>
          </div>
        </div>
        {#if q.note && !q.completed}
          <div class="note"><b>REQ</b> {q.note}</div>
        {/if}
        {#if expandedId === q.id}
          <div class="steps-drawer">
            {#each stepsOf(q) as s (s.id)}
              <div class="step" class:sdone={s.done}>
                <button class="step-check" onclick={() => toggleStep(s)} title="toggle step">
                  {s.done ? '[✓]' : '[ ]'}
                </button>
                <span class="step-text">{s.text}</span>
                <button class="step-del" onclick={() => deleteStep(q, s.id)} title="remove step">[x]</button>
              </div>
            {/each}
            {#if stepsOf(q).length === 0}
              <div class="step-empty">No steps yet — break this directive into small moves.</div>
            {/if}
            <div class="step-add">
              <input
                bind:value={stepDraft}
                placeholder="add a step…"
                onkeydown={(e) => { if (e.key === 'Enter') addStep(q); }}
              />
              <button class="btn btn-gold" onclick={() => addStep(q)}>[+]</button>
            </div>
          </div>
        {/if}
      {/if}
    {/each}

    {#if visibleQuests.length === 0}
      <div class="empty-state">
        <span class="empty-kicker">{store.data.quests.length === 0 ? 'NO ACTIVE DIRECTIVES' : 'THIS CHANNEL IS CLEAR'}</span>
        <p>{store.data.quests.length === 0
          ? 'Give the day one visible target. Small, concrete, finishable.'
          : 'Nothing is waiting here. Change the filter or forge something new.'}</p>
        {#if store.data.quests.length === 0}
          <button class="empty-cta" onclick={() => addOpen = true}>[FORGE FIRST DIRECTIVE]</button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- add quest -->
  <hr class="divider" />
  {#if addOpen}
    <div class="add-form">
      <input bind:value={newTitle} placeholder="directive title" />
      <div class="edit-selects">
        <select bind:value={newKind}>
          {#each KINDS as k}<option value={k}>{k}</option>{/each}
        </select>
        <select bind:value={newCadence}>
          {#each CADENCES as c}<option value={c}>{c}</option>{/each}
        </select>
        <input type="number" bind:value={newTarget} min="1" max="99" style="width:48px;" />
      </div>
      <textarea bind:value={newNote} rows="2" placeholder="requirements / what counts as done"></textarea>
      <textarea bind:value={newAdvice} rows="3" placeholder="advice / hint window text"></textarea>
      <div class="edit-actions">
        <button class="btn btn-gold" onclick={addQuest}>[ADD]</button>
        <button class="btn" onclick={() => addOpen = false}>[CANCEL]</button>
      </div>
    </div>
  {:else}
    <button class="add-btn" onclick={() => addOpen = true}>+ new directive</button>
  {/if}

  {#if adviceQuest}
    <div class="advice-window" role="dialog" aria-label="quest advice">
      <div class="advice-title">
        <span class="badge {kindColor(adviceQuest.kind)}">{adviceQuest.kind[0]}</span>
        <span>{adviceQuest.title}</span>
        <button onclick={() => adviceQuestId = null}>[X]</button>
      </div>
      <pre class="advice-body">{questHint(adviceQuest)}</pre>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  }
  .sections {
    display: flex;
    gap: 2px;
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .sect {
    font-size: 10px;
    padding: 2px 5px;
    color: var(--muted);
    letter-spacing: 0.06em;
  }
  .sect.active {
    color: var(--gold);
    border-bottom: 1px solid var(--gold);
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .quest-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
    min-height: 28px;
  }
  .quest-row.done .title {
    color: var(--muted);
    text-decoration: line-through;
  }
  .quest-row.done .badge {
    opacity: 0.4;
  }
  .caret {
    font-size: 9px;
    width: 12px;
    flex-shrink: 0;
    color: var(--line);
    text-align: center;
    transition: color 0.12s;
  }
  .caret.has-steps {
    color: var(--muted);
  }
  .caret:hover, .caret.open {
    color: var(--gold);
  }
  .badge {
    font-size: 9px;
    font-weight: 700;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
    letter-spacing: 0;
  }
  .step-count {
    font-size: 9px;
    color: var(--gold);
    flex-shrink: 0;
    letter-spacing: 0.04em;
    opacity: 0.75;
  }
  .title {
    flex: 1;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prog {
    font-size: 10px;
    flex-shrink: 0;
    min-width: 28px;
    text-align: right;
  }
  .actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    font-size: 10px;
  }
  .note {
    color: var(--muted);
    font-size: 10px;
    padding: 0 8px 4px 28px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note b {
    color: var(--gold);
    letter-spacing: 0.08em;
    margin-right: 3px;
  }
  .steps-drawer {
    padding: 4px 8px 7px 26px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--gold) 3%, transparent);
  }
  .step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 10px;
  }
  .step-check {
    font-size: 10px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .step-check:hover {
    color: var(--gold);
  }
  .step-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
  }
  .step.sdone .step-check {
    color: var(--gold);
  }
  .step.sdone .step-text {
    color: var(--muted);
    text-decoration: line-through;
  }
  .step-del {
    font-size: 9px;
    color: var(--line);
    flex-shrink: 0;
  }
  .step-del:hover {
    color: var(--red);
  }
  .step-empty {
    font-size: 10px;
    color: var(--muted);
    padding: 3px 0 5px;
    line-height: 1.5;
  }
  .step-add {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .step-add input {
    flex: 1;
    min-width: 0;
    font-size: 10px;
  }
  .empty-state {
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    margin: 16px 12px;
    padding: 20px;
    text-align: center;
    border: 1px solid color-mix(in srgb, var(--gold) 38%, var(--line));
    background: radial-gradient(90% 100% at 50% 0%, color-mix(in srgb, var(--gold) 9%, transparent), transparent 72%);
  }
  .empty-kicker {
    color: var(--gold);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  .empty-state p {
    max-width: 260px;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.6;
  }
  .empty-cta {
    margin-top: 3px;
    border: 1px solid var(--gold);
    color: var(--gold);
    padding: 5px 8px;
    font-size: 9px;
    letter-spacing: 0.06em;
  }
  .empty-cta:hover {
    background: var(--gold);
    color: var(--void);
  }
  .edit-row, .add-form {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .edit-selects {
    display: flex;
    gap: 4px;
  }
  .edit-selects select {
    flex: 1;
  }
  .edit-actions {
    display: flex;
    gap: 6px;
  }
  .add-btn {
    padding: 8px;
    font-size: 11px;
    color: var(--muted);
    text-align: left;
    width: 100%;
    flex-shrink: 0;
  }
  .add-btn:hover {
    color: var(--gold);
  }
  .advice-window {
    position: absolute;
    left: 22px;
    right: 22px;
    top: 72px;
    z-index: 5;
    border: 1px solid var(--gold);
    background: var(--void);
    box-shadow:
      0 0 0 1px var(--void),
      0 14px 28px rgba(0, 0, 0, 0.68),
      inset 0 0 16px color-mix(in srgb, var(--gold) 7%, transparent);
  }
  .advice-title {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 7px;
    border-bottom: 1px solid var(--line);
    color: var(--ink);
    font-size: 10px;
  }
  .advice-title span:nth-child(2) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .advice-title button {
    color: var(--red);
    font-size: 10px;
  }
  .advice-body {
    white-space: pre-wrap;
    padding: 9px;
    color: var(--ink);
    font: inherit;
    font-size: 11px;
    line-height: 1.55;
    max-height: 220px;
    overflow-y: auto;
  }
</style>
