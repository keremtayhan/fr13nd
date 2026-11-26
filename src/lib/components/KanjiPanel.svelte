<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { KanjiCard } from '$lib/types';
  import { localDay } from '$lib/day';

  type Mode = 'study' | 'deck';
  let mode = $state<Mode>('study');

  // ── session state ───────────────────────────────────────────────
  let inSession = $state(false);
  let finished = $state(false);
  let session = $state<string[]>([]); // card ids left to clear this session
  let pos = $state(0);
  let flipped = $state(false);
  let reviewed = $state(0);

  const today = localDay();
  const cards = $derived(store.data.kanji.cards);
  const dueCards = $derived(cards.filter((c) => !c.due || c.due <= today));
  const current = $derived(cards.find((c) => c.id === session[pos]) ?? null);

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startSession(reviewAll: boolean) {
    const pool = reviewAll ? cards : dueCards;
    if (pool.length === 0) return;
    session = shuffle(pool.map((c) => c.id));
    pos = 0;
    flipped = false;
    reviewed = 0;
    finished = false;
    inSession = true;
  }

  function grade(ok: boolean) {
    const id = session[pos];
    if (!id) return;
    store.gradeKanji(id, ok);
    reviewed += 1;
    // correct → drop from the session; missed → recycle to the end
    const rest = [...session.slice(0, pos), ...session.slice(pos + 1)];
    session = ok ? rest : [...rest, id];
    flipped = false;
    if (session.length === 0) {
      finished = true;
      inSession = false;
    } else if (pos >= session.length) {
      pos = 0;
    }
  }

  function quit() {
    inSession = false;
    finished = false;
  }

  function onKey(e: KeyboardEvent) {
    if (mode !== 'study' || !inSession) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flipped = !flipped;
    } else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) {
      grade(false);
    } else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) {
      grade(true);
    }
  }

  function boxPips(box: number): string {
    return '●'.repeat(box) + '○'.repeat(Math.max(0, 5 - box));
  }
  function dueLabel(c: KanjiCard): string {
    if (!c.due || c.due <= today) return 'due';
    return c.due.slice(5); // MM-DD
  }

  // ── deck management ─────────────────────────────────────────────
  let newChar = $state('');
  let newMeaning = $state('');
  let newReading = $state('');
  let newNote = $state('');
  let confirmId = $state<string | null>(null);

  function addCard() {
    if (!newChar.trim()) return;
    store.addKanji(newChar, newMeaning, newReading, newNote);
    newChar = newMeaning = newReading = newNote = '';
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="panel kanji-deck">
  <div class="k-tabs">
    <button class:active={mode === 'study'} onclick={() => (mode = 'study')}>STUDY<i>{dueCards.length}</i></button>
    <button class:active={mode === 'deck'} onclick={() => (mode = 'deck')}>DECK<i>{cards.length}</i></button>
  </div>

  {#if mode === 'study'}
    {#if inSession && current}
      <div class="k-progress">
        <span>{reviewed} reviewed</span>
        <span class="muted">{session.length} left</span>
        <button class="k-quit" onclick={quit} title="end session">✕</button>
      </div>

      <button class="k-card" class:flipped onclick={() => (flipped = !flipped)} title="tap or space to flip">
        <span class="k-glyph">{current.char}</span>
        {#if flipped}
          <div class="k-back">
            <div class="k-meaning">{current.meaning || '—'}</div>
            {#if current.reading}<div class="k-reading">{current.reading}</div>{/if}
            {#if current.note}<div class="k-note">{current.note}</div>{/if}
            <div class="k-box muted" title="mastery">{boxPips(current.box)}</div>
          </div>
        {:else}
          <span class="k-hint muted">tap to reveal</span>
        {/if}
      </button>

      {#if flipped}
        <div class="k-grade">
          <button class="grade again" onclick={() => grade(false)}>✗ AGAIN <kbd>1</kbd></button>
          <button class="grade got" onclick={() => grade(true)}>✓ GOT IT <kbd>2</kbd></button>
        </div>
      {:else}
        <div class="k-grade">
          <button class="grade flip" onclick={() => (flipped = true)}>FLIP <kbd>␣</kbd></button>
        </div>
      {/if}
    {:else}
      <div class="k-idle">
        {#if finished}
          <div class="k-done-mark">✓</div>
          <div class="k-idle-head">session cleared</div>
          <p class="muted">{reviewed} review{reviewed === 1 ? '' : 's'} logged. The spacing does the rest.</p>
        {:else if dueCards.length > 0}
          <div class="k-idle-count">{dueCards.length}</div>
          <div class="k-idle-head">due for review</div>
          <button class="k-begin" onclick={() => startSession(false)}>▸ BEGIN REVIEW</button>
        {:else}
          <div class="k-done-mark">✓</div>
          <div class="k-idle-head">all caught up</div>
          <p class="muted">Nothing due right now. Come back later, or drill the whole deck.</p>
        {/if}
        {#if cards.length > 0}
          <button class="k-reviewall" onclick={() => startSession(true)}>drill all {cards.length}</button>
        {:else}
          <p class="muted">Deck is empty — add kanji in the DECK tab.</p>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="k-add">
      <input class="k-add-char" bind:value={newChar} placeholder="漢" maxlength="6" />
      <div class="k-add-fields">
        <input bind:value={newMeaning} placeholder="meaning" />
        <input bind:value={newReading} placeholder="reading (kun・on)" />
        <input bind:value={newNote} placeholder="mnemonic (optional)" />
      </div>
      <button class="btn btn-k" onclick={addCard} disabled={!newChar.trim()}>[+ ADD]</button>
    </div>

    <div class="k-list">
      {#if cards.length === 0}
        <div class="empty muted">- deck is empty · add a kanji above -</div>
      {/if}
      {#each cards as c (c.id)}
        <div class="k-row">
          <span class="k-row-char">{c.char}</span>
          <div class="k-row-body">
            <input class="k-row-meaning" bind:value={c.meaning} oninput={() => store.touchKanji()} placeholder="meaning" />
            <input class="k-row-reading" bind:value={c.reading} oninput={() => store.touchKanji()} placeholder="reading" />
          </div>
          <span class="k-row-meta">
            <span class="k-pips" title="mastery {c.box}/5">{boxPips(c.box)}</span>
            <span class="k-due" class:now={!c.due || c.due <= today}>{dueLabel(c)}</span>
          </span>
          {#if confirmId === c.id}
            <button class="del del-confirm" onclick={() => store.deleteKanji(c.id)} title="confirm">✓</button>
            <button class="del" onclick={() => (confirmId = null)} title="cancel">✕</button>
          {:else}
            <button class="del" onclick={() => (confirmId = c.id)} title="remove">x</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; --k: var(--red); }
  .kanji-deck { padding: 8px; gap: 8px; }

  .k-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; flex-shrink: 0; }
  .k-tabs button {
    height: 26px; border: 1px solid var(--line); color: var(--muted);
    font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  }
  .k-tabs button.active { border-color: var(--k); color: var(--k); background: color-mix(in srgb, var(--k) 13%, transparent); }
  .k-tabs button i { font-style: normal; font-size: 9px; opacity: 0.7; }

  /* ── study: session ── */
  .k-progress { display: flex; align-items: center; gap: 10px; font-size: 10px; color: var(--ink); flex-shrink: 0; }
  .k-progress .muted { margin-left: auto; }
  .k-quit { color: var(--muted); font-size: 11px; padding: 0 2px; }
  .k-quit:hover { color: var(--red); }

  .k-card {
    flex: 1; min-height: 0; width: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
    border: 1px solid color-mix(in srgb, var(--k) 40%, var(--line));
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--k) 10%, transparent), transparent 62%),
      var(--panel);
    padding: 16px; text-align: center; position: relative;
  }
  .k-card:hover { border-color: color-mix(in srgb, var(--k) 60%, var(--line)); }
  .k-glyph {
    font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', 'MS Mincho', serif;
    font-size: 110px; line-height: 1; color: var(--ink);
    text-shadow: 0 0 24px color-mix(in srgb, var(--k) 22%, transparent);
  }
  .k-hint { font-size: 10px; letter-spacing: 0.1em; }
  .k-back { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .k-meaning { font-size: 16px; color: var(--k); font-weight: 700; letter-spacing: 0.02em; }
  .k-reading {
    font-size: 13px; color: var(--ink);
    font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', 'MS Mincho', serif;
  }
  .k-note { font-size: 10px; color: var(--muted); max-width: 260px; line-height: 1.5; }
  .k-box { font-size: 9px; letter-spacing: 2px; margin-top: 2px; }

  .k-grade { display: flex; gap: 6px; flex-shrink: 0; }
  .grade {
    flex: 1; height: 34px; border: 1px solid var(--line); color: var(--ink);
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  }
  .grade kbd {
    font-family: var(--font); font-size: 8px; padding: 1px 4px; color: var(--muted);
    border: 1px solid var(--line); border-radius: 2px;
  }
  .grade.again { border-color: color-mix(in srgb, var(--red) 45%, var(--line)); color: var(--red); }
  .grade.again:hover { background: var(--red); color: var(--void); }
  .grade.got { border-color: color-mix(in srgb, var(--green) 45%, var(--line)); color: var(--green); }
  .grade.got:hover { background: var(--green); color: var(--void); }
  .grade.flip { border-color: color-mix(in srgb, var(--k) 50%, var(--line)); color: var(--k); }
  .grade.flip:hover { background: var(--k); color: var(--void); }

  /* ── study: idle / summary ── */
  .k-idle {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    text-align: center; padding: 16px;
  }
  .k-idle-count { font-size: 48px; line-height: 1; color: var(--k); font-weight: 700; }
  .k-done-mark { font-size: 44px; line-height: 1; color: var(--green); }
  .k-idle-head { font-size: 12px; letter-spacing: 0.14em; color: var(--ink); text-transform: uppercase; }
  .k-idle p { font-size: 10px; max-width: 260px; line-height: 1.6; }
  .k-begin {
    margin-top: 6px; padding: 8px 18px; border: 1px solid var(--k); color: var(--k);
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
  }
  .k-begin:hover { background: var(--k); color: var(--void); }
  .k-reviewall { margin-top: 2px; font-size: 9px; color: var(--muted); letter-spacing: 0.08em; }
  .k-reviewall:hover { color: var(--k); }

  /* ── deck management ── */
  .k-add { display: grid; grid-template-columns: 54px minmax(0, 1fr); grid-template-rows: auto auto; gap: 5px; flex-shrink: 0; }
  .k-add-char {
    grid-row: 1 / 3; height: 100%; text-align: center; font-size: 26px;
    font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', 'MS Mincho', serif;
    color: var(--ink);
  }
  .k-add-char:focus { border-color: var(--k); }
  .k-add-fields { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .k-add-fields input { font-size: 10px; }
  .k-add-fields input:focus { border-color: var(--k); }
  .btn-k { grid-column: 1 / 3; color: var(--k); border-color: color-mix(in srgb, var(--k) 45%, var(--line)); font-weight: 700; letter-spacing: 0.08em; }
  .btn-k:hover:not(:disabled) { background: var(--k); color: var(--void); }

  .k-list { flex: 1; min-height: 0; overflow-y: auto; }
  .k-row {
    display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto; gap: 7px; align-items: center;
    padding: 5px 0; border-bottom: 1px solid var(--line);
  }
  .k-row-char {
    font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', 'MS Mincho', serif;
    font-size: 24px; line-height: 1; color: var(--ink); text-align: center;
  }
  .k-row-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .k-row-meaning { border-color: transparent; background: transparent; padding: 1px 2px; font-size: 11px; color: var(--ink); }
  .k-row-meaning:focus { border-color: var(--k); background: color-mix(in srgb, var(--k) 5%, transparent); }
  .k-row-reading { border-color: transparent; background: transparent; padding: 1px 2px; font-size: 9px; color: var(--muted); }
  .k-row-reading:focus { border-color: var(--k); background: color-mix(in srgb, var(--k) 5%, transparent); }
  .k-row-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .k-pips { font-size: 7px; letter-spacing: 1px; color: var(--k); }
  .k-due { font-size: 8px; color: var(--muted); }
  .k-due.now { color: var(--k); }

  .del { color: var(--line); font-size: 11px; padding: 0 3px; }
  .del:hover { color: var(--red); }
  .del-confirm { color: var(--red); }
  .empty { padding: 16px; text-align: center; font-size: 11px; }
</style>
