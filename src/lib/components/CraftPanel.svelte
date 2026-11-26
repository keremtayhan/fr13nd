<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { craftNeedKit, defaultCraftQuests, isNonsenseCraftQuestTitle, looksLikeNeedList } from '$lib/craftNeeds';
  import { areaXp, areaLevel, levelInfo, overallLevel } from '$lib/craftLevels';
  import { craftLevelLine, craftCritique } from '$lib/agent';
  import { encodeImageFile, type EncodedImage } from '$lib/images';
  import type { CraftArea, CraftAreaId, CraftQuest } from '$lib/types';
  import { localDay } from '$lib/day';

  const PLACEHOLDERS: Record<CraftAreaId, { project: string; next: string; drill: string; reference: string; blocker: string; session: string }> = {
    music: {
      project: 'track, riff, set, sound palette',
      next: 'record one take, write one hook, arrange one section',
      drill: 'ear, timing, scales, tone, mixing',
      reference: 'artist, song, sound, constraint',
      blocker: 'muddy mix, no chorus, weak rhythm',
      session: 'what changed, what got made, what got practiced',
    },
    game_dev: {
      project: 'prototype, mechanic, level, jam build',
      next: 'one playable interaction',
      drill: 'feel, camera, AI, UI, juice',
      reference: 'game, clip, paper, constraint',
      blocker: 'scope, bug, unclear loop',
      session: 'what changed, what got playable, what got tested',
    },
    modelling: {
      project: 'asset, character, prop, environment',
      next: 'blockout, retopo, material, render',
      drill: 'forms, topology, sculpt, UVs',
      reference: 'board, object, style sheet',
      blocker: 'proportion, topology, material',
      session: 'what changed, what shape/material/topology improved',
    },
    drawing: {
      project: 'piece, study, page, character',
      next: 'thumbnail, values, line pass, color pass',
      drill: 'gesture, hands, anatomy, light',
      reference: 'pose, artist, object, palette',
      blocker: 'stiff pose, weak values, fear',
      session: 'what changed, what study/page/pass happened',
    },
    animating: {
      project: 'shot, loop, acting beat, motion test',
      next: 'keys, breakdowns, timing, cleanup',
      drill: 'spacing, arcs, weight, smear',
      reference: 'clip, timing chart, acting ref',
      blocker: 'floaty motion, unclear pose',
      session: 'what changed, what motion/timing got clearer',
    },
    coding: {
      project: 'app, system, tool, feature',
      next: 'small patch, failing test, refactor slice',
      drill: 'types, architecture, testing, UI',
      reference: 'docs, issue, pattern, repo note',
      blocker: 'unknown API, messy boundary, bug',
      session: 'what changed, what shipped, what bug moved',
    },
    gym: {
      project: 'program, block, lift, conditioning',
      next: 'next session, warmup, main lift',
      drill: 'form, mobility, weak point, cardio',
      reference: 'routine, cue, video, target',
      blocker: 'sleep, soreness, pain, time',
      session: 'sets, reps, weight, walk, mobility, pain notes',
    },
    reading: {
      project: 'book, series, paper, long article',
      next: 'one chapter, 20 pages, one section',
      drill: 'notes, highlights, recall, vocabulary',
      reference: 'reading list, author, recommendation',
      blocker: 'phone pulls, dense chapter, no time slot',
      session: 'what you read, pages/chapters, one idea that stuck',
    },
  };

  const MODES = ['make', 'practice', 'study', 'polish', 'body'] as const;
  type ArchiveFilter = CraftAreaId | 'all';

  let selected = $state<CraftAreaId>(store.data.craft.focus);
  let logMinutes = $state(30);
  let mode = $state<(typeof MODES)[number]>('make');
  let sessionNoteDraft = $state('');
  let savedAction = $state<'session' | null>(null);
  let sessionOpen = $state(false);
  let archiveOpen = $state(false);
  let archiveFilter = $state<ArchiveFilter>('all');
  let repairedBadCraftQuests = $state(false);

  // show fr13nd your work → vision critique
  let showFileEl = $state<HTMLInputElement | null>(null);
  let critiquing = $state(false);
  let critiqueText = $state('');
  let critiqueImg = $state<EncodedImage | null>(null);

  const todayKey = localDay();
  const todayValue = new Date(`${todayKey}T00:00:00`).getTime();
  const weekFloor = todayValue - 6 * 86400000;

  const activeArea = $derived(
    store.data.craft.areas.find((area) => area.id === selected) ?? store.data.craft.areas[0]
  );

  const copy = $derived(PLACEHOLDERS[activeArea.id]);

  function dayValue(at: string) {
    return new Date(`${at.slice(0, 10)}T00:00:00`).getTime();
  }

  function todayMinutesFor(area: CraftArea) {
    return area.sessions
      .filter((session) => session.at.slice(0, 10) === todayKey)
      .reduce((sum, session) => sum + session.minutes, 0);
  }

  function weekMinutesFor(area: CraftArea) {
    return area.sessions
      .filter((session) => {
        const value = dayValue(session.at);
        return value >= weekFloor && value <= todayValue;
      })
      .reduce((sum, session) => sum + session.minutes, 0);
  }

  const areaStats = $derived(
    store.data.craft.areas.map((area) => {
      const today = todayMinutesFor(area);
      const lvl = levelInfo(areaXp(area));
      return {
        area,
        today,
        week: weekMinutesFor(area),
        progress: Math.min(100, Math.round((today / Math.max(1, area.targetMinutes)) * 100)),
        level: lvl.level,
        into: lvl.into,
        span: lvl.span,
        lvlPct: lvl.pct,
      };
    })
  );
  const overall = $derived(overallLevel(store.data.craft));
  const activeStat = $derived(areaStats.find((stat) => stat.area.id === activeArea.id) ?? areaStats[0]);

  const activeToday = $derived(todayMinutesFor(activeArea));
  const todayTotal = $derived(areaStats.reduce((sum, stat) => sum + stat.today, 0));
  const weekTotal = $derived(areaStats.reduce((sum, stat) => sum + stat.week, 0));
  const questRows = $derived.by(() =>
    [...activeArea.quests].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.createdAt.localeCompare(b.createdAt);
    })
  );
  const completedQuestCount = $derived(activeArea.quests.filter((item) => item.completed).length);
  const openQuestCount = $derived(activeArea.quests.length - completedQuestCount);
  const sessionRows = $derived.by(() =>
    activeArea.sessions
      .map((session) => ({ ...session, areaId: activeArea.id, areaTitle: activeArea.title }))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8)
  );
  const archiveRows = $derived.by(() =>
    store.data.craft.areas
      .flatMap((area) => area.sessions.map((session) => ({ ...session, areaId: area.id, areaTitle: area.title })))
      .filter((session) => archiveFilter === 'all' || session.areaId === archiveFilter)
      .sort((a, b) => b.at.localeCompare(a.at))
  );

  $effect(() => {
    if (store.data.craft.focus !== selected) {
      selected = store.data.craft.focus;
    }
  });

  $effect(() => {
    if (!store.loaded || repairedBadCraftQuests) return;
    repairedBadCraftQuests = true;
    repairCraftQuests();
  });

  // craft leveling — celebrate when an area (or overall) ranks up
  let levelUp = $state<{ label: string; level: number; line: string } | null>(null);
  let baselined = false;
  $effect(() => {
    if (!store.loaded || baselined) return;
    baselined = true;
    checkLevelUps(); // record current levels as the baseline; don't celebrate retroactively
  });
  function checkLevelUps() {
    const craft = store.data.craft;
    const seen = (craft.levelsSeen ??= {});
    const checks = [
      ...craft.areas.map((a) => ({ key: a.id, label: a.title, level: areaLevel(a).level })),
      { key: 'overall', label: 'CRAFT', level: overallLevel(craft).level },
    ];
    let changed = false;
    let up: { label: string; level: number } | null = null;
    for (const c of checks) {
      if (seen[c.key] === undefined) { seen[c.key] = c.level; changed = true; continue; }
      if (c.level > seen[c.key]) { seen[c.key] = c.level; changed = true; up = { label: c.label, level: c.level }; }
    }
    if (changed) store.save();
    if (up) fireLevelUp(up.label, up.level);
  }
  async function fireLevelUp(label: string, level: number) {
    levelUp = { label, level, line: '' };
    setTimeout(() => { if (levelUp?.label === label && levelUp.level === level) levelUp = null; }, 7000);
    const line = await craftLevelLine(label, level);
    if (line && levelUp?.label === label && levelUp.level === level) levelUp = { ...levelUp, line };
  }

  function selectArea(id: CraftAreaId) {
    selected = id;
    store.data.craft.focus = id;
    store.data.craft.updated = store.nowString();
    store.save();
  }

  function flashSaved(action: 'session') {
    savedAction = action;
    setTimeout(() => {
      if (savedAction === action) savedAction = null;
    }, 900);
  }

  function openSessionWriter() {
    logMinutes = activeArea.targetMinutes;
    sessionNoteDraft = '';
    sessionOpen = true;
  }

  function openArchive(filter: ArchiveFilter = activeArea.id) {
    archiveFilter = filter;
    archiveOpen = true;
  }

  async function onShowFile(e: Event) {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    if (store.data.settings.localAiProvider !== 'Claude') {
      critiqueImg = null;
      critiqueText = '⚠ fr13nd can only see images on the Claude backend — switch BACKEND in AGENT [CFG].';
      return;
    }
    const enc = await encodeImageFile(file);
    if (!enc) return;
    critiqueImg = enc;
    critiqueText = '';
    critiquing = true;
    try {
      const out = await craftCritique({ area: activeArea.title, focus: activeArea.nextAction || activeArea.edge || '', image: enc });
      critiqueText = out || '⚠ no reply — check the Claude backend in AGENT [CFG].';
    } catch (err) {
      critiqueText = '⚠ ' + (err instanceof Error ? err.message : String(err));
    } finally {
      critiquing = false;
    }
  }
  function logCritiqueSession() {
    sessionNoteDraft = critiqueText.replace(/\s+/g, ' ').slice(0, 500);
    logMinutes = activeArea.targetMinutes;
    mode = 'make';
    critiqueImg = null;
    critiqueText = '';
    sessionOpen = true;
  }
  function closeCritique() {
    critiqueImg = null;
    critiqueText = '';
    critiquing = false;
  }

  function logSession() {
    const minutes = Math.max(1, Math.round(Number(logMinutes) || activeArea.targetMinutes));
    activeArea.sessions = [...activeArea.sessions, {
      id: store.newId(),
      at: store.nowString(),
      minutes,
      energy: 3,
      mode,
      note: sessionNoteDraft.trim(),
    }];
    store.data.craft.updated = store.nowString();
    store.save();
    checkLevelUps();
    sessionNoteDraft = '';
    sessionOpen = false;
    flashSaved('session');
  }

  function deleteSession(areaId: CraftAreaId, id: string) {
    const area = store.data.craft.areas.find((item) => item.id === areaId);
    if (!area) return;
    area.sessions = area.sessions.filter((session) => session.id !== id);
    store.data.craft.updated = store.nowString();
    store.save();
  }

  function toggleQuest(id: string) {
    const quest = activeArea.quests.find((item) => item.id === id);
    if (!quest) return;
    activeArea.quests = activeArea.quests.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    store.data.craft.updated = store.nowString();
    store.save();
    checkLevelUps();
  }

  function deleteQuest(id: string) {
    activeArea.quests = activeArea.quests.filter((item) => item.id !== id);
    store.data.craft.updated = store.nowString();
    store.save();
  }

  function questNeed(quest: { title: string; requirements?: string; note?: string }) {
    const raw = (quest.requirements || quest.note || '').trim();
    return looksLikeNeedList(raw) ? raw : craftNeedKit(activeArea.id, quest.title);
  }

  function repairNeed(areaId: CraftAreaId, quest: CraftQuest): CraftQuest {
    const raw = (quest.requirements || quest.note || '').trim();
    return looksLikeNeedList(raw) ? quest : { ...quest, requirements: craftNeedKit(areaId, quest.title) };
  }

  function repairCraftQuests() {
    let changed = false;

    for (const area of store.data.craft.areas) {
      const open = area.quests.filter((quest) => !quest.completed);
      const completed = area.quests.filter((quest) => quest.completed).map((quest) => repairNeed(area.id, quest));
      const goodOpen = open
        .filter((quest) => !isNonsenseCraftQuestTitle(quest.title))
        .map((quest) => repairNeed(area.id, quest));
      const hasBadTitle = open.length !== goodOpen.length;
      const hasBadNeed = area.quests.some((quest) => !looksLikeNeedList((quest.requirements || quest.note || '').trim()));

      if (!hasBadTitle && !hasBadNeed) continue;

      const createdAt = store.nowString();
      const replacementOpen = hasBadTitle && goodOpen.length === 0 && open.length > 0
        ? defaultCraftQuests(area.id).map((quest) => ({
            id: store.newId(),
            title: quest.title,
            mode: quest.mode,
            requirements: quest.requirements,
            note: '',
            completed: false,
            createdAt,
          }))
        : goodOpen;

      area.quests = [...replacementOpen, ...completed];
      changed = true;
    }

    if (changed) {
      store.data.craft.updated = store.nowString();
      store.save();
    }
  }
</script>

<div class="panel">
  <div class="topline">
    <span class="label">CRAFT</span>
    <span class="active-name">{activeArea.title}</span>
    <span class="active-lvl" title="{activeArea.title} · level {activeStat.level} · {activeStat.into}/{activeStat.span} xp">LV{activeStat.level}</span>
    <span class="today muted">{todayTotal}m / {weekTotal}m</span>
  </div>
  <div class="overall-row">
    <span class="overall-tag" title="overall craft level {overall.level} · {overall.into}/{overall.span} xp">★ OVERALL · LV{overall.level}</span>
    <div class="overall-bar"><b style={`width:${overall.pct}%`}></b></div>
  </div>

  {#if levelUp}
    <div class="levelup">
      <span class="lu-tag">★ LEVEL UP</span>
      <span class="lu-area">{levelUp.label.toUpperCase()} · LV{levelUp.level}</span>
      {#if levelUp.line}<span class="lu-line">{levelUp.line}</span>{/if}
    </div>
  {/if}

  <div class="area-grid">
    {#each areaStats as stat (stat.area.id)}
      <button class="area-card" class:active={selected === stat.area.id} onclick={() => selectArea(stat.area.id)}>
        <span class="area-title">{stat.area.title}</span>
        <span class="area-lvl">LV{stat.level}</span>
        <span class="area-xp">{stat.into}/{stat.span} xp · {stat.today}m today</span>
        <i><b style={`width:${stat.lvlPct}%`}></b></i>
      </button>
    {/each}
  </div>

  <hr class="divider" />

  <div class="craft-quests">
    <div class="quest-head">
      <span class="muted">CRAFT QUESTS</span>
      <span>{openQuestCount} OPEN / {completedQuestCount} DONE</span>
    </div>
    {#if activeArea.quests.length === 0}
      <div class="quest-empty muted">agent has not set craft quests</div>
    {/if}
    {#each questRows as quest (quest.id)}
      <div class="craft-quest" class:done={quest.completed}>
        <button class="quest-check" onclick={() => toggleQuest(quest.id)}>
          {quest.completed ? '[DONE]' : '[OPEN]'}
        </button>
        <div class="quest-main">
          <div class="quest-title-row">
            <span class="quest-title">{quest.title}</span>
            <span class="quest-mode">{quest.mode}</span>
          </div>
          <span class="quest-requirements"><b>NEED</b> {questNeed(quest)}</span>
        </div>
        <button class="del" onclick={() => deleteQuest(quest.id)}>x</button>
      </div>
    {/each}
  </div>

  <div class="craft-actions">
    <button class="btn btn-gold" class:flash={savedAction === 'session'} onclick={openSessionWriter}>
      {savedAction === 'session' ? '[SAVED]' : '[WRITE SESSION]'}
    </button>
    <button class="btn show-friend" onclick={() => showFileEl?.click()} title="show fr13nd your work for a critique">[SHOW ✦]</button>
    <button class="btn" onclick={() => openArchive(activeArea.id)}>[ARCHIVE]</button>
    <input bind:this={showFileEl} type="file" accept="image/*" style="display:none" onchange={onShowFile} />
  </div>

  <hr class="divider" />

  <div class="session-head">
    <span class="muted">SESSION LOG / {activeToday}m TODAY</span>
    <button class="head-btn" onclick={() => openArchive(activeArea.id)}>[ARCHIVE]</button>
  </div>

  <div class="history">
    {#if sessionRows.length === 0}
      <div class="empty muted">- no sessions yet -</div>
    {/if}

    {#each sessionRows as session (session.id)}
      <div class="session-row">
        <div class="session-main">
          <span class="stamp muted">{session.at} / {session.mode || 'make'}</span>
          <span class="session-note">{session.note || 'showed up'}</span>
        </div>
        <span class="session-meta gold">{session.minutes}m</span>
        <button class="del" onclick={() => deleteSession(session.areaId, session.id)}>x</button>
      </div>
    {/each}
  </div>

  {#if sessionOpen}
    <div class="overlay">
      <div class="modal writer">
        <div class="modal-head">
          <span>LOG {activeArea.title.toUpperCase()}</span>
          <button onclick={() => sessionOpen = false}>[X]</button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span>MINUTES</span>
            <input type="number" bind:value={logMinutes} min="1" max="480" />
          </label>

          <div class="strike-row">
            {#each [15, 30, 45, 60] as amount}
              <button class="strike" class:active={logMinutes === amount} onclick={() => logMinutes = amount}>{amount}</button>
            {/each}
          </div>

          <div class="mode-row">
            {#each MODES as item}
              <button class:active={mode === item} onclick={() => mode = item}>{item}</button>
            {/each}
          </div>

          <textarea bind:value={sessionNoteDraft} rows="8" placeholder={copy.session}></textarea>

          <div class="actions">
            <button class="btn btn-gold" onclick={logSession}>[SAVE LOG]</button>
            <button class="btn" onclick={() => sessionOpen = false}>[CANCEL]</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if critiquing || critiqueText || critiqueImg}
    <div class="overlay">
      <div class="modal critique">
        <div class="modal-head">
          <span>fr13nd SEES · {activeArea.title.toUpperCase()}</span>
          <button onclick={closeCritique}>[X]</button>
        </div>
        <div class="modal-body">
          {#if critiqueImg}<img class="crit-img" src={critiqueImg.url} alt="your work" />{/if}
          {#if critiquing}
            <div class="crit-wait muted">✦ looking at your work…</div>
          {:else if critiqueText}
            <pre class="crit-text">{critiqueText}</pre>
          {/if}
          {#if critiqueText && !critiquing}
            <div class="actions">
              {#if critiqueImg}<button class="btn btn-gold" onclick={logCritiqueSession}>[LOG AS SESSION]</button>{/if}
              <button class="btn" onclick={closeCritique}>[CLOSE]</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if archiveOpen}
    <div class="overlay">
      <div class="modal archive">
        <div class="modal-head">
          <span>CRAFT ARCHIVE</span>
          <button onclick={() => archiveOpen = false}>[X]</button>
        </div>

        <div class="archive-filters">
          <button class:active={archiveFilter === 'all'} onclick={() => archiveFilter = 'all'}>ALL</button>
          {#each store.data.craft.areas as area (area.id)}
            <button class:active={archiveFilter === area.id} onclick={() => archiveFilter = area.id}>{area.title}</button>
          {/each}
        </div>

        <div class="archive-list">
          {#if archiveRows.length === 0}
            <div class="empty muted">- no craft logs -</div>
          {/if}

          {#each archiveRows as session (`${session.areaId}-${session.id}`)}
            <div class="archive-row">
              <div class="session-main">
                <span class="stamp muted">{session.at} / {session.areaTitle} / {session.mode || 'make'}</span>
                <span class="session-note">{session.note || 'showed up'}</span>
              </div>
              <span class="session-meta gold">{session.minutes}m</span>
              <button class="del" onclick={() => deleteSession(session.areaId, session.id)}>x</button>
            </div>
          {/each}
        </div>
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
    position: relative;
  }

  .topline {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 4px;
    flex-shrink: 0;
  }

  .label {
    color: var(--red);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  .active-name {
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .today {
    margin-left: auto;
    font-size: 10px;
  }

  .active-lvl {
    color: var(--gold);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .overall-row {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 8px 5px;
    flex-shrink: 0;
  }
  .overall-tag {
    color: var(--gold);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .overall-bar {
    flex: 1;
    height: 3px;
    background: var(--line);
  }
  .overall-bar b {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--red), var(--gold));
  }
  .levelup {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 8px 6px;
    padding: 5px 8px;
    border: 1px solid var(--gold);
    background: color-mix(in srgb, var(--gold) 14%, transparent);
    animation: lu-glow 0.9s ease-in-out infinite alternate;
    flex-shrink: 0;
  }
  @keyframes lu-glow { to { box-shadow: 0 0 14px color-mix(in srgb, var(--gold) 45%, transparent); } }
  .lu-tag { color: var(--gold); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  .lu-area { color: var(--ink); font-size: 10px; font-weight: 700; }
  .lu-line { color: var(--gold); font-size: 10px; min-width: 0; flex: 1; }

  .area-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 6px 8px;
    flex-shrink: 0;
  }

  .area-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto 3px;
    gap: 3px 4px;
    min-height: 40px;
    padding: 4px 5px;
    border: 1px solid var(--line);
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--red) 5%, transparent) 0 1px, transparent 1px 10px),
      var(--panel);
    text-align: left;
  }

  .area-card.active {
    border-color: var(--red);
    color: var(--red);
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--red) 13%, transparent) 0 1px, transparent 1px 10px),
      color-mix(in srgb, var(--red) 8%, var(--panel));
  }

  .area-title {
    min-width: 0;
    color: var(--ink);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .area-lvl {
    color: var(--gold);
    font-size: 10px;
    font-weight: 700;
    text-align: right;
    align-self: center;
  }
  .area-xp {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .area-card i {
    grid-column: 1 / -1;
    height: 3px;
    background: var(--line);
    overflow: hidden;
  }

  .area-card b {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--red), var(--gold));
  }

  .craft-quests {
    display: flex;
    flex-direction: column;
    max-height: 270px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .quest-head {
    display: flex;
    justify-content: space-between;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
    color: var(--gold);
    font-size: 9px;
    letter-spacing: 0.1em;
  }

  .quest-empty {
    padding: 7px 8px;
    border-bottom: 1px solid var(--line);
    font-size: 10px;
  }

  .craft-quest {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 6px;
    align-items: start;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--gold) 5%, transparent) 0 1px, transparent 1px 10px),
      transparent;
  }

  .craft-quest.done .quest-title {
    color: var(--muted);
    text-decoration: line-through;
  }

  .quest-check {
    color: var(--gold);
    font-size: 9px;
    line-height: 1.3;
    text-align: left;
    padding-top: 1px;
  }

  .quest-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .quest-title-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
  }

  .quest-title {
    color: var(--ink);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quest-mode {
    color: var(--red);
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .quest-requirements {
    color: var(--muted);
    font-size: 9px;
    line-height: 1.35;
  }

  .quest-requirements b {
    color: var(--gold);
    font-weight: 700;
    letter-spacing: 0.1em;
    margin-right: 3px;
  }

  .craft-actions {
    display: flex;
    gap: 6px;
    padding: 7px 8px;
    border-top: 1px solid var(--line);
    flex-shrink: 0;
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--red) 8%, transparent) 0 1px, transparent 1px 11px),
      color-mix(in srgb, var(--red) 4%, transparent);
  }

  .field {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
  }

  .field span {
    color: var(--muted);
    font-size: 9px;
    letter-spacing: 0.09em;
  }

  .strike-row,
  .mode-row,
  .actions,
  .session-head {
    display: flex;
    align-items: center;
  }

  .strike-row,
  .mode-row {
    gap: 5px;
  }

  .strike {
    width: 32px;
    height: 22px;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 10px;
  }

  .strike.active,
  .mode-row button.active {
    border-color: var(--red);
    color: var(--red);
    background: color-mix(in srgb, var(--red) 13%, transparent);
  }

  .mode-row button {
    flex: 1;
    height: 21px;
    border: 1px solid var(--line);
    font-size: 9px;
    color: var(--muted);
  }

  .actions {
    gap: 6px;
  }

  .flash {
    background: var(--red);
    border-color: var(--red);
    color: var(--void);
  }

  .session-head {
    justify-content: space-between;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
    font-size: 9px;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }

  .head-btn {
    color: var(--gold);
    font-size: 9px;
    letter-spacing: 0.08em;
  }

  .history {
    flex: 1;
    overflow-y: auto;
  }

  .session-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 7px;
    align-items: center;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    background:
      repeating-linear-gradient(135deg, rgba(255, 93, 115, 0.08) 0 1px, transparent 1px 11px),
      rgba(7, 7, 10, 0.82);
  }

  .modal {
    width: 100%;
    max-height: 100%;
    border: 1px solid var(--red);
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--red) 8%, transparent) 0 1px, transparent 1px 11px),
      var(--void);
    box-shadow:
      0 0 0 1px var(--void),
      0 16px 32px rgba(0, 0, 0, 0.72),
      inset 0 0 20px color-mix(in srgb, var(--red) 8%, transparent);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .writer {
    max-width: 380px;
  }

  .archive {
    height: 100%;
  }

  .modal-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-bottom: 1px solid var(--line);
    color: var(--gold);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .modal-head span {
    flex: 1;
  }

  .modal-head button {
    color: var(--red);
    font-size: 10px;
  }

  .modal-body {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    overflow-y: auto;
  }

  .archive-filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 7px 8px;
    border-bottom: 1px solid var(--line);
  }

  .archive-filters button {
    min-width: 0;
    height: 22px;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archive-filters button.active {
    border-color: var(--red);
    color: var(--red);
    background: color-mix(in srgb, var(--red) 12%, transparent);
  }

  .archive-list {
    flex: 1;
    overflow-y: auto;
  }

  .archive-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 7px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }

  .session-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .stamp {
    font-size: 9px;
  }

  .session-note {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-meta {
    font-size: 10px;
    flex-shrink: 0;
  }

  .del {
    color: var(--line);
    font-size: 12px;
  }

  .del:hover {
    color: var(--red);
  }

  .empty {
    padding: 16px;
    text-align: center;
    font-size: 11px;
  }

  .show-friend { color: var(--gold); }
  .critique { max-width: 420px; }
  .crit-img { width: 100%; max-height: 240px; object-fit: contain; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.3); }
  .crit-text { margin: 0; white-space: pre-wrap; color: var(--ink); font-size: 11px; line-height: 1.5; }
  .crit-wait { padding: 14px; text-align: center; font-size: 11px; }
</style>
