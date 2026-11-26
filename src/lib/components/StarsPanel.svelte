<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { runDailyZodiac, zodiacAsk, starSigns } from '$lib/agent';
  import { localDay } from '$lib/day';

  let dobDraft = $state(store.data.stars.birthDate || '');
  let refreshing = $state(false);
  let question = $state('');
  let answer = $state('');
  let asking = $state(false);

  const signs = $derived(starSigns(store.data.stars.birthDate));
  const read = $derived(store.data.stars.read);
  const todayKey = localDay();
  const isToday = $derived(read?.date === todayKey);

  const lines = $derived(
    (read?.body || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (/^do\s*:/i.test(l)) return { kind: 'do', text: l.replace(/^do\s*:/i, '').trim() };
        if (/^don.?t\s*:/i.test(l)) return { kind: 'dont', text: l.replace(/^don.?t\s*:/i, '').trim() };
        return { kind: 'read', text: l.replace(/^read\s*:/i, '').trim() };
      })
  );

  async function saveDob() {
    const d = dobDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    store.setBirthDate(d);
    await refresh();
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await runDailyZodiac(true);
    } finally {
      refreshing = false;
    }
  }
  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    asking = true;
    answer = '';
    try {
      answer = (await zodiacAsk(q)).trim() || '⚠ no reply — switch BACKEND to Claude in AGENT [CFG].';
    } catch (e) {
      answer = '⚠ ' + (e instanceof Error ? e.message : String(e));
    } finally {
      asking = false;
    }
  }
  function askKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      ask();
    }
  }
</script>

<div class="panel stars-deck">
  <header class="st-head">
    <div>
      <span class="eyebrow">DAILY READ</span>
      <h2>STARS</h2>
    </div>
    {#if signs}
      <div class="st-signs">
        <span class="west">{read?.western ?? `${signs.westernSym} ${signs.western}`}</span>
        <span class="chin muted">{signs.chinese}</span>
      </div>
    {/if}
  </header>

  {#if !store.data.stars.birthDate}
    <div class="st-setup">
      <p class="muted">set your birth date — fr13nd reads your stars every morning at 9.</p>
      <div class="dob-row">
        <input type="date" bind:value={dobDraft} />
        <button class="btn btn-gold" onclick={saveDob}>[SET]</button>
      </div>
      <p class="hint muted">Western sign from month/day · Chinese animal from year. Born in Jan / early Feb? the Chinese animal can fall in the prior year — just tell fr13nd in the ask box and he'll adjust.</p>
    </div>
  {:else}
    <div class="st-readhead">
      <span class="muted">{isToday ? `TODAY · ${todayKey}` : read ? `LAST · ${read.date}` : 'no read yet'}</span>
      <button class="head-btn" onclick={refresh} disabled={refreshing}>{refreshing ? '✦…' : '↻ refresh'}</button>
    </div>

    <div class="st-read">
      {#if !read}
        <div class="empty muted">- fr13nd reads your stars at 9am · hit refresh to pull one now -</div>
      {:else}
        {#each lines as l, i (i)}
          <div class="rl rl-{l.kind}">
            {#if l.kind !== 'read'}<span class="rl-tag">{l.kind === 'do' ? 'DO' : "DON'T"}</span>{/if}
            <span class="rl-text">{l.text}</span>
          </div>
        {/each}
      {/if}
    </div>

    <div class="st-ask">
      <div class="ask-row">
        <input bind:value={question} onkeydown={askKey} placeholder="ask fr13nd about today's stars…" />
        <button class="btn ask-btn" onclick={ask} disabled={asking || !question.trim()}>{asking ? '✦…' : '✦ ASK'}</button>
      </div>
      {#if answer}
        <div class="ask-out"><span class="sigil">✦</span><pre>{answer}</pre></div>
      {/if}
    </div>

    <button class="st-change muted" onclick={() => store.setBirthDate('')} title="change birth date">born {store.data.stars.birthDate} · change</button>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  .stars-deck {
    padding: 10px;
    gap: 8px;
    background: radial-gradient(100% 55% at 50% 0%, color-mix(in srgb, var(--violet) 16%, transparent), transparent 74%);
  }
  .st-head { display: flex; align-items: end; justify-content: space-between; padding: 2px 1px 0; }
  .eyebrow { display: block; color: var(--muted); font-size: 8px; letter-spacing: 0.12em; margin-bottom: 2px; }
  h2 { color: var(--gold); font-size: 17px; line-height: 1; letter-spacing: 0.12em; }
  .st-signs { display: grid; justify-items: end; gap: 1px; }
  .west { color: var(--gold); font-size: 13px; font-weight: 700; }
  .chin { font-size: 9px; letter-spacing: 0.06em; }

  .st-setup { display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid color-mix(in srgb, var(--violet) 30%, var(--line)); }
  .st-setup p { font-size: 10px; line-height: 1.45; }
  .dob-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
  .dob-row input { color: var(--ink); }
  .hint { font-size: 8px; letter-spacing: 0.03em; opacity: 0.8; }

  .st-readhead { display: flex; align-items: center; justify-content: space-between; padding: 2px 1px; font-size: 9px; letter-spacing: 0.08em; }
  .head-btn { color: var(--gold); font-size: 9px; }

  .st-read { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 2px 1px; }
  .rl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 7px; font-size: 11px; line-height: 1.5; }
  .rl-read { grid-template-columns: 1fr; color: var(--ink); padding-bottom: 2px; }
  .rl-tag { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; padding-top: 2px; }
  .rl-do .rl-tag { color: var(--green); }
  .rl-do .rl-text { color: color-mix(in srgb, var(--green) 70%, var(--ink)); }
  .rl-dont .rl-tag { color: var(--red); }
  .rl-dont .rl-text { color: color-mix(in srgb, var(--red) 65%, var(--ink)); }

  .st-ask { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; border-top: 1px solid var(--line); padding-top: 7px; }
  .ask-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
  .ask-btn { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 45%, var(--line)); white-space: nowrap; }
  .ask-btn:hover:not(:disabled) { background: var(--gold); color: var(--void); }
  .ask-out { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; background: color-mix(in srgb, var(--gold) 8%, transparent); padding: 7px 8px; }
  .ask-out .sigil { color: var(--gold); }
  .ask-out pre { margin: 0; white-space: pre-wrap; color: var(--ink); font-size: 11px; line-height: 1.5; }

  .st-change { font-size: 8px; letter-spacing: 0.06em; text-align: left; padding: 2px 1px; flex-shrink: 0; }
  .st-change:hover { color: var(--gold); }
  .empty { padding: 16px; text-align: center; font-size: 11px; }
</style>
