<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '$lib/store.svelte';
  import type { MentalSignalDay, SignalMetricId } from '$lib/types';
  import { localDay } from '$lib/day';

  const METRICS: { id: SignalMetricId; label: string; short: string }[] = [
    { id: 'intrusiveThoughts', label: 'INTRUSIVE THOUGHTS', short: 'INTR' },
    { id: 'executiveDysfunction', label: 'EXECUTIVE DYSFUNCTION', short: 'EXEC' },
    { id: 'obsessiveThoughts', label: 'OBSESSIVE THOUGHTS', short: 'OBSV' },
    { id: 'dissociation', label: 'DISSOCIATION', short: 'DISS' },
    { id: 'depression', label: 'DEPRESSION', short: 'DEPR' },
  ];

  let saved = $state(false);
  let stateSaved = $state(false);
  let archiveOpen = $state(false);
  let archiveExpanded = $state(false);
  let selectedEntryKey = $state<string | null>(null);

  // THE VOID — diary mode
  let mode = $state<'rite' | 'void'>('rite');
  let voidDraft = $state('');
  let releasing = $state(false);
  let releaseChars = $state<{ i: number; ch: string; dx: number; dy: number; r: number; delay: number }[]>([]);
  let openVoidId = $state<string | null>(null);
  const voidLog = $derived([...(store.data.signal.voidLog ?? [])].reverse());
  function sendToVoid() {
    const t = voidDraft.trim();
    if (!t || releasing) return;
    releaseChars = t.split('').map((ch, i) => ({
      i, ch,
      dx: Math.round((Math.random() - 0.5) * 300),
      dy: Math.round(-50 - Math.random() * 230),
      r: Math.round((Math.random() - 0.5) * 240),
      delay: Math.round(Math.random() * 480),
    }));
    releasing = true;
    store.sendToVoid(t);
    voidDraft = '';
    setTimeout(() => { releasing = false; releaseChars = []; }, 2100);
  }

  const todayKey = localDay();
  const today = $derived(store.data.signal.today);
  const archive = $derived([...store.data.signal.log].reverse());
  const todayCount = $derived(store.data.signal.log.filter((e) => e.date === todayKey).length);
  const visibleArchive = $derived(archiveExpanded ? archive : archive.slice(0, 10));
  const selectedEntry = $derived.by(() =>
    selectedEntryKey ? archive.find((entry) => entryKey(entry) === selectedEntryKey) ?? null : null
  );
  const total = $derived(METRICS.reduce((sum, metric) => sum + Number(today[metric.id] ?? 0), 0));
  const intensity = $derived(Math.round(total / METRICS.length));

  function flashSaved() {
    saved = true;
    setTimeout(() => saved = false, 900);
  }

  function flashStateSaved() {
    stateSaved = true;
    setTimeout(() => stateSaved = false, 700);
  }

  function saveState() {
    store.data.ritual.lastCheckIn = store.nowString();
    store.save();
    flashStateSaved();
  }

  function setEnergy(value: number) {
    store.data.ritual.energy = value;
    saveState();
  }

  function setMetric(id: SignalMetricId, value: number) {
    store.data.signal.today[id] = value;
    store.save();
  }

  function checkIn() {
    store.sealSignal();
    flashSaved();
  }

  function clearToday() {
    for (const metric of METRICS) setMetric(metric.id, 0);
    today.note = '';
    today.sigil = '';
    today.checkedIn = false;
    today.at = '';
    store.data.signal.updated = store.nowString();
    store.save();
  }

  function entryKey(entry: MentalSignalDay): string {
    return entry.at || entry.date;
  }

  function historyId(entry: MentalSignalDay): string {
    return `signal-history-${entryKey(entry).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  function entryScore(entry: MentalSignalDay): number {
    return METRICS.reduce((sum, metric) => sum + Number(entry[metric.id] ?? 0), 0);
  }

  function setArchiveOpen(open: boolean) {
    archiveOpen = open;
    if (!open) selectedEntryKey = null;
  }

  async function toggleArchiveEntry(entry: MentalSignalDay) {
    if (!archiveOpen) setArchiveOpen(true);
    const key = entryKey(entry);
    selectedEntryKey = selectedEntryKey === key ? null : key;
    if (selectedEntryKey) {
      await tick();
      document.getElementById(historyId(entry))?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
</script>

<div class="panel">
  <div class="mode-toggle">
    <button class:active={mode === 'rite'} onclick={() => mode = 'rite'}>SIGNAL RITE</button>
    <button class:active={mode === 'void'} onclick={() => mode = 'void'}>THE VOID</button>
  </div>

  {#if mode === 'rite'}
  <div class="status-bar">
    <span class="sig">SIGNAL RITE</span>
    <span><span class="muted">date</span> <span class="gold">{today.date || todayKey}</span></span>
    <span><span class="muted">static</span> <span class="teal">{total}/25</span></span>
    <span class="seal sealed">{todayCount} logged today</span>
  </div>

  <hr class="divider" />

  <div class="state-grid">
    <label class="state-field">
      <span>MOOD</span>
      <input bind:value={store.data.ritual.mood} oninput={saveState} placeholder="dislocated, calm, wired..." />
    </label>
    <label class="state-field">
      <span>FOCUS</span>
      <input bind:value={store.data.ritual.focus} oninput={saveState} placeholder="not eating, coding, sleep..." />
    </label>
    <div class="energy-row">
      <span>ENERGY</span>
      <div class="energy-picks">
        {#each [1, 2, 3, 4, 5] as value}
          <button class:active={store.data.ritual.energy >= value} onclick={() => setEnergy(value)}>{value}</button>
        {/each}
      </div>
      <b>{stateSaved ? 'SAVED' : store.data.ritual.energy}</b>
    </div>
  </div>

  <hr class="divider" />

  <div class="oracle">
    <div class="sigil-row">
      <span class="glyph">[::]</span>
      <input
        bind:value={today.sigil}
        oninput={() => store.save()}
        placeholder="sigil / phrase / omen"
      />
      <span class="pulse" class:lit={intensity >= 3}>{intensity}</span>
    </div>

    <div class="metric-grid">
      {#each METRICS as metric}
        <div class="metric">
          <div class="metric-head">
            <span class="metric-short">{metric.short}</span>
            <span class="metric-label">{metric.label}</span>
            <span class="metric-value">{today[metric.id]}</span>
          </div>
          <div class="scale">
            {#each [0, 1, 2, 3, 4, 5] as value}
              <button
                class="mark"
                class:active={today[metric.id] >= value && value > 0}
                class:zero={value === 0}
                onclick={() => setMetric(metric.id, value)}
                title={`${metric.label} ${value}`}
              >{value === 0 ? '0' : '|'}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <textarea
      bind:value={today.note}
      oninput={() => store.save()}
      rows="4"
      placeholder="what shape did the static take?"
    ></textarea>

    <div class="actions">
      <button class="btn btn-gold" class:flash={saved} onclick={checkIn}>
        {saved ? '[LOGGED]' : '[LOG SIGNAL]'}
      </button>
      <button class="btn" onclick={clearToday}>[CLEAR]</button>
    </div>
  </div>

  <div class="archive-drawer" class:open={archiveOpen}>
    <button class="archive-trigger" onclick={() => setArchiveOpen(!archiveOpen)} aria-expanded={archiveOpen}>
      <span class="archive-glyph">{archiveOpen ? 'v' : '^'}</span>
      <span>SIGNAL ARCHIVE</span>
      <span class="archive-count">{archive.length} RECORD{archive.length === 1 ? '' : 'S'}</span>
      <span class="archive-action">{archiveOpen ? '[CLOSE]' : '[OPEN]'}</span>
    </button>

    {#if archiveOpen}
      <div class="archive-body">
        <div class="log-header">
          <span class="muted">PREVIOUS SIGNALS / SELECT A RECORD TO REOPEN IT</span>
          {#if archive.length > 10}
            <button class="archive-toggle" onclick={() => archiveExpanded = !archiveExpanded}>
              {archiveExpanded ? '[RECENT]' : `[ALL ${archive.length}]`}
            </button>
          {/if}
        </div>
        <div class="log">
          {#if today.checkedIn}
            <div class="log-row today-row">
              <span class="date">{today.date}</span>
              <span class="log-sigil">{today.sigil || 'no sigil'}</span>
              <span class="score">{total}/25</span>
            </div>
          {/if}

          {#each visibleArchive as entry}
            <button
              class="log-row archive-row"
              class:selected={selectedEntryKey === entryKey(entry)}
              onclick={() => toggleArchiveEntry(entry)}
              aria-expanded={selectedEntryKey === entryKey(entry)}
              title="open this signal record"
            >
              <span class="date">{entry.date.slice(5)} {entry.at ? entry.at.slice(11, 16) : ''}</span>
              <span class="log-sigil">{entry.sigil || entry.note || 'sealed'}</span>
              <span class="score">{entryScore(entry)}/25</span>
            </button>

            {#if selectedEntry && selectedEntryKey === entryKey(entry)}
              <section id={historyId(entry)} class="history-detail" aria-label={`signal record from ${selectedEntry.date}`}>
                <div class="history-detail-head">
                  <span>REOPENED / {selectedEntry.date}</span>
                  <button onclick={() => selectedEntryKey = null}>[CLOSE]</button>
                </div>
                <div class="history-metrics">
                  {#each METRICS as metric}
                    <div class="history-metric" title={metric.label}>
                      <span>{metric.short}</span>
                      <b>{selectedEntry[metric.id]}/5</b>
                    </div>
                  {/each}
                </div>
                {#if selectedEntry.sigil || selectedEntry.note}
                  <div class="history-note">
                    <span>{selectedEntry.sigil || 'NO SIGIL'}</span>
                    {#if selectedEntry.note}<p>{selectedEntry.note}</p>{/if}
                  </div>
                {:else}
                  <div class="history-note muted">No extra note attached to this check-in.</div>
                {/if}
              </section>
            {/if}
          {/each}

          {#if visibleArchive.length === 0 && !today.checkedIn}
            <div class="empty muted">- no signal sealed -</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  {:else}
    <div class="void-mode">
      <div class="void-writer">
        <textarea
          bind:value={voidDraft}
          rows="7"
          placeholder="say it. all of it. no one is reading this. it goes into the void."
          disabled={releasing}
        ></textarea>
        <button class="void-send" onclick={sendToVoid} disabled={releasing || !voidDraft.trim()}>
          {releasing ? '. . . r e l e a s i n g . . .' : '[ SEND IT TO THE VOID ]'}
        </button>
        {#if releasing}
          <div class="void-scatter" aria-hidden="true">
            {#each releaseChars as c (c.i)}<span class="vc" style="--dx:{c.dx}px; --dy:{c.dy}px; --r:{c.r}deg; --d:{c.delay}ms">{c.ch === ' ' ? ' ' : c.ch}</span>{/each}
          </div>
        {/if}
      </div>
      <div class="void-log-head"><span class="muted">THE VOID REMEMBERS · {voidLog.length}</span></div>
      <div class="void-log">
        {#if voidLog.length === 0}
          <div class="empty muted">- nothing released yet -</div>
        {/if}
        {#each voidLog as v (v.id)}
          <button
            class="void-row" class:open={openVoidId === v.id}
            onclick={() => (openVoidId = openVoidId === v.id ? null : v.id)}
          >
            <span class="void-date">{v.at.slice(5, 16).replace('T', ' ')}</span>
            <span class="void-snip">{v.text.replace(/\s+/g, ' ').slice(0, 72)}</span>
          </button>
          {#if openVoidId === v.id}<div class="void-full"><p>{v.text}</p></div>{/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    font-size: 10px;
    flex-shrink: 0;
  }

  .sig {
    color: var(--teal);
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .seal {
    margin-left: auto;
    color: var(--muted);
    letter-spacing: 0.1em;
  }

  .seal.sealed {
    color: var(--teal);
  }

  .state-grid {
    padding: 7px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    background: linear-gradient(110deg, color-mix(in srgb, var(--teal) 11%, transparent), transparent 68%);
  }

  .state-field,
  .energy-row {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
  }

  .state-field span,
  .energy-row > span {
    color: var(--muted);
    font-size: 9px;
    letter-spacing: 0.1em;
  }

  .energy-row {
    grid-template-columns: 52px minmax(0, 1fr) 42px;
  }

  .energy-picks {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
  }

  .energy-picks button {
    height: 21px;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 9px;
  }

  .energy-picks button.active {
    border-color: var(--teal);
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }

  .energy-row b {
    color: var(--gold);
    font-size: 9px;
    text-align: right;
  }

  .oracle {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .sigil-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 28px;
    align-items: center;
    gap: 6px;
  }

  .glyph {
    color: var(--gold);
    font-size: 11px;
    letter-spacing: 0.08em;
  }

  .pulse {
    display: grid;
    place-items: center;
    height: 24px;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 11px;
  }

  .pulse.lit {
    border-color: var(--teal);
    color: var(--teal);
    box-shadow: inset 0 0 12px color-mix(in srgb, var(--teal) 18%, transparent);
  }

  .metric-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .metric {
    border: 1px solid color-mix(in srgb, var(--teal) 22%, var(--line));
    background: linear-gradient(120deg, color-mix(in srgb, var(--teal) 9%, transparent), transparent 72%);
  }

  .metric-head {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 22px;
    gap: 6px;
    align-items: center;
    padding: 4px 6px 2px;
  }

  .metric-short {
    color: var(--gold);
    font-size: 9px;
    font-weight: 700;
  }

  .metric-label {
    color: var(--ink);
    font-size: 9px;
    letter-spacing: 0.08em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .metric-value {
    color: var(--teal);
    font-size: 11px;
    text-align: right;
  }

  .scale {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    border-top: 1px solid var(--line);
  }

  .mark {
    height: 20px;
    border-right: 1px solid var(--line);
    color: var(--line);
    font-size: 11px;
  }

  .mark:last-child {
    border-right: none;
  }

  .mark.zero {
    color: var(--muted);
  }

  .mark.active {
    color: var(--gold);
    background: color-mix(in srgb, var(--teal) 14%, transparent);
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .flash {
    background: var(--gold);
    color: var(--void);
  }

  .archive-drawer {
    margin-top: 0;
    flex-shrink: 0;
    border-top: 1px solid color-mix(in srgb, var(--teal) 34%, var(--line));
    background: linear-gradient(90deg, color-mix(in srgb, var(--teal) 8%, var(--void)), var(--void) 64%);
  }

  .archive-trigger {
    display: grid;
    grid-template-columns: 16px auto 1fr auto;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 29px;
    padding: 5px 8px;
    color: var(--teal);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-align: left;
  }

  .archive-trigger:hover { background: color-mix(in srgb, var(--teal) 10%, transparent); }
  .archive-glyph { color: var(--gold); font-size: 12px; text-align: center; }
  .archive-action { color: var(--gold); font-size: 8px; }

  .archive-body {
    display: flex;
    flex-direction: column;
    height: 250px;
    border-top: 1px solid color-mix(in srgb, var(--teal) 22%, var(--line));
    background: linear-gradient(180deg, color-mix(in srgb, var(--teal) 6%, transparent), var(--void) 48%);
  }

  .log-header {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 9px;
    letter-spacing: 0.1em;
    padding: 4px 8px;
    flex-shrink: 0;
  }

  .archive-count { color: var(--gold); font-size: 8px; margin-left: auto; }
  .archive-toggle { border: 1px solid var(--line); color: var(--teal); padding: 2px 4px; font-size: 8px; }
  .archive-toggle:hover { border-color: var(--teal); background: color-mix(in srgb, var(--teal) 10%, transparent); }

  .log {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scroll-behavior: smooth;
  }

  .log-row {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) 42px;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
    width: 100%;
    color: var(--ink);
    font-size: 10px;
    line-height: var(--lh);
    text-align: left;
  }

  .today-row {
    background: color-mix(in srgb, var(--teal) 10%, transparent);
  }

  .archive-row { transition: background 0.12s, border-color 0.12s; }
  .archive-row:hover { background: color-mix(in srgb, var(--teal) 7%, transparent); }
  .archive-row.selected { color: var(--teal); background: color-mix(in srgb, var(--teal) 12%, transparent); border-bottom-color: var(--teal); }

  .date {
    color: var(--muted);
  }

  .log-sigil {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .score {
    color: var(--gold);
    text-align: right;
  }

  .history-detail {
    margin: 6px 8px 10px;
    border: 1px solid color-mix(in srgb, var(--teal) 45%, var(--line));
    background: linear-gradient(135deg, color-mix(in srgb, var(--teal) 9%, transparent), transparent 58%);
  }

  .history-detail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--teal) 28%, var(--line));
    color: var(--teal);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.09em;
  }

  .history-detail-head button { color: var(--muted); font-size: 8px; }
  .history-detail-head button:hover { color: var(--teal); }

  .history-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; padding: 6px; }
  .history-metric { min-width: 0; display: grid; gap: 2px; padding: 4px 2px; border: 1px solid color-mix(in srgb, var(--teal) 20%, var(--line)); text-align: center; }
  .history-metric span { color: var(--muted); font-size: 7px; letter-spacing: 0.04em; }
  .history-metric b { color: var(--gold); font-size: 10px; }

  .history-note { padding: 0 7px 7px; color: var(--ink); font-size: 10px; line-height: 1.45; }
  .history-note > span { display: block; color: var(--gold); font-size: 9px; letter-spacing: 0.08em; margin-bottom: 3px; }
  .history-note p { color: var(--muted); white-space: pre-wrap; }

  .empty {
    padding: 16px;
    text-align: center;
    font-size: 11px;
  }

  /* THE VOID — diary / catharsis */
  .mode-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .mode-toggle button {
    height: 26px;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.13em;
  }
  .mode-toggle button.active {
    border-color: var(--teal);
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }

  .void-mode {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .void-writer {
    position: relative;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }
  .void-writer textarea {
    width: 100%;
    resize: none;
    min-height: 132px;
    background: color-mix(in srgb, var(--teal) 4%, var(--void, #050505));
  }
  .void-send {
    width: 100%;
    height: 30px;
    border: 1px solid var(--teal);
    color: var(--teal);
    letter-spacing: 0.16em;
    font-weight: 700;
    font-size: 11px;
  }
  .void-send:hover:not(:disabled) { background: var(--teal); color: var(--void, #050505); }
  .void-send:disabled { opacity: 0.45; cursor: default; }
  .void-scatter {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 14px;
    pointer-events: none;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--teal);
    font-size: 13px;
    line-height: 1.5;
    padding: 6px;
    z-index: 5;
  }
  .vc {
    display: inline-block;
    white-space: pre;
    animation: scatter 1.5s cubic-bezier(0.35, 0, 0.6, 1) forwards;
    animation-delay: var(--d);
    will-change: transform, opacity;
  }
  @keyframes scatter {
    0% { transform: translate(0, 0) rotate(0); opacity: 1; filter: blur(0); }
    100% { transform: translate(var(--dx), var(--dy)) rotate(var(--r)); opacity: 0; filter: blur(4px); }
  }

  .void-log-head {
    padding: 7px 8px 3px;
    font-size: 9px;
    letter-spacing: 0.1em;
    flex-shrink: 0;
    border-top: 1px solid color-mix(in srgb, var(--teal) 22%, var(--line));
  }
  .void-log { flex: 1; min-height: 0; overflow-y: auto; }
  .void-row {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    width: 100%;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    font-size: 10px;
    color: var(--ink);
  }
  .void-row:hover { background: color-mix(in srgb, var(--teal) 7%, transparent); }
  .void-row.open { color: var(--teal); border-bottom-color: var(--teal); }
  .void-date { color: var(--muted); font-size: 9px; }
  .void-snip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .void-full { padding: 6px 10px 12px; }
  .void-full p { color: var(--muted); font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
</style>
