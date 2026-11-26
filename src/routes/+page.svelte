<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '$lib/runtime';
  import { invoke } from '$lib/runtime';
  import { hasMissingDailyActivities, missingDailySummary } from '$lib/daily';
  import { runProactive, overtimeQuip, runHourlyNotify, runDailyZodiac, starSigns } from '$lib/agent';
  import { store } from '$lib/store.svelte';
  import '$lib/theme.css';

  import QuestPanel    from '$lib/components/QuestPanel.svelte';
  import CraftPanel    from '$lib/components/CraftPanel.svelte';
  import BasePanel     from '$lib/components/BasePanel.svelte';
  import KittyPanel    from '$lib/components/KittyPanel.svelte';
  import VesselPanel   from '$lib/components/VesselPanel.svelte';
  import CookbookPanel from '$lib/components/CookbookPanel.svelte';
  import FuelPanel     from '$lib/components/FuelPanel.svelte';
  import WorkPanel     from '$lib/components/WorkPanel.svelte';
  import AgentPanel    from '$lib/components/AgentPanel.svelte';
  import SignalPanel   from '$lib/components/SignalPanel.svelte';
  import LyricsPanel   from '$lib/components/LyricsPanel.svelte';
  import CompactMode   from '$lib/components/CompactMode.svelte';
  import CaptureBar    from '$lib/components/CaptureBar.svelte';
  import StarsPanel    from '$lib/components/StarsPanel.svelte';
  import QueuePanel    from '$lib/components/QueuePanel.svelte';
  import KanjiPanel    from '$lib/components/KanjiPanel.svelte';
  import { localDay } from '$lib/day';

  type Panel = 'quests' | 'craft' | 'agent' | 'signal' | 'lyrics';
  const NAV: { id: Panel; label: string }[] = [
    { id: 'quests', label: 'QUESTS' },
    { id: 'craft',  label: 'CRAFT'  },
    { id: 'agent',  label: 'AGENT'  },
    { id: 'signal', label: 'SIGNAL' },
    { id: 'lyrics', label: 'LYRICS' },
  ];

  type Sidecar = 'base' | 'pet' | 'vessel' | 'cookbook' | 'fuel' | 'work' | 'stars' | 'queue' | 'kanji' | null;
  type SidecarMode = 'handle' | 'menu' | 'panel';

  let active  = $state<Panel>('quests');
  let compact = $state(false);
  let alwaysOnTop = $state(true);
  // Expanded mode is a command deck, not compact mode with a large empty margin.
  // Keep the body console open by default; the handle can still collapse it.
  let sidecar = $state<Sidecar>('vessel');
  let sidecarMenuOpen = $state(false);

  const baseDone = $derived(store.data.abode.tasks.filter(t => t.completed).length);
  const baseTotal = $derived(store.data.abode.tasks.length);
  const petDaily = $derived(store.data.pet.tasks.filter(t => t.cadence === 'Daily'));
  const petDailyDone = $derived(petDaily.filter(t => t.completed).length);
  const vessel = $derived(store.data.vessel.today);
  const fuelKcal = $derived(store.data.fuel.today.entries.reduce((sum, e) => sum + (e.kcal || 0), 0));
  const starGlyph = $derived(starSigns(store.data.stars.birthDate)?.westernSym ?? '✦');
  const queueCount = $derived(store.data.queue.items.filter((i) => i.status !== 'done').length);
  // 'off' hides the body trackers entirely. Nothing is deleted — the panels and
  // every logged day come straight back when it's switched on again.
  const bodyPanels = $derived((store.data.settings.bodyTracking ?? 'quiet') !== 'off');
  const kanjiDue = $derived.by(() => {
    const today = localDay();
    return store.data.kanji.cards.filter((c) => !c.due || c.due <= today).length;
  });

  // clock-in / clock-out (epoch-based, local clock)
  let clockNow = $state(Date.now());
  const workTodayKey = localDay();
  const clockedIn = $derived(!!store.data.work.clockedInAt);
  const sessionMin = $derived.by(() => {
    clockNow;
    const w = store.data.work;
    if (!w.clockedInAt) return 0;
    return Math.max(0, Math.floor((clockNow - w.clockedInAt) / 60000));
  });
  const workTodayMin = $derived.by(() => {
    clockNow;
    const w = store.data.work;
    const logged = w.log.filter((s) => localDay(new Date(s.start)) === workTodayKey).reduce((a, s) => a + s.minutes, 0);
    return logged + sessionMin;
  });
  // 9–6 schedule: nudge to clock in during weekday work hours, clock out after 6pm
  const workPrompt = $derived.by(() => {
    clockNow;
    const d = new Date(clockNow);
    const hour = d.getHours();
    const weekday = d.getDay() >= 1 && d.getDay() <= 5;
    if (store.data.work.clockedInAt) return hour >= 18 ? 'out' : null;
    return weekday && hour >= 9 && hour < 18 ? 'in' : null;
  });
  // overtime: clocked in and past the day's target (9h)
  const overtimeMin = $derived(clockedIn ? Math.max(0, workTodayMin - store.data.work.targetMinutes) : 0);
  const overtime = $derived(overtimeMin > 0);
  // overtime banner copy is written by fr13nd, refreshed each wall-clock hour past the day
  let overtimeLine = $state('OVERTIME — TIME TO WRAP UP');
  let otFetchedHour = -1; // plain guard (non-reactive) so it never re-triggers the effect
  const inOvertime = $derived(overtime || workPrompt === 'out');
  $effect(() => {
    if (!inOvertime) { otFetchedHour = -1; return; }
    const hour = new Date(clockNow).getHours();
    if (hour === otFetchedHour) return; // already asked him this hour
    otFetchedHour = hour;
    overtimeQuip(overtimeMin).then((line) => { if (line) overtimeLine = line; }).catch(() => {});
  });
  // a lyric (or anything) queued from another panel jumps the user to the AGENT chat,
  // where AgentPanel's own effect picks the prompt up and sends it
  $effect(() => {
    if (store.pendingAgentPrompt) active = 'agent';
  });
  function fmtHM(min: number) { return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; }
  function toggleClock() {
    if (store.data.work.clockedInAt) store.clockOut();
    else store.clockIn();
    clockNow = Date.now();
  }
  const missingDailyActivities = $derived(hasMissingDailyActivities(store.data));
  const dailyNudges = $derived(store.loaded ? missingDailySummary(store.data) : []);
  const sidecarRailOpen = $derived(sidecarMenuOpen || sidecar !== null);

  function sidecarMode(nextSidecar = sidecar, nextMenuOpen = sidecarMenuOpen): SidecarMode {
    if (nextSidecar !== null) return 'panel';
    return nextMenuOpen ? 'menu' : 'handle';
  }

  onMount(async () => {
    // The window opens at the raw config size, which can render too tall until a
    // manual compact/expand re-applies the proper logical size. Do that re-apply
    // on startup (same call as expandFromCompact) so it opens at the right size.
    await invoke('toggle_compact', { compact: false, sidecarMode: sidecarMode() });
    await store.load();
    // the default sidecar is VESSEL — don't land on it if the body panels are hidden
    if (!bodyPanels && (sidecar === 'vessel' || sidecar === 'fuel')) sidecar = 'base';
    alwaysOnTop = store.data.settings.pinned ?? true;
    await invoke('set_always_on_top', { onTop: alwaysOnTop });

    // wake the local Ollama server so nutrition estimation just works
    if (store.data.settings.localAiProvider === 'Ollama') void invoke('ensure_ollama', { url: store.data.settings.localAiUrl || 'http://localhost:11434/api/chat' }).catch(() => {});

    // proactive: morning brief + reflection + evening review, in the background
    runProactive();

    // fr13nd's hourly notification — checks often, fires once per hour in waking hours.
    // The daily zodiac read piggybacks on the same cadence; it self-gates to once/day at 9am.
    runHourlyNotify();
    runDailyZodiac();
    setInterval(() => { runHourlyNotify(); runDailyZodiac(); }, 5 * 60 * 1000);

    // keep the clock indicator ticking
    setInterval(() => (clockNow = Date.now()), 30000);

    // wake-from-sleep detector: timers are frozen while the machine sleeps, so a
    // heartbeat that should fire every 4s leaves a big gap on resume. When we see
    // that gap, kick the WebView2 compositor so fr13nd doesn't come back blank.
    let lastBeat = Date.now();
    setInterval(() => {
      const gap = Date.now() - lastBeat;
      lastBeat = Date.now();
      if (gap > 12000) void invoke('wake_repaint').catch(() => {});
    }, 4000);

    await listen('toggle-compact', () => {
      compact = !compact;
      invoke('toggle_compact', { compact, sidecarMode: sidecarMode() });
    });
  });

  async function toggleCompact() {
    compact = !compact;
    await invoke('toggle_compact', { compact, sidecarMode: sidecarMode() });
  }

  async function togglePin() {
    alwaysOnTop = !alwaysOnTop;
    store.data.settings.pinned = alwaysOnTop;
    store.save();
    await invoke('set_always_on_top', { onTop: alwaysOnTop });
  }

  async function expandFromCompact() {
    compact = false;
    await invoke('toggle_compact', { compact: false, sidecarMode: sidecarMode() });
  }

  async function toggleSidecarRail() {
    if (sidecar !== null || sidecarMenuOpen) {
      sidecar = null;
      sidecarMenuOpen = false;
    } else {
      sidecarMenuOpen = true;
    }
    await invoke('set_sidecar_mode', { mode: sidecarMode() });
  }

  async function toggleSidecar(next: Exclude<Sidecar, null>) {
    sidecar = sidecar === next ? null : next;
    sidecarMenuOpen = true;
    await invoke('set_sidecar_mode', { mode: sidecarMode() });
  }
</script>

<svelte:head><title>fr13nd · public edition</title><meta name="description" content="A desktop companion for quests, creative practice, and daily routines. Public edition with fictional demo content." /></svelte:head>

<div class="demo-banner">PUBLIC EDITION · FICTIONAL DEMO DATA · AI OFF BY DEFAULT</div>

{#if compact}
  <CompactMode onExpand={expandFromCompact} />
{:else}
  <div class="desktop-shell" class:daily-alert={missingDailyActivities}>
    <aside class="utility-sidecar" class:rail-open={sidecarRailOpen} class:open={sidecar !== null}>
      <button
        class="sidecar-handle"
        class:open={sidecarRailOpen}
        onclick={toggleSidecarRail}
        title={sidecarRailOpen ? 'close side sections' : 'open side sections'}
      >
        <span>{sidecarRailOpen ? '>' : '<'}</span>
      </button>

      {#if sidecar}
        <div class="sidecar-body mode-{sidecar}">
          {#if store.loaded}
            {#if sidecar === 'base'}
              <BasePanel />
            {:else if sidecar === 'pet'}
              <KittyPanel />
            {:else if sidecar === 'vessel' && bodyPanels}
              <VesselPanel />
            {:else if sidecar === 'cookbook'}
              <CookbookPanel />
            {:else if sidecar === 'fuel' && bodyPanels}
              <FuelPanel />
            {:else if sidecar === 'work'}
              <WorkPanel />
            {:else if sidecar === 'stars'}
              <StarsPanel />
            {:else if sidecar === 'queue'}
              <QueuePanel />
            {:else if sidecar === 'kanji'}
              <KanjiPanel />
            {/if}
          {:else}
            <div class="loading muted">LOADING...</div>
          {/if}
        </div>
      {/if}

      {#if sidecarRailOpen}
        <div class="side-tabs">
        <button
          class="side-tab base-tab"
          class:active={sidecar === 'base'}
          onclick={() => toggleSidecar('base')}
          title={sidecar === 'base' ? 'close base' : 'open base'}
        >
          <span class="tab-mark">H</span>
          <span class="tab-title">BASE</span>
          <span class="tab-count">{baseDone}/{baseTotal}</span>
        </button>
        <button
          class="side-tab pet-tab"
          class:active={sidecar === 'pet'}
          onclick={() => toggleSidecar('pet')}
          title={sidecar === 'pet' ? 'close pet' : 'open pet'}
        >
          <span class="tab-mark">♡</span>
          <span class="tab-title">PET</span>
          <span class="tab-count">{petDailyDone}/{petDaily.length}</span>
        </button>
        {#if bodyPanels}
        <button
          class="side-tab vessel-tab"
          class:active={sidecar === 'vessel'}
          onclick={() => toggleSidecar('vessel')}
          title={sidecar === 'vessel' ? 'close vessel' : 'open vessel'}
        >
          <span class="tab-mark">◇</span>
          <span class="tab-title">VESSEL</span>
          <span class="tab-count">W{vessel.water}</span>
        </button>
        {/if}
        <button
          class="side-tab cookbook-tab"
          class:active={sidecar === 'cookbook'}
          onclick={() => toggleSidecar('cookbook')}
          title={sidecar === 'cookbook' ? 'close cookbook' : 'open cookbook'}
        >
          <span class="tab-mark">CB</span>
          <span class="tab-title">COOKBOOK</span>
          <span class="tab-count">{store.data.recipes.length}</span>
        </button>
        {#if bodyPanels}
        <button
          class="side-tab fuel-tab"
          class:active={sidecar === 'fuel'}
          onclick={() => toggleSidecar('fuel')}
          title={sidecar === 'fuel' ? 'close fuel' : 'open fuel'}
        >
          <span class="tab-mark">⊙</span>
          <span class="tab-title">FUEL</span>
          <span class="tab-count">{fuelKcal}</span>
        </button>
        {/if}
        <button
          class="side-tab work-tab"
          class:active={sidecar === 'work'}
          onclick={() => toggleSidecar('work')}
          title={sidecar === 'work' ? 'close work' : 'open work'}
        >
          <span class="tab-mark">⏱</span>
          <span class="tab-title">WORK</span>
          <span class="tab-count">{fmtHM(workTodayMin)}</span>
        </button>
        <button
          class="side-tab stars-tab"
          class:active={sidecar === 'stars'}
          onclick={() => toggleSidecar('stars')}
          title={sidecar === 'stars' ? 'close stars' : 'open stars'}
        >
          <span class="tab-mark">✦</span>
          <span class="tab-title">STARS</span>
          <span class="tab-count">{starGlyph}</span>
        </button>
        <button
          class="side-tab queue-tab"
          class:active={sidecar === 'queue'}
          onclick={() => toggleSidecar('queue')}
          title={sidecar === 'queue' ? 'close queue' : 'open queue'}
        >
          <span class="tab-mark">▤</span>
          <span class="tab-title">QUEUE</span>
          <span class="tab-count">{queueCount}</span>
        </button>
        <button
          class="side-tab kanji-tab"
          class:active={sidecar === 'kanji'}
          onclick={() => toggleSidecar('kanji')}
          title={sidecar === 'kanji' ? 'close kanji' : 'open kanji'}
        >
          <span class="tab-mark">語</span>
          <span class="tab-title">KANJI</span>
          <span class="tab-count">{kanjiDue}</span>
        </button>
        </div>
      {/if}
    </aside>

    <div class="shell theme-{active}" class:overtime>
      <div class="atmos" aria-hidden="true"></div>
      <!-- titlebar / drag region -->
      <div class="titlebar" data-tauri-drag-region>
        <span class="sigil" data-tauri-drag-region>✦ {store.data.settings.companionName}</span>
        <div class="win-btns">
          <button
            class="clock-btn"
            class:on={clockedIn}
            class:attention={!!workPrompt}
            class:overtime
            onclick={toggleClock}
            title={clockedIn ? 'clock out' : 'clock in'}
          >{#if overtime}🔥 OT {fmtHM(overtimeMin)}{:else if clockedIn}● {fmtHM(sessionMin)}{:else}○ CLOCK IN{/if}</button>
          <button
            class="win-btn"
            class:active={alwaysOnTop}
            onclick={togglePin}
            title="toggle always-on-top"
          >{alwaysOnTop ? 'PIN' : 'TOP'}</button>
          <button class="win-btn" onclick={toggleCompact} title="compact mode">_</button>
        </div>
      </div>

      <!-- ritual status strip -->
      {#if store.data.ritual.mood || store.data.ritual.focus}
        <div class="ritual-strip">
          {#if store.data.ritual.mood}
            <span class="rs-item"><span class="muted">mood</span> {store.data.ritual.mood}</span>
          {/if}
          {#if store.data.ritual.focus}
            <span class="rs-item"><span class="muted">focus</span> {store.data.ritual.focus}</span>
          {/if}
          <div class="energy-dots">
            {#each [1,2,3,4,5] as n}
              <span class="dot" class:lit={store.data.ritual.energy >= n}>●</span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- nav -->
      <nav class="nav">
        {#each NAV as item}
          <button
            class="nav-btn"
            class:active={active === item.id}
            onclick={() => active = item.id}
          >[{item.label}]</button>
        {/each}
      </nav>

      <hr class="divider" />

      {#if store.loaded && overtime}
        <button class="work-prompt overtime-bar" onclick={toggleClock}>
          <span class="wp-dot">🔥</span>
          <span class="wp-text">{overtimeLine} +{fmtHM(overtimeMin)} 🔥</span>
          <span class="wp-go">[CLOCK OUT]</span>
        </button>
      {:else if store.loaded && workPrompt}
        <button class="work-prompt" class:out={workPrompt === 'out'} onclick={toggleClock}>
          <span class="wp-dot">⏱</span>
          <span class="wp-text">{workPrompt === 'in' ? 'work hours — clock in?' : `${overtimeLine} 🔥`}</span>
          <span class="wp-go">{workPrompt === 'in' ? '[CLOCK IN]' : '[CLOCK OUT]'}</span>
        </button>
      {/if}

      {#if store.loaded && dailyNudges.length > 0}
        <button class="nudge-bar" onclick={() => active = 'agent'} title="open {store.data.settings.companionName}">
          <span class="nudge-sigil">✦</span>
          <span class="nudge-text">{dailyNudges.join(' · ')}</span>
          <span class="nudge-go">{store.data.settings.companionName} ›</span>
        </button>
      {/if}

      {#if store.loaded}
        <CaptureBar />
      {/if}

      <div class="workbench">
        <!-- panel content -->
        <div class="content page-{active}">
          {#if !store.loaded}
            <div class="loading muted">LOADING...</div>
          {:else if active === 'quests'}
            <QuestPanel />
          {:else if active === 'craft'}
            <CraftPanel />
          {:else if active === 'agent'}
            <AgentPanel />
          {:else if active === 'signal'}
            <SignalPanel />
          {:else if active === 'lyrics'}
            <LyricsPanel />
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .demo-banner { padding: 8px 12px; background: #151c25; color: #92e8d0; font: 10px monospace; letter-spacing: 1px; text-align: center; }
  .desktop-shell {
    --main-width: 546px;
    --utility-width: 442px;
    --utility-tabs-width: 72px;
    width: 100vw;
    height: 100vh;
    position: relative;
    /* The unused rail area must stay transparent when the rail is collapsed. */
    background: transparent;
    overflow: hidden;
  }

  .shell {
    --shell-accent: var(--ink);
    --shell-angle: 135deg;
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: var(--main-width);
    flex-shrink: 0;
    background:
      radial-gradient(118% 68% at 7% -12%, color-mix(in srgb, var(--shell-accent) 22%, transparent), transparent 58%),
      radial-gradient(78% 54% at 104% 108%, color-mix(in srgb, var(--shell-accent) 14%, transparent), transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--shell-accent) 7%, transparent), transparent 37%),
      var(--void);
    border: 1px solid var(--line);
    overflow: hidden;
    isolation: isolate;
    box-shadow:
      0 0 0 1px var(--void),
      0 18px 50px rgba(0, 0, 0, 0.55),
      inset 0 0 42px color-mix(in srgb, var(--shell-accent) 5%, transparent);
  }

  /* ── atmosphere ─────────────────────────────────────────────── */
  .atmos {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(130% 90% at 28% 16%, color-mix(in srgb, var(--shell-accent) 16%, transparent), transparent 58%),
      radial-gradient(120% 80% at 82% 102%, color-mix(in srgb, var(--shell-accent) 11%, transparent), transparent 60%);
    animation: atmos-drift 16s ease-in-out infinite alternate;
  }
  @keyframes atmos-drift {
    0%   { transform: translate3d(-3%, -2%, 0) scale(1.06); opacity: 0.6; }
    100% { transform: translate3d(3%, 2%, 0) scale(1.16); opacity: 1; }
  }

  /* faint CRT scanlines on top of everything (clicks pass through) */
  .shell::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.10) 0 1px, transparent 1px 3px);
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    .atmos { animation: none; }
  }

  .theme-quests { --shell-accent: var(--ink); --shell-angle: 135deg; }
  .theme-craft { --shell-accent: var(--red); --shell-angle: 135deg; }
  .theme-agent { --shell-accent: var(--violet); --shell-angle: 135deg; }
  .theme-signal { --shell-accent: var(--teal); --shell-angle: 135deg; }
  .theme-lyrics { --shell-accent: var(--gold); --shell-angle: 135deg; }

  .desktop-shell.daily-alert .shell {
    border-color: var(--red);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--red) 58%, transparent),
      0 0 18px color-mix(in srgb, var(--red) 34%, transparent),
      inset 0 0 16px color-mix(in srgb, var(--red) 10%, transparent);
  }

  .desktop-shell.daily-alert .utility-sidecar.open .sidecar-body {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--red) 48%, transparent),
      0 14px 30px rgba(0, 0, 0, 0.55),
      0 0 18px color-mix(in srgb, var(--red) 22%, transparent);
  }

  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    height: 28px;
    background: color-mix(in srgb, var(--shell-accent) 4%, var(--panel));
    border-bottom: 1px solid color-mix(in srgb, var(--shell-accent) 24%, var(--line));
    flex-shrink: 0;
  }
  .sigil {
    font-size: 11px;
    color: var(--gold);
    letter-spacing: 0.05em;
    animation: sigil-pulse 3.6s ease-in-out infinite;
  }
  @keyframes sigil-pulse {
    0%, 100% { text-shadow: 0 0 4px color-mix(in srgb, var(--gold) 35%, transparent); }
    50%      { text-shadow: 0 0 11px color-mix(in srgb, var(--gold) 75%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sigil { animation: none; }
  }
  .win-btns {
    display: flex;
    gap: 4px;
  }
  .win-btn {
    font-size: 12px;
    padding: 0 4px;
    color: var(--muted);
    line-height: 28px;
  }
  .win-btn.active { color: var(--gold); }
  .win-btn:hover  { color: var(--ink); }

  .clock-btn {
    font-size: 9px;
    letter-spacing: 0.04em;
    padding: 0 5px;
    color: var(--muted);
    line-height: 28px;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .clock-btn:hover { color: var(--blue); }
  .clock-btn.on {
    color: var(--blue);
    border-color: color-mix(in srgb, var(--blue) 45%, transparent);
  }
  .clock-btn.attention { animation: clock-attn 1.4s ease-in-out infinite; }
  @keyframes clock-attn {
    50% { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 55%, transparent); }
  }

  .work-prompt {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 5px 10px;
    flex-shrink: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--blue) 36%, var(--line));
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--blue) 11%, transparent) 0 1px, transparent 1px 11px),
      color-mix(in srgb, var(--blue) 7%, transparent);
    color: var(--ink);
    text-align: left;
    animation: wp-pulse 2.2s ease-in-out infinite;
  }
  .work-prompt.out {
    border-bottom-color: color-mix(in srgb, var(--red) 40%, var(--line));
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--red) 11%, transparent) 0 1px, transparent 1px 11px),
      color-mix(in srgb, var(--red) 7%, transparent);
  }
  @keyframes wp-pulse { 50% { filter: brightness(1.22); } }
  .wp-dot { color: var(--blue); font-size: 12px; flex-shrink: 0; }
  .work-prompt.out .wp-dot { color: var(--red); }
  .wp-text { flex: 1; min-width: 0; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wp-go { color: var(--blue); font-size: 9px; font-weight: 700; letter-spacing: 0.05em; flex-shrink: 0; }
  .work-prompt.out .wp-go { color: var(--red); }
  @media (prefers-reduced-motion: reduce) {
    .clock-btn.attention, .work-prompt { animation: none; }
  }

  /* ── overtime: the whole widget gets loud ──────────────────── */
  .clock-btn.overtime {
    color: var(--red);
    border-color: color-mix(in srgb, var(--red) 55%, transparent);
    animation: clock-attn 0.9s ease-in-out infinite;
  }

  .work-prompt.overtime-bar {
    border-bottom-color: color-mix(in srgb, var(--gold) 50%, var(--line));
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--gold) 14%, transparent) 0 1px, transparent 1px 10px),
      color-mix(in srgb, var(--gold) 9%, transparent);
    animation: ot-bar 1.1s ease-in-out infinite;
  }
  @keyframes ot-bar { 50% { filter: brightness(1.35); } }
  .overtime-bar .wp-dot, .overtime-bar .wp-go { color: var(--gold); }

  .shell.overtime {
    border-color: var(--gold);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--gold) 60%, transparent),
      0 0 26px color-mix(in srgb, var(--gold) 34%, transparent),
      inset 0 0 30px color-mix(in srgb, var(--gold) 10%, transparent);
    animation: overtime-pulse 1.7s ease-in-out infinite;
  }
  @keyframes overtime-pulse {
    50% {
      border-color: var(--red);
      box-shadow:
        0 0 0 1px color-mix(in srgb, var(--red) 65%, transparent),
        0 0 34px color-mix(in srgb, var(--red) 44%, transparent),
        inset 0 0 36px color-mix(in srgb, var(--red) 13%, transparent);
    }
  }
  .shell.overtime .atmos {
    background:
      radial-gradient(130% 90% at 28% 16%, color-mix(in srgb, var(--gold) 22%, transparent), transparent 56%),
      radial-gradient(120% 80% at 82% 102%, color-mix(in srgb, var(--red) 18%, transparent), transparent 58%);
  }

  @media (prefers-reduced-motion: reduce) {
    .shell.overtime, .clock-btn.overtime, .work-prompt.overtime-bar { animation: none; }
  }

  .ritual-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 8px;
    background: color-mix(in srgb, var(--shell-accent) 6%, var(--panel2));
    border-bottom: 1px solid color-mix(in srgb, var(--shell-accent) 18%, var(--line));
    font-size: 10px;
    flex-shrink: 0;
  }
  .rs-item { display: flex; gap: 4px; }
  .energy-dots { display: flex; gap: 2px; margin-left: auto; }
  .dot      { font-size: 9px; color: var(--line); }
  .dot.lit  { color: var(--gold); }

  .nav {
    display: flex;
    padding: 4px 6px;
    gap: 2px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--shell-accent) 3%, transparent);
  }
  .nav-btn {
    font-size: 10px;
    padding: 2px 6px;
    color: var(--muted);
    letter-spacing: 0.06em;
    border: 1px solid transparent;
  }
  .nav-btn.active {
    color: var(--shell-accent);
    border-color: var(--shell-accent);
  }
  .nav-btn:hover:not(.active) {
    color: var(--ink);
  }

  .workbench {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    overflow: hidden;
  }

  .content {
    flex: 1;
    min-width: 0;
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(118% 72% at 0% 0%, color-mix(in srgb, var(--page-accent) 17%, transparent), transparent 54%),
      radial-gradient(86% 68% at 108% 108%, color-mix(in srgb, var(--page-accent) 10%, transparent), transparent 73%),
      linear-gradient(180deg, color-mix(in srgb, var(--page-accent) 6%, transparent), transparent 46%),
      var(--void);
  }

  .content::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    border-top: 1px solid color-mix(in srgb, var(--page-accent) 30%, transparent);
    opacity: 1;
    box-shadow: inset 0 34px 52px -42px color-mix(in srgb, var(--page-accent) 75%, transparent);
  }

  .content > :global(.panel),
  .content > .loading {
    position: relative;
    z-index: 1;
  }

  .page-quests {
    --page-accent: var(--ink);
  }

  .page-craft {
    --page-accent: var(--red);
  }

  .page-agent {
    --page-accent: var(--violet);
  }

  .page-signal {
    --page-accent: var(--teal);
  }

  .utility-sidecar {
    width: 34px;
    position: absolute;
    top: 0;
    right: var(--main-width);
    bottom: 0;
    background: transparent;
    transition: width 0.16s ease;
  }

  .utility-sidecar.rail-open {
    width: var(--utility-tabs-width);
  }

  .utility-sidecar.open {
    width: var(--utility-width);
  }

  .utility-sidecar.rail-open::before {
    content: "";
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(180deg, transparent, var(--gold), transparent);
    opacity: 0.5;
  }

  .sidecar-handle {
    position: absolute;
    right: 0;
    bottom: 42px;
    width: 34px;
    height: 48px;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--gold);
    border-right: none;
    background: var(--panel);
    color: var(--gold);
    box-shadow: 0 0 0 1px var(--void);
  }

  .sidecar-handle.open {
    color: var(--void);
    background: var(--gold);
  }

  .sidecar-handle span {
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
  }

  .sidecar-body {
    position: absolute;
    left: 0;
    right: var(--utility-tabs-width);
    top: 44px;
    bottom: 38px;
    overflow: hidden;
    border: 1px solid var(--side-accent);
    background: linear-gradient(180deg, var(--side-tint), var(--void) 40%);
    box-shadow: 0 0 0 1px var(--void), 0 14px 30px rgba(0, 0, 0, 0.55);
  }

  .utility-sidecar.open .sidecar-body {
    animation: sidecar-arrive 0.22s ease-out both;
  }

  @keyframes sidecar-arrive {
    from { transform: translateX(-10px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .utility-sidecar.open .sidecar-body { animation: none; }
  }

  .mode-base {
    --side-accent: var(--teal);
    --side-tint: color-mix(in srgb, var(--teal) 10%, var(--void));
  }

  .mode-pet {
    --side-accent: var(--rose);
    --side-tint: color-mix(in srgb, var(--rose) 11%, var(--void));
  }

  .mode-vessel {
    --side-accent: var(--violet);
    --side-tint: color-mix(in srgb, var(--violet) 11%, var(--void));
  }

  .mode-cookbook {
    --side-accent: var(--gold);
    --side-tint: color-mix(in srgb, var(--gold) 9%, var(--void));
  }

  .mode-fuel {
    --side-accent: var(--green);
    --side-tint: color-mix(in srgb, var(--green) 9%, var(--void));
  }

  .mode-work {
    --side-accent: var(--blue);
    --side-tint: color-mix(in srgb, var(--blue) 9%, var(--void));
  }

  .mode-stars {
    --side-accent: var(--gold);
    --side-tint: color-mix(in srgb, var(--gold) 9%, var(--void));
  }

  .mode-queue {
    --side-accent: var(--fuchsia);
    --side-tint: color-mix(in srgb, var(--fuchsia) 10%, var(--void));
  }

  .mode-kanji {
    --side-accent: var(--red);
    --side-tint: color-mix(in srgb, var(--red) 10%, var(--void));
  }

  .side-tabs {
    position: absolute;
    right: 0;
    bottom: 96px;
    width: var(--utility-tabs-width);
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
  }

  .side-tab {
    --tab-accent: var(--gold);
    position: relative;
    min-height: 58px;
    width: var(--utility-tabs-width);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 2px;
    border: 1px solid var(--tab-accent);
    border-right: none;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--tab-accent) 18%, transparent), transparent 55%),
      var(--panel);
    color: var(--tab-accent);
    box-shadow: 0 0 0 1px var(--void);
  }

  .side-tab.active {
    background: var(--tab-accent);
    color: var(--void);
  }

  .side-tab:hover {
    filter: brightness(1.2);
  }

  .base-tab { --tab-accent: var(--teal); }
  .pet-tab { --tab-accent: var(--rose); }
  .vessel-tab { --tab-accent: var(--violet); }
  .cookbook-tab { --tab-accent: var(--gold); }
  .fuel-tab { --tab-accent: var(--green); }
  .work-tab { --tab-accent: var(--blue); }
  .stars-tab { --tab-accent: var(--gold); }
  .queue-tab { --tab-accent: var(--fuchsia); }
  .kanji-tab { --tab-accent: var(--red); }

  .tab-mark {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    border: 1px solid currentColor;
    padding: 1px 3px;
  }

  .tab-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    writing-mode: horizontal-tb;
    transform: none;
    white-space: nowrap;
  }

  .tab-count {
    font-size: 9px;
    color: inherit;
    white-space: nowrap;
  }

  .utility-sidecar.open .side-tabs {
    bottom: 96px;
  }

  .utility-sidecar.open .side-tab.active {
    width: var(--utility-tabs-width);
  }

  .utility-sidecar.open .side-tab.active::after {
    content: "";
    position: absolute;
    left: -10px;
    top: 50%;
    width: 10px;
    height: 1px;
    background: currentColor;
  }

  .loading {
    padding: 24px;
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.1em;
  }

  .nudge-bar {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 4px 10px;
    flex-shrink: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--gold) 30%, var(--line));
    background: color-mix(in srgb, var(--gold) 6%, transparent);
    font-family: var(--font);
    text-align: left;
  }
  .nudge-bar:hover { background: color-mix(in srgb, var(--gold) 12%, transparent); }
  .nudge-sigil { color: var(--gold); font-size: 11px; flex-shrink: 0; }
  .nudge-text {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nudge-go { color: var(--gold); font-size: 9px; letter-spacing: 0.06em; flex-shrink: 0; }
</style>
