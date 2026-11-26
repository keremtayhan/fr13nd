<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { localDay } from '$lib/day';

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const todayKey = localDay();
  const work = $derived(store.data.work);
  const clockedIn = $derived(!!work.clockedInAt);

  const elapsedSec = $derived.by(() => {
    if (!work.clockedInAt) return 0;
    return Math.max(0, Math.floor((now - work.clockedInAt) / 1000));
  });

  const loggedToday = $derived(
    work.log.filter((s) => localDay(new Date(s.start)) === todayKey).reduce((a, s) => a + s.minutes, 0)
  );
  const totalTodayMin = $derived(loggedToday + Math.floor(elapsedSec / 60));
  const pct = $derived(work.targetMinutes > 0 ? Math.min(100, Math.round((totalTodayMin / work.targetMinutes) * 100)) : 0);
  const over = $derived(totalTodayMin > work.targetMinutes);
  const overMin = $derived(Math.max(0, totalTodayMin - work.targetMinutes));
  const recent = $derived([...work.log].reverse().slice(0, 10));

  function fmtClock(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function fmtHM(min: number) {
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  }
  const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  function toggle() {
    if (clockedIn) store.clockOut();
    else store.clockIn();
    now = Date.now();
  }
</script>

<div class="panel">
  <div class="status">
    <span class="sig">WORK</span>
    <span class="state" class:on={clockedIn}>{clockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}</span>
    <span class="sched muted">9:00–18:00</span>
  </div>

  <div class="timer" class:on={clockedIn} class:over={over && clockedIn}>{clockedIn ? fmtClock(elapsedSec) : '—:——:——'}</div>

  <button class="clock-toggle" class:on={clockedIn} onclick={toggle}>
    {clockedIn ? '[ CLOCK OUT ]' : '[ CLOCK IN ]'}
  </button>

  <div class="today">
    <div class="today-head">
      <span class="muted">TODAY{#if over} · <span class="ot">+{fmtHM(overMin)} OT</span>{/if}</span>
      <span class="today-val">{fmtHM(totalTodayMin)} <span class="muted">/ {fmtHM(work.targetMinutes)}</span></span>
    </div>
    <div class="bar"><div class="bar-fill" class:over style="width:{pct}%"></div></div>
  </div>

  <hr class="divider" />

  <div class="log-head muted">SESSIONS</div>
  <div class="log">
    {#if recent.length === 0 && !clockedIn}
      <div class="empty muted">— no shifts logged —</div>
    {/if}
    {#if clockedIn}
      <div class="srow live">
        <span class="stime">{timeOf(work.clockedInAt)} → now</span>
        <span class="sdur on">{fmtHM(Math.floor(elapsedSec / 60))}</span>
      </div>
    {/if}
    {#each recent as s (s.id)}
      <div class="srow">
        <span class="stime">{timeOf(s.start)} → {timeOf(s.end)}</span>
        <span class="sdur">{fmtHM(s.minutes)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    --work: var(--blue);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    font-size: 10px;
    flex-shrink: 0;
  }
  .sig { color: var(--work); font-weight: 700; letter-spacing: 0.12em; }
  .state { color: var(--muted); font-size: 9px; letter-spacing: 0.08em; }
  .state.on { color: var(--work); }
  .sched { margin-left: auto; font-size: 9px; }

  .timer {
    text-align: center;
    font-size: 26px;
    letter-spacing: 0.04em;
    padding: 8px 0 4px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .timer.on {
    color: var(--work);
    text-shadow: 0 0 14px color-mix(in srgb, var(--work) 45%, transparent);
  }

  .clock-toggle {
    margin: 4px 8px 8px;
    padding: 9px 0;
    border: 1px solid var(--work);
    color: var(--work);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    flex-shrink: 0;
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--work) 10%, transparent) 0 1px, transparent 1px 10px),
      transparent;
  }
  .clock-toggle:hover { background: color-mix(in srgb, var(--work) 16%, transparent); }
  .clock-toggle.on {
    border-color: var(--red);
    color: var(--red);
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--red) 12%, transparent) 0 1px, transparent 1px 10px),
      transparent;
  }
  .clock-toggle.on:hover { background: color-mix(in srgb, var(--red) 18%, transparent); }

  .today { padding: 0 8px 6px; flex-shrink: 0; }
  .today-head {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
  }
  .today-val { color: var(--ink); }
  .bar { height: 4px; background: var(--line); }
  .bar-fill { height: 100%; background: var(--work); transition: width 0.3s; }
  .bar-fill.over { background: var(--red); }
  .ot { color: var(--red); font-weight: 700; }
  .timer.over {
    color: var(--red);
    text-shadow: 0 0 16px color-mix(in srgb, var(--red) 50%, transparent);
    animation: ot-glow 1.2s ease-in-out infinite;
  }
  @keyframes ot-glow { 50% { opacity: 0.72; } }

  .log-head { font-size: 9px; letter-spacing: 0.1em; padding: 4px 8px; flex-shrink: 0; }
  .log { flex: 1; min-height: 0; overflow-y: auto; }
  .srow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
    font-size: 10px;
  }
  .srow.live { background: color-mix(in srgb, var(--work) 10%, transparent); }
  .stime { color: var(--muted); }
  .sdur { color: var(--ink); }
  .sdur.on { color: var(--work); }
  .empty { padding: 16px; text-align: center; font-size: 11px; }
</style>
