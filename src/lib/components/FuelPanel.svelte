<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { estimateNutrition } from '$lib/agent';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import type { FuelKind } from '$lib/types';

  const KINDS: { id: FuelKind; label: string; glyph: string }[] = [
    { id: 'breakfast', label: 'BREAKFAST', glyph: '☀' },
    { id: 'lunch', label: 'LUNCH', glyph: '◐' },
    { id: 'dinner', label: 'DINNER', glyph: '☾' },
    { id: 'snack', label: 'SNACK', glyph: '✦' },
  ];

  function defaultKind(): FuelKind {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 21) return 'dinner';
    return 'snack';
  }

  let name = $state('');
  let kcal = $state<number | null>(null);
  let kind = $state<FuelKind>(defaultKind());
  let estimatingIds = $state<string[]>([]);

  const today = $derived(store.data.fuel.today);
  const entries = $derived([...today.entries].reverse());
  const total = $derived(today.entries.reduce((sum, e) => sum + (e.kcal || 0), 0));
  const target = $derived(store.data.fuel.targetKcal);
  const pct = $derived(target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0);
  const recent = $derived(store.data.fuel.log.slice(-8).reverse());
  const kcalTrend = $derived(
    store.data.fuel.log.slice(-8).map((d) => d.entries.reduce((s, e) => s + (e.kcal || 0), 0))
  );

  // macro totals + targets (protein / carbs / fat, grams)
  const pTotal = $derived(today.entries.reduce((s, e) => s + (e.protein || 0), 0));
  const cTotal = $derived(today.entries.reduce((s, e) => s + (e.carbs || 0), 0));
  const fTotal = $derived(today.entries.reduce((s, e) => s + (e.fat || 0), 0));
  const macroDefs = $derived(
    [
      { key: 'protein', label: 'PROTEIN', short: 'P', total: pTotal, target: store.data.fuel.targetProtein ?? 0, color: 'var(--gold)' },
      { key: 'carbs', label: 'CARBS', short: 'C', total: cTotal, target: store.data.fuel.targetCarbs ?? 0, color: 'var(--teal)' },
      { key: 'fat', label: 'FAT', short: 'F', total: fTotal, target: store.data.fuel.targetFat ?? 0, color: 'var(--violet)' },
    ].map((m) => ({ ...m, pct: m.target > 0 ? Math.min(100, Math.round((m.total / m.target) * 100)) : 0 }))
  );

  // designated meal times + live status
  let nowMin = $state(curMin());
  function curMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  onMount(() => {
    const t = setInterval(() => (nowMin = curMin()), 60000);
    return () => clearInterval(t);
  });
  type MealState = 'done' | 'now' | 'overdue' | 'soon';
  const mealStatus = $derived.by(() => {
    nowMin;
    return (store.data.fuel.mealTimes ?? []).map((m) => {
      const meta = KINDS.find((k) => k.id === m.id);
      const [hh, mm] = m.time.split(':').map(Number);
      const tMin = (hh || 0) * 60 + (mm || 0);
      const ents = today.entries.filter((e) => e.kind === m.id);
      const logged = ents.length > 0;
      let state: MealState;
      let note: string;
      if (logged) { state = 'done'; note = 'eaten'; }
      else if (nowMin > tMin + 15) { state = 'overdue'; note = 'overdue'; }
      else if (nowMin >= tMin - 20) { state = 'now'; note = 'now'; }
      else { const d = tMin - nowMin; state = 'soon'; note = d >= 60 ? `in ${Math.floor(d / 60)}h${d % 60 ? ' ' + (d % 60) + 'm' : ''}` : `in ${d}m`; }
      const kcal = ents.reduce((s, e) => s + (e.kcal || 0), 0);
      const p = ents.reduce((s, e) => s + (e.protein || 0), 0);
      const c = ents.reduce((s, e) => s + (e.carbs || 0), 0);
      const f = ents.reduce((s, e) => s + (e.fat || 0), 0);
      return { id: m.id, label: meta?.label ?? m.id, glyph: meta?.glyph ?? '✦', time: m.time, state, note, kcal, p, c, f };
    });
  });
  const nextMeal = $derived(
    mealStatus.find((m) => m.state === 'overdue' || m.state === 'now') ?? mealStatus.find((m) => m.state === 'soon')
  );
  function setMealTime(id: FuelKind, time: string) {
    const m = store.data.fuel.mealTimes?.find((x) => x.id === id);
    if (m && time) { m.time = time; store.data.fuel.updated = store.nowString(); store.save(); }
  }

  function glyphOf(k: FuelKind) {
    return KINDS.find((x) => x.id === k)?.glyph ?? '✦';
  }
  function dayTotal(es: { kcal: number }[]) {
    return es.reduce((s, e) => s + (e.kcal || 0), 0);
  }
  function dayMacros(es: { protein?: number; carbs?: number; fat?: number }[]) {
    return es.reduce(
      (a, e) => ({ p: a.p + (e.protein || 0), c: a.c + (e.carbs || 0), f: a.f + (e.fat || 0) }),
      { p: 0, c: 0, f: 0 }
    );
  }

  async function addEntry() {
    const n = name.trim();
    if (!n) return;
    const id = store.newId();
    const manualKcal = Math.max(0, Math.round(Number(kcal) || 0));
    const manual = manualKcal > 0;

    store.data.fuel.today.entries.push({
      id,
      at: store.nowString(),
      name: n,
      kcal: manualKcal,
      kind,
      note: '',
      estimated: !manual,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    store.data.fuel.updated = store.nowString();
    store.save();

    const savedName = n;
    name = '';
    kcal = null;
    kind = defaultKind();

    // estimate macros (and kcal, if none was typed) in the background
    estimatingIds = [...estimatingIds, id];
    const est = await estimateNutrition(savedName);
    const entry = store.data.fuel.today.entries.find((e) => e.id === id);
    if (entry) {
      entry.protein = est.protein;
      entry.carbs = est.carbs;
      entry.fat = est.fat;
      if (!manual) entry.kcal = est.kcal;
      store.data.fuel.updated = store.nowString();
      store.save();
    }
    estimatingIds = estimatingIds.filter((x) => x !== id);
  }

  function deleteEntry(id: string) {
    store.data.fuel.today.entries = store.data.fuel.today.entries.filter((e) => e.id !== id);
    store.data.fuel.updated = store.nowString();
    store.save();
  }

  function bumpTarget(delta: number) {
    store.data.fuel.targetKcal = Math.max(0, store.data.fuel.targetKcal + delta);
    store.save();
  }

  function setMacroTarget(key: string, v: string) {
    const grams = Math.max(0, Math.round(Number(v) || 0));
    if (key === 'protein') store.data.fuel.targetProtein = grams;
    else if (key === 'carbs') store.data.fuel.targetCarbs = grams;
    else if (key === 'fat') store.data.fuel.targetFat = grams;
    store.data.fuel.updated = store.nowString();
    store.save();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEntry();
    }
  }
</script>

<div class="panel">
  <div class="status">
    <span class="sig">FUEL</span>
    <span class="total"><b>{total}</b> kcal{#if target > 0}<span class="muted"> / {target}</span>{/if}</span>
    <span class="count muted">{today.entries.length} logged</span>
  </div>

  {#if target > 0}
    <div class="bar">
      <div class="bar-fill" style="width:{pct}%"></div>
    </div>
  {/if}

  <div class="macros">
    {#each macroDefs as m (m.key)}
      <div class="macro">
        <div class="mhead">
          <span class="mname" style="color:{m.color}">{m.label}</span>
          <span class="mval">{m.total}<span class="muted">{#if m.target > 0}/{m.target}{/if}g</span></span>
        </div>
        <div class="mbar"><div class="mfill" style="width:{m.pct}%; background:{m.color}"></div></div>
      </div>
    {/each}
  </div>

  <hr class="divider" />

  <div class="add">
    <input class="food" bind:value={name} onkeydown={onKeydown} placeholder="what did you eat?" />
    <div class="add-row">
      <input class="kcal" type="number" min="0" bind:value={kcal} onkeydown={onKeydown} placeholder="auto" />
      <select bind:value={kind}>
        {#each KINDS as k}<option value={k.id}>{k.label}</option>{/each}
      </select>
      <button class="btn btn-green" onclick={addEntry}>[+ LOG]</button>
    </div>
    <div class="hint muted">leave kcal blank — estimated locally (Ollama) · your food never leaves this machine</div>
  </div>

  <hr class="divider" />

  <div class="log">
    {#if entries.length === 0}
      <div class="empty muted">— nothing logged today —</div>
    {/if}
    {#each entries as e (e.id)}
      <div class="entry kind-{e.kind}">
        <span class="glyph">{glyphOf(e.kind)}</span>
        <div class="ebody">
          <span class="ename" title={e.kind}>{e.name}</span>
          {#if e.protein || e.carbs || e.fat}
            <span class="emacros muted">P {e.protein || 0} · C {e.carbs || 0} · F {e.fat || 0}</span>
          {/if}
        </div>
        <span class="ekcal">
          {#if estimatingIds.includes(e.id)}
            <span class="est">est…</span>
          {:else if e.kcal}
            {e.estimated ? '~' : ''}{e.kcal}
          {:else}
            —
          {/if}
        </span>
        <button class="del" onclick={() => deleteEntry(e.id)} title="remove">[x]</button>
      </div>
    {/each}
  </div>

  <hr class="divider" />

  <div class="target-row">
    <span class="muted">KCAL TARGET</span>
    <button class="tbtn" onclick={() => bumpTarget(-100)}>−</button>
    <span class="tval">{target > 0 ? target : 'off'}</span>
    <button class="tbtn" onclick={() => bumpTarget(100)}>+</button>
  </div>

  <div class="mtarget-row">
    <span class="muted">MACRO TARGETS · g</span>
    {#each macroDefs as m (m.key)}
      <label class="mt">
        <span style="color:{m.color}">{m.short}</span>
        <input type="number" min="0" value={m.target} onchange={(e) => setMacroTarget(m.key, e.currentTarget.value)} />
      </label>
    {/each}
  </div>
  <div class="hint muted">starting point for recomp — tune to how your body responds</div>

  <div class="meals-head muted">
    MEAL TIMES{#if nextMeal}<span class="next"> · next {nextMeal.label.toLowerCase()} {nextMeal.note}</span>{/if}
  </div>
  <div class="meals">
    {#each mealStatus as m (m.id)}
      <div class="meal state-{m.state}">
        <span class="mglyph">{m.glyph}</span>
        <div class="mbody">
          <span class="mlabel">{m.label}</span>
          {#if m.kcal > 0}
            <span class="mmac muted">{m.kcal} kcal · P {m.p} · C {m.c} · F {m.f}</span>
          {/if}
        </div>
        <input class="mtime" type="time" value={m.time} onchange={(e) => setMealTime(m.id, e.currentTarget.value)} />
        <span class="mstate">{m.note}</span>
      </div>
    {/each}
  </div>

  {#if recent.length > 0}
    <div class="recent-head muted"><span>RECENT DAYS</span><Sparkline points={kcalTrend} color="var(--fuel)" width={84} height={18} /></div>
    <div class="recent">
      {#each recent as d (d.date)}
        {@const mac = dayMacros(d.entries)}
        <div class="rrow">
          <span class="rdate muted">{d.date}</span>
          <span class="rk">{dayTotal(d.entries)} kcal</span>
          <span class="rmac muted">P {mac.p} · C {mac.c} · F {mac.f}</span>
          <span class="rn muted">{d.entries.length}×</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    --fuel: var(--green);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    font-size: 10px;
    flex-shrink: 0;
  }
  .sig { color: var(--fuel); font-weight: 700; letter-spacing: 0.12em; }
  .total { color: var(--ink); }
  .total b { color: var(--fuel); font-size: 13px; }
  .count { margin-left: auto; }

  .bar {
    height: 3px;
    margin: 0 8px;
    background: var(--line);
    flex-shrink: 0;
  }
  .bar-fill {
    height: 100%;
    background: var(--fuel);
    transition: width 0.2s;
  }

  .macros {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    padding: 5px 8px 1px;
    flex-shrink: 0;
  }
  .macro { min-width: 0; }
  .mhead { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
  .mname { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; }
  .mval { color: var(--ink); font-size: 9px; white-space: nowrap; }
  .mbar { height: 3px; margin-top: 2px; background: var(--line); }
  .mfill { height: 100%; transition: width 0.2s; }

  .add {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .add-row {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 4px;
  }
  .add input:focus, .add select:focus { border-color: var(--fuel); }
  .btn-green { border-color: var(--fuel); color: var(--fuel); }
  .btn-green:hover { background: var(--fuel); color: var(--void); }
  .hint { font-size: 8px; letter-spacing: 0.04em; padding: 1px 1px 0; opacity: 0.7; }
  .est { color: var(--fuel); font-size: 9px; animation: est-pulse 1s ease-in-out infinite; }
  @keyframes est-pulse { 50% { opacity: 0.35; } }

  .log {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
    min-height: 40px;
  }
  .entry {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--line);
    font-size: 10px;
  }
  .glyph { color: var(--fuel); font-size: 10px; align-self: start; padding-top: 1px; }
  .kind-snack .glyph { color: var(--gold); }
  .ebody { min-width: 0; display: flex; flex-direction: column; }
  .ename { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .emacros { font-size: 8px; letter-spacing: 0.03em; }
  .ekcal { color: var(--fuel); font-size: 10px; min-width: 28px; text-align: right; }
  .del { color: var(--muted); font-size: 9px; }
  .del:hover { color: var(--red); }
  .empty { padding: 16px; text-align: center; font-size: 11px; }

  .target-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    font-size: 9px;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .tbtn { color: var(--muted); font-size: 13px; line-height: 1; padding: 0 3px; }
  .tbtn:hover { color: var(--fuel); }
  .tval { color: var(--ink); font-size: 10px; min-width: 34px; text-align: center; }

  .mtarget-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 3px 8px 1px;
    font-size: 9px;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .mtarget-row > .muted { margin-right: auto; }
  .mt { display: inline-flex; align-items: center; gap: 3px; }
  .mt span { font-size: 10px; font-weight: 700; }
  .mt input { width: 44px; padding: 1px 4px; font-size: 10px; }
  .mt input:focus { border-color: var(--fuel); }

  .meals-head { font-size: 9px; letter-spacing: 0.1em; padding: 4px 8px 2px; flex-shrink: 0; }
  .meals-head .next { color: var(--gold); letter-spacing: 0.04em; }
  .meals { flex-shrink: 0; padding: 0 4px 3px; }
  .meal {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    font-size: 10px;
  }
  .meal .mglyph { color: var(--fuel); text-align: center; align-self: start; padding-top: 1px; }
  .mbody { min-width: 0; display: flex; flex-direction: column; }
  .meal .mlabel { letter-spacing: 0.06em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mmac { font-size: 8px; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mtime {
    font-size: 9px;
    padding: 1px 3px;
    width: 62px;
    color: var(--muted);
    background: var(--void);
    border: 1px solid var(--line);
  }
  .mtime:focus { border-color: var(--fuel); color: var(--ink); }
  .mstate { font-size: 8px; letter-spacing: 0.06em; min-width: 42px; text-align: right; color: var(--muted); }
  .meal.state-done .mglyph, .meal.state-done .mstate { color: var(--green); }
  .meal.state-now .mstate { color: var(--gold); }
  .meal.state-overdue .mstate { color: var(--red); }

  .recent-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 9px; letter-spacing: 0.1em; padding: 3px 8px; flex-shrink: 0; }
  .recent { max-height: 92px; overflow-y: auto; flex-shrink: 0; }
  .rrow {
    display: grid;
    grid-template-columns: 70px auto minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    padding: 3px 8px;
    border-bottom: 1px solid var(--line);
    font-size: 10px;
  }
  .rk { color: var(--fuel); white-space: nowrap; }
  .rmac { font-size: 9px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  .rdate, .rn { font-size: 9px; }
</style>
