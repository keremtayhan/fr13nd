<script lang="ts">
  import { store } from '$lib/store.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import type { VesselLog } from '$lib/types';

  const v = $derived(store.data.vessel.today);

  // past days: review + edit + backfill (for days the app never got opened)
  let historyOpen = $state(false);
  let editDate = $state<string | null>(null);
  let addDate = $state('');
  const pastDays = $derived(
    store.data.vessel.log.filter((d) => d.date).slice().sort((a, b) => b.date.localeCompare(a.date))
  );
  const editEntry = $derived(
    editDate === null
      ? null
      : editDate === store.data.vessel.today.date
        ? store.data.vessel.today
        : (store.data.vessel.log.find((d) => d.date === editDate) ?? null)
  );
  function backfillDay() {
    const e = store.upsertVesselDay(addDate);
    if (e) {
      editDate = e.date;
      addDate = '';
    }
  }
  function setDayField(e: VesselLog, field: 'water' | 'sleep' | 'movement' | 'meals' | 'weight', raw: string) {
    const n = Math.max(0, Number(raw) || 0);
    if (field === 'sleep') e.sleep = Math.min(24, n);
    else if (field === 'weight') e.weight = Math.min(500, Math.round(n * 10) / 10);
    else e[field] = Math.round(n);
    store.save();
  }
  function daySummary(d: VesselLog) {
    return `W${d.water} · S${d.sleep}h · M${d.movement}m · F${d.meals} · ${d.meds ? 'meds✓' : 'meds·'}${d.weight ? ` · ${d.weight}kg` : ''}`;
  }

  // bodyweight trend — days where a weight was logged (past log + today)
  const weightTrend = $derived(
    [...store.data.vessel.log, store.data.vessel.today]
      .filter((d) => (d.weight || 0) > 0)
      .map((d) => d.weight as number)
      .slice(-16)
  );
  const weightDelta = $derived(
    weightTrend.length >= 2 ? weightTrend[weightTrend.length - 1] - weightTrend[0] : null
  );
  function setWeight(val: string) {
    store.data.vessel.today.weight = Math.max(0, Math.min(500, Math.round((Number(val) || 0) * 10) / 10));
    store.save();
  }
  const waterMarks = $derived(Math.min(8, Math.max(0, Math.round(Number(v.water) || 0))));
  const sleepMarks = $derived(Math.min(8, Math.max(0, Math.round((Number(v.sleep) || 0) / 1.5))));
  const movementMarks = $derived(Math.min(8, Math.max(0, Math.ceil((Number(v.movement) || 0) / 10))));
  const mealMarks = $derived(Math.min(4, Math.max(0, Math.round(Number(v.meals) || 0))));
  const loggedCount = $derived([v.water > 0, v.sleep > 0, v.movement > 0, v.meals > 0, v.meds].filter(Boolean).length);

  function bump(field: 'water' | 'meals' | 'movement', amount: number) {
    store.data.vessel.today[field] = Math.max(0, Number(store.data.vessel.today[field]) + amount);
    store.save();
  }

  function setSleep(value: number) {
    store.data.vessel.today.sleep = Math.max(0, Math.min(24, value));
    store.save();
  }

  function toggleMeds() {
    store.data.vessel.today.meds = !store.data.vessel.today.meds;
    store.save();
  }
</script>

<div class="panel vessel-deck">
  <header class="vessel-head">
    <div>
      <span class="eyebrow">BODY SYSTEM / TODAY</span>
      <h2>VESSEL</h2>
    </div>
    <div class="readiness">
      <span class="readiness-value">{loggedCount}/5</span>
      <span>CHECKS</span>
    </div>
  </header>

  <div class="signal-line">
    <span class="pulse-dot" class:lit={loggedCount > 0}></span>
    <span>{v.date || 'TODAY'} / KEEP THE MACHINE FED</span>
    <button class="past-btn" onclick={() => (historyOpen = true)}>▸ PAST DAYS · {pastDays.length}</button>
  </div>

  <div class="vital-grid">
    <section class="vital-card water">
      <div class="card-head"><span>H2O</span><span class="unit">GLASSES</span></div>
      <div class="reading"><strong>{v.water}</strong><span>/ 8</span></div>
      <div class="meter" aria-label={`${v.water} glasses of water`}>
        {#each Array(8) as _, i}<i class:filled={i < waterMarks}></i>{/each}
      </div>
      <div class="adjust"><button aria-label="decrease water" onclick={() => bump('water', -1)}>−</button><span>WATER</span><button aria-label="increase water" onclick={() => bump('water', 1)}>+</button></div>
    </section>

    <section class="vital-card sleep">
      <div class="card-head"><span>SLEEP</span><span class="unit">HOURS</span></div>
      <div class="reading"><strong>{v.sleep}</strong><span>H</span></div>
      <div class="meter" aria-label={`${v.sleep} hours of sleep`}>
        {#each Array(8) as _, i}<i class:filled={i < sleepMarks}></i>{/each}
      </div>
      <div class="adjust"><button aria-label="decrease sleep" onclick={() => setSleep(v.sleep - 0.5)}>−</button><span>0.5H</span><button aria-label="increase sleep" onclick={() => setSleep(v.sleep + 0.5)}>+</button></div>
    </section>

    <section class="vital-card movement">
      <div class="card-head"><span>MOVE</span><span class="unit">MINUTES</span></div>
      <div class="reading"><strong>{v.movement}</strong><span>MIN</span></div>
      <div class="meter" aria-label={`${v.movement} minutes of movement`}>
        {#each Array(8) as _, i}<i class:filled={i < movementMarks}></i>{/each}
      </div>
      <div class="adjust"><button aria-label="decrease movement" onclick={() => bump('movement', -10)}>−</button><span>10 MIN</span><button aria-label="increase movement" onclick={() => bump('movement', 10)}>+</button></div>
    </section>

    <section class="vital-card meals">
      <div class="card-head"><span>FUEL</span><span class="unit">MEALS</span></div>
      <div class="reading"><strong>{v.meals}</strong><span>/ 4</span></div>
      <div class="meter four" aria-label={`${v.meals} meals`}>
        {#each Array(4) as _, i}<i class:filled={i < mealMarks}></i>{/each}
      </div>
      <div class="adjust"><button aria-label="decrease meals" onclick={() => bump('meals', -1)}>−</button><span>MEALS</span><button aria-label="increase meals" onclick={() => bump('meals', 1)}>+</button></div>
    </section>
  </div>

  <button class="meds-card" class:complete={v.meds} onclick={toggleMeds} aria-pressed={v.meds}>
    <span class="meds-mark">{v.meds ? '✓' : '+'}</span>
    <span class="meds-copy"><b>MEDS</b><small>{v.meds ? 'LOGGED / TAKEN' : 'NOT LOGGED YET'}</small></span>
    <span class="meds-action">{v.meds ? '[UNDO]' : '[LOG]'}</span>
  </button>

  <section class="weight-card">
    <div class="wc-head"><span>WEIGHT</span><span class="unit">KG{#if weightTrend.length} · last {weightTrend.length}{/if}</span></div>
    <div class="wc-body">
      <input
        class="wc-input"
        type="number"
        step="0.1"
        min="0"
        value={v.weight || ''}
        placeholder="—"
        onchange={(e) => setWeight(e.currentTarget.value)}
      />
      <div class="wc-trend"><Sparkline points={weightTrend} color="var(--gold)" /></div>
      {#if weightDelta !== null}
        <span class="wc-delta" class:down={weightDelta < 0} class:up={weightDelta > 0}>
          {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)}
        </span>
      {/if}
    </div>
  </section>

  <label class="note-box">
    <span class="note-label">BODY NOTE <em>// OPTIONAL</em></span>
    <textarea
      bind:value={store.data.vessel.today.note}
      oninput={() => store.save()}
      rows="4"
      placeholder="soreness, appetite, body signal, context..."
    ></textarea>
  </label>

  {#if historyOpen}
    <div class="overlay">
      <div class="modal">
        <div class="modal-head">
          <span>VESSEL · PAST DAYS</span>
          <button onclick={() => { historyOpen = false; editDate = null; }}>[X]</button>
        </div>

        <div class="backfill">
          <input type="date" bind:value={addDate} max={v.date} />
          <button class="bf-btn" onclick={backfillDay} disabled={!addDate}>[+ BACKFILL]</button>
        </div>

        <div class="day-list">
          <button class="day-row" class:sel={editDate === v.date} onclick={() => (editDate = v.date)}>
            <span class="d-date">TODAY</span>
            <span class="d-sum">{daySummary(v)}</span>
          </button>
          {#each pastDays as d (d.date)}
            <button class="day-row" class:sel={editDate === d.date} onclick={() => (editDate = d.date)}>
              <span class="d-date">{d.date}</span>
              <span class="d-sum">{daySummary(d)}</span>
            </button>
          {/each}
          {#if pastDays.length === 0}
            <div class="empty muted">- no past days on record · backfill one above -</div>
          {/if}
        </div>

        {#if editEntry}
          <div class="day-edit">
            <div class="de-head">{editEntry.date === v.date ? 'EDITING TODAY' : `EDITING ${editEntry.date}`}</div>
            <div class="de-grid">
              <label class="de-f"><span>WATER</span><input type="number" min="0" value={editEntry.water} onchange={(e) => setDayField(editEntry, 'water', e.currentTarget.value)} /></label>
              <label class="de-f"><span>SLEEP h</span><input type="number" min="0" max="24" step="0.5" value={editEntry.sleep} onchange={(e) => setDayField(editEntry, 'sleep', e.currentTarget.value)} /></label>
              <label class="de-f"><span>MOVE m</span><input type="number" min="0" value={editEntry.movement} onchange={(e) => setDayField(editEntry, 'movement', e.currentTarget.value)} /></label>
              <label class="de-f"><span>MEALS</span><input type="number" min="0" value={editEntry.meals} onchange={(e) => setDayField(editEntry, 'meals', e.currentTarget.value)} /></label>
              <label class="de-f"><span>WEIGHT kg</span><input type="number" min="0" step="0.1" value={editEntry.weight || ''} onchange={(e) => setDayField(editEntry, 'weight', e.currentTarget.value)} /></label>
              <button class="de-meds" class:on={editEntry.meds} onclick={() => { editEntry.meds = !editEntry.meds; store.save(); }}>
                {editEntry.meds ? 'MEDS ✓ TAKEN' : 'MEDS · NOT TAKEN'}
              </button>
            </div>
            <textarea
              class="de-note"
              rows="3"
              placeholder="body note for that day…"
              value={editEntry.note}
              oninput={(e) => { editEntry.note = e.currentTarget.value; store.save(); }}
            ></textarea>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  .vessel-deck {
    padding: 10px;
    gap: 8px;
    background: radial-gradient(100% 55% at 50% 0%, color-mix(in srgb, var(--violet) 14%, transparent), transparent 76%);
  }
  .vessel-head { display: flex; align-items: end; justify-content: space-between; padding: 2px 1px 0; }
  .eyebrow, .readiness span:last-child, .card-head, .adjust, .note-label { font-size: 8px; letter-spacing: .12em; }
  .eyebrow { display: block; color: var(--muted); margin-bottom: 2px; }
  h2 { color: var(--violet); font-size: 17px; line-height: 1; letter-spacing: .12em; }
  .readiness { display: grid; justify-items: end; gap: 1px; color: var(--muted); }
  .readiness-value { color: var(--gold); font-size: 14px; font-weight: 700; line-height: 1; }
  .signal-line { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border: 1px solid color-mix(in srgb, var(--violet) 34%, var(--line)); color: var(--muted); font-size: 8px; letter-spacing: .07em; background: color-mix(in srgb, var(--violet) 6%, transparent); }
  .pulse-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--line); box-shadow: 0 0 0 transparent; }
  .pulse-dot.lit { background: var(--violet); box-shadow: 0 0 9px var(--violet); }
  .vital-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .vital-card { --vital: var(--violet); display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 7px; border: 1px solid color-mix(in srgb, var(--vital) 34%, var(--line)); background: linear-gradient(135deg, color-mix(in srgb, var(--vital) 11%, transparent), transparent 62%), rgba(7, 7, 10, .54); }
  .vital-card.water { --vital: var(--blue); }.vital-card.sleep { --vital: var(--violet); }.vital-card.movement { --vital: var(--green); }.vital-card.meals { --vital: var(--gold); }
  .card-head { display: flex; justify-content: space-between; color: var(--vital); font-weight: 700; }
  .unit { color: var(--muted); font-size: 7px; font-weight: 400; }
  .reading { display: flex; align-items: baseline; gap: 3px; color: var(--muted); }
  .reading strong { color: var(--ink); font-size: 21px; font-weight: 500; line-height: .9; }.reading span { color: var(--vital); font-size: 9px; }
  .meter { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }.meter.four { grid-template-columns: repeat(4, 1fr); }
  .meter i { height: 4px; background: color-mix(in srgb, var(--vital) 14%, var(--line)); }.meter i.filled { background: var(--vital); box-shadow: 0 0 5px color-mix(in srgb, var(--vital) 70%, transparent); }
  .adjust { display: grid; grid-template-columns: 22px 1fr 22px; align-items: center; text-align: center; color: var(--muted); }
  .adjust button { height: 20px; border: 1px solid color-mix(in srgb, var(--vital) 42%, var(--line)); color: var(--vital); font-size: 13px; }.adjust button:hover { background: var(--vital); color: var(--void); }
  .meds-card { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 7px; width: 100%; min-height: 42px; padding: 6px; border: 1px solid color-mix(in srgb, var(--rose) 34%, var(--line)); color: var(--ink); text-align: left; background: linear-gradient(90deg, color-mix(in srgb, var(--rose) 10%, transparent), transparent 65%); }
  .meds-card:hover { border-color: var(--rose); }.meds-card.complete { border-color: var(--teal); background: linear-gradient(90deg, color-mix(in srgb, var(--teal) 12%, transparent), transparent 65%); }
  .meds-mark { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--rose); color: var(--rose); font-size: 14px; }.complete .meds-mark { border-color: var(--teal); color: var(--teal); }
  .meds-copy { display: grid; gap: 1px; }.meds-copy b { color: var(--ink); font-size: 10px; letter-spacing: .1em; }.meds-copy small { color: var(--muted); font-size: 8px; letter-spacing: .06em; }.meds-action { color: var(--gold); font-size: 8px; letter-spacing: .06em; }
  .weight-card { display: flex; flex-direction: column; gap: 6px; padding: 7px; border: 1px solid color-mix(in srgb, var(--gold) 34%, var(--line)); background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 10%, transparent), transparent 62%), rgba(7, 7, 10, .54); }
  .wc-head { display: flex; justify-content: space-between; color: var(--gold); font-size: 8px; font-weight: 700; letter-spacing: .12em; }
  .wc-head .unit { color: var(--muted); font-size: 7px; font-weight: 400; }
  .wc-body { display: grid; grid-template-columns: 74px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .wc-input { font-size: 18px; font-weight: 500; color: var(--ink); padding: 2px 5px; background: transparent; border: 1px solid color-mix(in srgb, var(--gold) 30%, var(--line)); }
  .wc-input:focus { border-color: var(--gold); }
  .wc-trend { min-width: 0; }
  .wc-delta { font-size: 11px; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .wc-delta.down { color: var(--teal); }
  .wc-delta.up { color: var(--rose); }
  .note-box { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 4px; padding: 7px; border: 1px solid var(--line); background: rgba(7, 7, 10, .48); }
  .note-label { color: var(--violet); }.note-label em { color: var(--muted); font-style: normal; letter-spacing: .07em; }.note-box textarea { flex: 1; min-height: 58px; padding: 5px; border-color: transparent; background: transparent; line-height: 1.45; }.note-box textarea:focus { border-color: var(--violet); background: color-mix(in srgb, var(--violet) 5%, transparent); }

  /* past days: review / edit / backfill */
  .past-btn { margin-left: auto; color: var(--violet); font-size: 8px; letter-spacing: .08em; white-space: nowrap; }
  .past-btn:hover { color: var(--ink); }
  .overlay {
    position: absolute; inset: 0; z-index: 20; display: flex; padding: 8px;
    background: rgba(7, 7, 10, 0.88);
  }
  .modal {
    width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden;
    border: 1px solid var(--violet); background: var(--void);
    box-shadow: 0 0 0 1px var(--void), 0 14px 30px rgba(0, 0, 0, 0.6);
  }
  .modal-head {
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    padding: 7px 8px; border-bottom: 1px solid var(--line);
    color: var(--violet); font-size: 10px; font-weight: 700; letter-spacing: .1em;
  }
  .modal-head button { color: var(--rose); font-size: 10px; }
  .backfill {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; flex-shrink: 0;
    padding: 7px 8px; border-bottom: 1px solid var(--line);
  }
  .backfill input { color: var(--ink); font-size: 10px; }
  .bf-btn { border: 1px solid color-mix(in srgb, var(--violet) 50%, var(--line)); color: var(--violet); font-size: 9px; padding: 0 8px; letter-spacing: .08em; }
  .bf-btn:hover:not(:disabled) { background: var(--violet); color: var(--void); }
  .bf-btn:disabled { opacity: .4; }
  .day-list { overflow-y: auto; max-height: 42%; flex-shrink: 0; border-bottom: 1px solid var(--line); }
  .day-row {
    display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 6px; align-items: center;
    width: 100%; padding: 5px 8px; text-align: left; border-bottom: 1px solid var(--line); font-size: 10px;
  }
  .day-row:hover { background: color-mix(in srgb, var(--violet) 8%, transparent); }
  .day-row.sel { background: color-mix(in srgb, var(--violet) 14%, transparent); }
  .day-row.sel .d-date { color: var(--violet); }
  .d-date { color: var(--ink); font-size: 9px; font-weight: 700; letter-spacing: .04em; }
  .d-sum { color: var(--muted); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .day-edit { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .de-head { color: var(--violet); font-size: 9px; font-weight: 700; letter-spacing: .1em; }
  .de-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .de-f { display: grid; gap: 2px; }
  .de-f span { color: var(--muted); font-size: 8px; letter-spacing: .09em; }
  .de-f input { width: 100%; font-size: 11px; }
  .de-f input:focus { border-color: var(--violet); }
  .de-meds {
    grid-column: 1 / -1; height: 26px; border: 1px solid color-mix(in srgb, var(--rose) 45%, var(--line));
    color: var(--rose); font-size: 9px; font-weight: 700; letter-spacing: .08em;
  }
  .de-meds.on { border-color: var(--teal); color: var(--teal); background: color-mix(in srgb, var(--teal) 10%, transparent); }
  .de-note { resize: none; font-size: 10px; line-height: 1.45; }
  .de-note:focus { border-color: var(--violet); }
  .empty { padding: 14px; text-align: center; font-size: 10px; }
</style>
