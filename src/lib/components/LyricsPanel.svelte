<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { lyricCowrite, rhymeHelp } from '$lib/agent';
  import type { LyricEntry, LyricKind } from '$lib/types';

  let mode = $state<LyricKind>('song');
  let openId = $state<string | null>(null);
  let confirmId = $state<string | null>(null);
  let fragDraft = $state('');

  // per-entry co-writer state
  let askText = $state<Record<string, string>>({});
  let feedback = $state<Record<string, string>>({});
  let asking = $state<Record<string, boolean>>({});

  // rhyme bar
  let rhymeWord = $state('');
  let rhymeOut = $state('');
  let rhyming = $state(false);

  const entries = $derived(store.data.lyrics.entries);
  const counts = $derived({
    song: entries.filter((e) => e.kind === 'song').length,
    fragment: entries.filter((e) => e.kind === 'fragment').length,
    saved: entries.filter((e) => e.kind === 'saved').length,
  });
  // newest first, without mutating the stored array
  const list = $derived(entries.filter((e) => e.kind === mode).slice().reverse());

  const emptyMsg = $derived(
    mode === 'song' ? 'no songs yet — start one' : mode === 'fragment' ? 'no fragments caught yet' : 'no saved lyrics yet'
  );

  function add() {
    const id = store.addLyric(mode);
    openId = id;
    confirmId = null;
  }

  function addFragment() {
    const t = fragDraft.trim();
    if (!t) return;
    const id = store.addLyric('fragment');
    const e = store.data.lyrics.entries.find((x) => x.id === id);
    if (e) {
      e.body = t;
      store.touchLyric(id);
    }
    fragDraft = '';
  }

  function fragKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addFragment();
    }
  }

  function promote(id: string) {
    store.promoteFragment(id);
    mode = 'song';
    openId = id;
  }

  function del(id: string) {
    store.deleteLyric(id);
    confirmId = null;
    if (openId === id) openId = null;
  }

  async function ask(e: LyricEntry) {
    if (asking[e.id]) return;
    asking = { ...asking, [e.id]: true };
    try {
      const out = await lyricCowrite({ title: e.title, body: e.body, kind: e.kind, ask: askText[e.id] ?? '' });
      feedback = { ...feedback, [e.id]: out.trim() || '⚠ no reply — switch BACKEND to Claude in [CFG] so fr13nd can read this.' };
    } catch (err) {
      feedback = { ...feedback, [e.id]: `⚠ ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      asking = { ...asking, [e.id]: false };
    }
  }

  // hand a lyric off to the main AGENT conversation (joins the thread + fr13nd's memory)
  function sendToAgent(e: LyricEntry) {
    const head =
      e.kind === 'saved'
        ? `Lyrics I love${e.artist ? ` — ${e.artist}` : ''}${e.title ? `, "${e.title}"` : ''}. Break down why they land:`
        : `My lyrics in progress${e.title ? ` — "${e.title}"` : ''}. Co-write with me — what works, what to push, give me lines:`;
    store.askAgent(`${head}\n\n${e.body || '(empty)'}`);
  }

  async function doRhyme() {
    const w = rhymeWord.trim();
    if (!w || rhyming) return;
    rhyming = true;
    try {
      const out = await rhymeHelp(w);
      rhymeOut = out.trim() || '⚠ no reply — switch BACKEND to Claude in [CFG].';
    } catch (err) {
      rhymeOut = `⚠ ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      rhyming = false;
    }
  }

  function rhymeKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      doRhyme();
    }
  }
</script>

<div class="panel">
  <div class="ly-tabs">
    <button class:active={mode === 'song'} onclick={() => (mode = 'song')}>DRAFTS<i>{counts.song}</i></button>
    <button class:active={mode === 'fragment'} onclick={() => (mode = 'fragment')}>FRAGMENTS<i>{counts.fragment}</i></button>
    <button class:active={mode === 'saved'} onclick={() => (mode = 'saved')}>SAVED<i>{counts.saved}</i></button>
  </div>

  <!-- rhyme / wordplay — always on hand -->
  <div class="rhyme-bar">
    <input bind:value={rhymeWord} onkeydown={rhymeKey} placeholder="rhyme a word…" />
    <button class="btn" onclick={doRhyme} disabled={rhyming || !rhymeWord.trim()}>{rhyming ? '✦…' : '✦ RHYMES'}</button>
  </div>
  {#if rhymeOut}
    <div class="rhyme-out">
      <button class="rhyme-x" onclick={() => (rhymeOut = '')} title="dismiss" aria-label="dismiss">✕</button>
      <pre>{rhymeOut}</pre>
    </div>
  {/if}

  {#if mode === 'fragment'}
    <div class="frag-add">
      <input bind:value={fragDraft} onkeydown={fragKey} placeholder="catch a line before it's gone…" />
      <button class="btn btn-gold" onclick={addFragment} disabled={!fragDraft.trim()}>[+]</button>
    </div>
  {:else}
    <button class="btn btn-gold add-row" onclick={add}>[+ NEW {mode === 'saved' ? 'SAVED LYRIC' : 'SONG'}]</button>
  {/if}

  <div class="ly-list">
    {#if list.length === 0}
      <div class="empty muted">- {emptyMsg} -</div>
    {/if}

    {#if mode === 'fragment'}
      {#each list as e (e.id)}
        <div class="frag">
          <textarea class="frag-text" bind:value={e.body} oninput={() => store.touchLyric(e.id)} rows="2" placeholder="(empty)"></textarea>
          <div class="frag-btns">
            <button class="btn promote" title="grow this into a song" onclick={() => promote(e.id)}>→ SONG</button>
            {#if confirmId === e.id}
              <button class="btn del-confirm" onclick={() => del(e.id)} title="confirm delete">✓</button>
              <button class="btn" onclick={() => (confirmId = null)} title="cancel">✕</button>
            {:else}
              <button class="btn del" onclick={() => (confirmId = e.id)}>DEL</button>
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      {#each list as e (e.id)}
        <div class="ly-card" class:open={openId === e.id}>
          <button class="ly-row" onclick={() => (openId = openId === e.id ? null : e.id)}>
            <span class="ly-title">{e.title || '(untitled)'}</span>
            {#if e.kind === 'saved' && e.artist}<span class="ly-artist">— {e.artist}</span>{/if}
            <span class="ly-when muted">{e.updatedAt.slice(5, 10)}</span>
          </button>

          {#if openId === e.id}
            <div class="ly-edit">
              <input class="ly-title-in" bind:value={e.title} oninput={() => store.touchLyric(e.id)} placeholder="title" />
              {#if e.kind === 'saved'}
                <input bind:value={e.artist} oninput={() => store.touchLyric(e.id)} placeholder="artist / song" />
              {/if}
              <textarea
                class="ly-body"
                bind:value={e.body}
                oninput={() => store.touchLyric(e.id)}
                rows="11"
                placeholder={e.kind === 'saved' ? 'paste the lyrics you love…' : 'verse, chorus, bridge…  (blank lines or [Chorus] to mark sections)'}
              ></textarea>
              <input class="ly-tags" bind:value={e.tags} oninput={() => store.touchLyric(e.id)} placeholder="tags · bpm · key · mood" />

              <div class="cowrite">
                <div class="cw-row">
                  <input bind:value={askText[e.id]} placeholder="ask fr13nd about this line / verse… (optional)" />
                  <button class="btn cw-btn" onclick={() => ask(e)} disabled={asking[e.id]}>{asking[e.id] ? '✦…' : '✦ ASK fr13nd'}</button>
                </div>
                {#if feedback[e.id]}
                  <div class="cw-out">
                    <span class="cw-sigil">✦</span>
                    <pre>{feedback[e.id]}</pre>
                    <button class="cw-x" onclick={() => (feedback = { ...feedback, [e.id]: '' })} title="dismiss" aria-label="dismiss">✕</button>
                  </div>
                {/if}
              </div>

              <div class="ly-actions">
                <button class="btn to-chat" onclick={() => sendToAgent(e)} title="send this into the AGENT conversation + fr13nd's memory">[↗ TO AGENT CHAT]</button>
                <span class="ly-spacer"></span>
                {#if confirmId === e.id}
                  <span class="muted del-q">delete this for good?</span>
                  <button class="btn del-confirm" onclick={() => del(e.id)}>[CONFIRM DELETE]</button>
                  <button class="btn" onclick={() => (confirmId = null)}>cancel</button>
                {:else}
                  <button class="btn del" onclick={() => (confirmId = e.id)}>[DELETE]</button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .ly-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .ly-tabs button {
    height: 26px;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .ly-tabs button.active {
    border-color: var(--gold);
    color: var(--gold);
    background: color-mix(in srgb, var(--gold) 12%, transparent);
  }
  .ly-tabs button i { font-style: normal; font-size: 9px; opacity: 0.7; }

  .rhyme-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;
    padding: 0 8px 6px;
    flex-shrink: 0;
  }
  .rhyme-bar .btn { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 45%, var(--line)); white-space: nowrap; }
  .rhyme-out {
    position: relative;
    margin: 0 8px 6px;
    border: 1px solid color-mix(in srgb, var(--gold) 35%, var(--line));
    background: color-mix(in srgb, var(--gold) 7%, transparent);
    flex-shrink: 0;
  }
  .rhyme-out pre { margin: 0; padding: 7px 22px 7px 9px; white-space: pre-wrap; color: var(--ink); font-size: 11px; line-height: 1.5; }
  .rhyme-x, .cw-x {
    position: absolute; top: 2px; right: 2px;
    width: 16px; height: 16px; padding: 0; border: none; cursor: pointer;
    background: none; color: var(--muted); font-size: 10px;
  }
  .rhyme-x:hover, .cw-x:hover { color: var(--red); }

  .add-row { margin: 0 8px 6px; flex-shrink: 0; }
  .frag-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;
    padding: 0 8px 6px;
    flex-shrink: 0;
  }

  .ly-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 10px; }

  /* fragments */
  .frag {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: start;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .frag-text { resize: none; width: 100%; }
  .frag-btns { display: flex; flex-direction: column; gap: 4px; }
  .frag-btns .btn { font-size: 9px; }
  .promote { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 40%, var(--line)); }

  /* songs / saved */
  .ly-card { border-bottom: 1px solid var(--line); }
  .ly-card.open { border-bottom-color: var(--gold); }
  .ly-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 6px;
    width: 100%;
    padding: 8px 2px;
    text-align: left;
    color: var(--ink);
    font-size: 12px;
  }
  .ly-card.open .ly-row { color: var(--gold); }
  .ly-row:hover { background: color-mix(in srgb, var(--gold) 7%, transparent); }
  .ly-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .ly-artist { color: var(--muted); font-size: 10px; font-style: italic; }
  .ly-when { font-size: 9px; }

  .ly-edit { display: flex; flex-direction: column; gap: 6px; padding: 2px 0 12px; }
  .ly-title-in { font-weight: 700; }
  .ly-body { resize: vertical; min-height: 150px; line-height: 1.55; }

  .cowrite {
    border: 1px solid color-mix(in srgb, var(--gold) 26%, var(--line));
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cw-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px; }
  .cw-btn { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); white-space: nowrap; }
  .cw-btn:hover:not(:disabled) { background: var(--gold); color: var(--void); }
  .cw-out {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px;
    background: color-mix(in srgb, var(--gold) 8%, transparent);
    padding: 7px 20px 7px 8px;
  }
  .cw-sigil { color: var(--gold); }
  .cw-out pre { margin: 0; white-space: pre-wrap; color: var(--ink); font-size: 11px; line-height: 1.55; }

  .ly-actions { display: flex; align-items: center; gap: 8px; }
  .ly-spacer { flex: 1; }
  .to-chat { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 45%, var(--line)); }
  .to-chat:hover { background: var(--gold); color: var(--void); }
  .del { color: var(--muted); }
  .del:hover { color: var(--red); border-color: var(--red); }
  .del-confirm { color: var(--red); border-color: var(--red); }
  .del-q { font-size: 10px; }

  .empty { padding: 18px; text-align: center; font-size: 11px; }
</style>
