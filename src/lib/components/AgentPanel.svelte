<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { isDesktop } from '$lib/runtime';
  import { craftNeedKit, defaultCraftQuests, looksLikeNeedList } from '$lib/craftNeeds';
  import { buildAgentSystem, buildWeeklyDigest, chatWithTools, getCraftArea, type ChatMessage } from '$lib/agent';
  import { encodeImageFile } from '$lib/images';
  import type { AgentAdvice, ConversationTurn, CraftAreaId } from '$lib/types';
  import AsciiEye from '$lib/components/AsciiEye.svelte';

  let input   = $state('');
  let busy    = $state(false);
  let error   = $state('');
  let streamingText = $state('');
  let listEl  = $state<HTMLElement | null>(null);
  let cfgOpen = $state(false);

  // images the operator is about to show fr13nd (cleared on send). Thumbnails only,
  // never written to disk — the eye sees them, the durable data file stays lean.
  type Pending = { id: string; url: string; media: string; data: string };
  let pending = $state<Pending[]>([]);
  let fileEl = $state<HTMLInputElement | null>(null);
  // in-memory map of turn timestamp -> thumbnail data URLs, so shown images stay
  // visible for the rest of the session without bloating the saved transcript.
  let imagesByTurn = $state<Record<string, string[]>>({});

  let cfgPersona  = $state('');
  let cfgModel    = $state('');
  let cfgUrl      = $state('');
  let cfgName     = $state('');
  let cfgProfile  = $state('');
  let cfgNotes    = $state('');
  let cfgProvider = $state('Claude');
  let cfgKey      = $state('');
  let cfgClaudeModel = $state('');
  let cfgBody     = $state<'on' | 'quiet' | 'off'>('quiet');
  let cfgAlarm    = $state(false);
  let cfgGaps     = $state(true);
  let cfgPings    = $state(true);

  // data safety: export + restore from rolling backups
  let backups = $state<{ file: string; label: string; modified: number; bytes: number }[]>([]);
  let confirmFile = $state<string | null>(null);
  let dataMsg = $state('');
  async function loadBackups() {
    backups = await store.listBackups();
    dataMsg = backups.length ? `${backups.length} backup${backups.length === 1 ? '' : 's'} on disk` : 'no backups yet';
  }
  async function doExport() {
    dataMsg = 'exporting…';
    try { dataMsg = '✓ exported → ' + (await store.exportData()); }
    catch (e) { dataMsg = '⚠ export failed: ' + (e instanceof Error ? e.message : String(e)); }
  }
  async function doRestore(file: string) {
    confirmFile = null;
    dataMsg = 'restoring…';
    try { await store.restoreFromBackup(file); dataMsg = '✓ restored from ' + file; await loadBackups(); }
    catch (e) { dataMsg = '⚠ restore failed: ' + (e instanceof Error ? e.message : String(e)); }
  }
  function relTime(secs: number) {
    const d = Date.now() / 1000 - secs;
    if (d < 90) return 'just now';
    if (d < 3600) return Math.round(d / 60) + 'm ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    return Math.round(d / 86400) + 'd ago';
  }

  function openCfg() {
    cfgPersona = store.data.settings.agentPersonality;
    cfgModel   = store.data.settings.localAiModel;
    cfgUrl     = store.data.settings.localAiUrl;
    cfgName    = store.data.settings.companionName;
    cfgProfile = store.data.agentMemory.profile.join('\n');
    cfgNotes   = store.data.agentMemory.notes.join('\n');
    cfgProvider = store.data.settings.localAiProvider || 'Claude';
    cfgKey      = store.data.settings.anthropicApiKey;
    cfgClaudeModel = store.data.settings.anthropicModel || 'claude-opus-4-8';
    cfgBody    = store.data.settings.bodyTracking ?? 'quiet';
    cfgAlarm   = store.data.settings.alarmBorder ?? false;
    cfgGaps    = store.data.settings.showDailyGaps ?? true;
    cfgPings   = store.data.settings.hourlyPings ?? true;
    cfgOpen    = true;
    confirmFile = null;
    dataMsg = '';
    loadBackups();
  }

  function saveCfg() {
    store.data.settings.agentPersonality = cfgPersona.trim();
    store.data.settings.localAiModel     = cfgModel.trim();
    store.data.settings.localAiUrl       = cfgUrl.trim();
    store.data.settings.companionName    = cfgName.trim();
    store.data.agentMemory.profile = cfgProfile.split('\n').map(s => s.trim()).filter(Boolean);
    store.data.agentMemory.notes   = cfgNotes.split('\n').map(s => s.trim()).filter(Boolean);
    store.data.settings.localAiProvider = isDesktop() ? cfgProvider : 'Off';
    store.data.settings.anthropicApiKey = isDesktop() ? cfgKey.trim() : '';
    store.data.settings.anthropicModel  = cfgClaudeModel.trim() || 'claude-opus-4-8';
    store.data.settings.bodyTracking    = cfgBody;
    store.data.settings.alarmBorder     = cfgAlarm;
    store.data.settings.showDailyGaps   = cfgGaps;
    store.data.settings.hourlyPings     = cfgPings;
    store.data.agentMemory.updated = store.nowString();
    store.save();
    cfgOpen = false;
    reloadAgent(); // re-engage fr13nd so the new persona / model / backend takes effect now
  }

  const turns = $derived(store.data.agentMemory.recentConversations.slice(-12));
  const activeModel = $derived(
    store.data.settings.localAiProvider === 'Claude'
      ? store.data.settings.anthropicModel
      : store.data.settings.localAiProvider === 'Ollama'
        ? store.data.settings.localAiModel
        : 'OFF'
  );
  const memoryCount = $derived(
    store.data.agentMemory.profile.length + store.data.agentMemory.notes.length + store.data.agentMemory.patterns.length
  );
  const lastSync = $derived(store.data.agentMemory.updated || 'awaiting first transmission');

  function isMetaTurn(turn: ConversationTurn): boolean {
    return /^\[(morning sync|evening review|compact next step|config reloaded)\]$/i.test(turn.user.trim());
  }

  async function scrollThread(behavior: ScrollBehavior = 'auto') {
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight, behavior });
  }

  onMount(() => {
    scrollThread();
  });

  $effect(() => {
    turns.length;
    busy;
    error;
    cfgOpen;
    if (!cfgOpen) scrollThread();
  });

  // ── craft-quest fallback (when the model writes prose instead of actions) ──
  function inferCraftAreaFromText(text: string): CraftAreaId {
    const lower = text.toLowerCase();
    if (/\bgame\s*dev\b|\bgame\s*development\b|\bgames?\b/.test(lower)) return 'game_dev';
    if (/\bmodel(l)?ing\b|\bmodel\b/.test(lower)) return 'modelling';
    if (/\banimat(e|ing|ion)\b/.test(lower)) return 'animating';
    if (/\bdraw(ing)?\b/.test(lower)) return 'drawing';
    if (/\bcode|coding|programming\b/.test(lower)) return 'coding';
    if (/\bgym|fitness|workout|body\b/.test(lower)) return 'gym';
    if (/\bmusic|track|song|riff|loop\b/.test(lower)) return 'music';
    return store.data.craft.focus;
  }

  function modeFromTitle(title: string, areaId: CraftAreaId): string {
    const lower = title.toLowerCase();
    if (areaId === 'gym') return 'body';
    if (/\bstudy|reference|analy[sz]e|read\b/.test(lower)) return 'study';
    if (/\bpractice|drill|gesture|warmup|warm up\b/.test(lower)) return 'practice';
    if (/\bfix|clean|polish|refine|repair\b/.test(lower)) return 'polish';
    return 'make';
  }

  function looksLikeCraftQuest(text: string, areaId: CraftAreaId): boolean {
    const lower = text.toLowerCase();
    if (/^(set|create|generate|give|make)\s+craft\s+quests?\b/.test(lower)) return false;
    if (/\b(static|hums|tonight|oracle|operator|mood|focus)\b/.test(lower)) return false;

    const actionWords =
      /\b(draw|sketch|gesture|thumbnail|study|record|loop|riff|track|mix|make|build|fix|test|code|ship|write|model|block|sculpt|retopo|animate|key|pose|timing|lift|walk|stretch|warm|sets|reps|practice|polish|log)\b/;
    const areaWords: Record<CraftAreaId, RegExp> = {
      music: /\b(music|track|song|riff|loop|beat|take|record|mix)\b/,
      game_dev: /\b(game|playable|prototype|mechanic|level|build|scene)\b/,
      modelling: /\b(model|mesh|silhouette|topology|retopo|blender|sculpt)\b/,
      drawing: /\b(draw|sketch|gesture|thumbnail|pose|figure|value|page)\b/,
      animating: /\b(animate|animation|key|pose|timing|spacing|timeline)\b/,
      coding: /\b(code|coding|patch|bug|test|repo|terminal|feature)\b/,
      gym: /\b(gym|lift|walk|conditioning|mobility|sets|reps|workout)\b/,
      reading: /\b(read|reading|book|books|chapter|pages?|article|paper)\b/,
    };

    return actionWords.test(lower) || areaWords[areaId].test(lower);
  }

  function wantsCraftQuestSet(text: string): boolean {
    const lower = text.toLowerCase();
    const hasQuestWord = /\b(quest|quests|task|tasks|mission|missions|drill|drills)\b/.test(lower);
    const hasCraftWord = /\b(craft|music|game\s*dev|game\s*development|modelling|modeling|drawing|animating|animation|coding|gym|fitness|workout|reading)\b/.test(lower);
    const hasSetVerb = /\b(give|set|make|create|add|assign|generate|plan|write|need|want)\b/.test(lower);
    return hasQuestWord && hasCraftWord && hasSetVerb;
  }

  function extractCraftQuestLines(text: string, areaId: CraftAreaId): { title: string; mode: string; requirements: string }[] {
    return text
      .split('\n')
      .filter((line) => /^\s*(?:[-*]|\d+[.)]|\[[ x-]\])\s+/i.test(line))
      .map((line) => line
        .replace(/^\s*(?:[-*]|\d+[.)]|\[[ x-]\])\s+/i, '')
        .replace(/\*\*/g, '')
        .trim()
      )
      .filter((line) =>
        line.length >= 6 &&
        line.length <= 140 &&
        !/^here\b|^sure\b|^okay\b|^craft quests?\b|^\[actions/i.test(line) &&
        !/^unexpected\b|^syntaxerror\b|^json\b/i.test(line) &&
        !line.includes('<actions>') &&
        looksLikeCraftQuest(line, areaId)
      )
      .slice(0, 5)
      .map((line) => {
        const needMatch = line.match(/^(.*?)\s+(?:need|needs|kit|tools|materials|supplies|requirements?|req)\s*[:=-]\s*(.+)$/i);
        const detailMatch = needMatch ? null : line.match(/^(.{4,80}?)\s*[-:]\s+(.+)$/);
        const rawTitle = (needMatch ? needMatch[1] : detailMatch ? detailMatch[1] : line)
          .replace(/\s+\((make|practice|study|polish|body)\)\s*$/i, '')
          .trim()
          .replace(/[.!]+$/, '');
        const rest = needMatch ? needMatch[2] : detailMatch ? detailMatch[2] : '';
        const requirements = looksLikeNeedList(rest) ? rest.trim() : craftNeedKit(areaId, rawTitle);

        return {
          title: rawTitle,
          mode: modeFromTitle(rawTitle, areaId),
          requirements,
        };
      })
      .filter((quest) => quest.title.length > 0);
  }

  function forceCraftQuestsFromAgentText(userMsg: string, agentText: string): string {
    const area = getCraftArea(inferCraftAreaFromText(userMsg));
    const extracted = extractCraftQuestLines(agentText, area.id);
    const source = extracted.length >= 2 ? extracted : defaultCraftQuests(area.id);
    const createdAt = store.nowString();
    const completed = area.quests.filter((quest) => quest.completed);

    area.quests = [
      ...source.map((quest) => ({
        id: store.newId(),
        title: quest.title,
        mode: quest.mode,
        requirements: quest.requirements,
        note: '',
        completed: false,
        createdAt,
      })),
      ...completed,
    ];

    store.data.craft.focus = area.id;
    store.data.craft.updated = createdAt;
    store.save();
    return `Craft quests set for ${area.title}: ${source.length}.`;
  }

  // ── images: downscale + encode so fr13nd can see them via Claude vision ───────
  async function processImage(file: File): Promise<Pending | null> {
    const enc = await encodeImageFile(file);
    return enc ? { id: store.newId(), ...enc } : null;
  }

  async function addFiles(files: File[]) {
    for (const f of files) {
      try {
        const im = await processImage(f);
        if (im) pending = [...pending, im];
      } catch { /* skip unreadable image */ }
    }
  }

  async function onPaste(e: ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault(); // don't also dump the binary as text into the box
    await addFiles(files);
  }

  async function onAttach(e: Event) {
    const el = e.target as HTMLInputElement;
    await addFiles(Array.from(el.files ?? []));
    el.value = '';
  }

  function removePending(id: string) {
    pending = pending.filter((p) => p.id !== id);
  }

  // ── build recent chat history for the model ───────────────────────────────
  function recentMessages(userMsg: string, images: Pending[] = []): ChatMessage[] {
    const history = $state.snapshot(store.data.agentMemory.recentConversations) as ConversationTurn[];
    const msgs: ChatMessage[] = [];
    for (const t of history.filter((t) => t.agent.length > 0 && t.agent.length < 2000).slice(-4)) {
      msgs.push({ role: 'user', content: t.user });
      msgs.push({ role: 'assistant', content: t.agent });
    }
    if (images.length) {
      const blocks: unknown[] = [{ type: 'text', text: userMsg }];
      for (const im of images) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: im.media, data: im.data } });
      }
      msgs.push({ role: 'user', content: blocks });
    } else {
      msgs.push({ role: 'user', content: userMsg });
    }
    return msgs;
  }

  // ── core send ─────────────────────────────────────────────────────────────
  async function send(userMsg: string) {
    const msg = userMsg.trim();
    const imgs = pending;
    if ((!msg && imgs.length === 0) || busy) return;
    if (imgs.length && store.data.settings.localAiProvider !== 'Claude') {
      error = "fr13nd can only see images on the Claude backend — open [CFG] and switch BACKEND to Claude.";
      return;
    }
    busy  = true;
    error = '';
    input = '';
    streamingText = '';
    pending = [];
    const at = store.nowString();
    const prompt = msg || 'Look at this. Tell me what you see.';

    try {
      const { content, results } = await chatWithTools({
        url: store.data.settings.localAiUrl,
        model: store.data.settings.localAiModel,
        system: buildAgentSystem(),
        messages: recentMessages(prompt, imgs),
        onToken: (token) => {
          streamingText += token;
          scrollThread();
        },
      });

      let reply = content;
      if (results.length) {
        reply = `${content}\n\n[ACTIONS]\n${results.map((r) => `- ${r}`).join('\n')}`.trim();
      }
      if (!reply) reply = '▸ standing by — name the next move.';

      if (wantsCraftQuestSet(msg) && !/Craft quests set for/i.test(reply)) {
        const forcedResult = forceCraftQuestsFromAgentText(msg, reply);
        reply = `${reply}\n\n[ACTIONS]\n- ${forcedResult}`.trim();
      }

      const userLine = imgs.length ? `${msg || '(showed fr13nd an image)'} 🖼×${imgs.length}` : msg;
      if (imgs.length) imagesByTurn = { ...imagesByTurn, [at]: imgs.map((im) => im.url) };
      store.recordTurn({ at, user: userLine, agent: reply });

      scrollThread('smooth');
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      streamingText = '';
    }
  }

  async function sendBrief() {
    const openQuests = store.data.quests
      .filter(q => !q.completed)
      .map(q => `[${q.kind}] id=${q.id} "${q.title}" (${q.cadence}) ${q.progress}/${q.target}`)
      .join('\n');
    const r = store.data.ritual;
    const craft = store.data.craft.areas.map((area) => {
      const openCraftQuests = area.quests
        .filter((quest) => !quest.completed)
        .map((quest) => `id=${quest.id} "${quest.title}" needs="${quest.requirements || quest.note}"`)
        .join('; ');
      return `${area.title}: next="${area.nextAction || area.edge || '-'}" craftQuests=${openCraftQuests || '(none)'} sessions=${area.sessions.length} target=${area.targetMinutes}m`;
    }).join('\n');
    const brief = `OPERATOR STATUS:\nmood: ${r.mood || '—'} | energy: ${r.energy}/5 | focus: ${r.focus || '—'}\n\nOPEN DIRECTIVES:\n${openQuests || '(none)'}\n\nCRAFT:\n${craft}\n\nGive me a short tactical briefing. Then call set_advice with 2-3 concrete clickable actions for the compact bar.`;
    await send(brief);
  }

  // weekly pattern read — fr13nd correlates ACROSS the week's signals
  async function sendPatternRead() {
    const digest = buildWeeklyDigest();
    const prompt = `WEEKLY DATA — last 7 days, oldest → newest:\n${digest}\n\nYou're my pattern-reader. Look ACROSS these signals — sleep, mind/exec-dysfunction, food, training, work, weight — and call out 2-4 concrete patterns or correlations you actually see in MY data (e.g. "exec dysfunction spikes the day after under 6h sleep"). Quote the days/numbers you're reading. If the data is too thin to say something real, say that instead of inventing. End with ONE lever to pull this week.`;
    await send(prompt);
  }

  // fr13nd's suggested tasks: click to act on / finish one; it turns green (done).
  function runAdvice(adv: AgentAdvice) {
    if (adv.done) return;
    const a = adv.action;
    if (a.type === 'complete_quest') {
      const q = store.data.quests.find((x) => x.id === a.id);
      if (q) { q.completed = true; q.progress = q.target; }
    } else if (a.type === 'progress_quest') {
      const q = store.data.quests.find((x) => x.id === a.id);
      if (q) { q.progress = Math.min(q.progress + 1, q.target); if (q.progress >= q.target) q.completed = true; }
    } else {
      send(adv.text);
    }
    adv.done = true;
    store.save();
  }

  // CFG saved -> reload the agent so the new persona/model/backend is live immediately
  async function reloadAgent() {
    if (busy) return;
    busy = true;
    error = '';
    streamingText = '';
    try {
      const { content, results } = await chatWithTools({
        url: store.data.settings.localAiUrl,
        model: store.data.settings.localAiModel,
        system: buildAgentSystem(),
        messages: [{ role: 'user', content: 'Your config (persona / model / backend) just reloaded. In 1-2 lines, confirm you are back online as your current self and name one move to make next.' }],
        onToken: (token) => { streamingText += token; scrollThread(); },
      });
      let reply = content;
      if (results.length) reply = `${content}\n\n[ACTIONS]\n${results.map((r) => `- ${r}`).join('\n')}`.trim();
      if (!reply) reply = '▸ reloaded — standing by.';
      store.recordTurn({ at: store.nowString(), user: '[config reloaded]', agent: reply });
      scrollThread('smooth');
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      streamingText = '';
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // pick up a prompt queued from another panel (e.g. a lyric sent over from LYRICS) and send it
  $effect(() => {
    const p = store.pendingAgentPrompt;
    if (!p || busy) return;
    store.pendingAgentPrompt = null;
    send(p);
  });
</script>

<div class="panel agent-console">
  <div class="header">
    <div class="agent-identity">
      <span class="agent-orb" class:busy aria-hidden="true">
        <svg viewBox="0 0 24 24" class="orb-star" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 1 L13.6 10.4 L23 12 L13.6 13.6 L12 23 L10.4 13.6 L1 12 L10.4 10.4 Z" />
        </svg>
      </span>
      <div>
        <span class="agent-kicker">DESKTOP COMPANION <span class="agent-status">{store.data.settings.localAiProvider === 'Off' ? 'OFFLINE' : 'CONFIGURED'}</span></span>
        <h2>{store.data.settings.companionName}</h2>
      </div>
    </div>
    <div class="hbtns">
      <button class="btn" onclick={sendBrief} disabled={busy}>[BRIEF]</button>
      <button class="btn" onclick={sendPatternRead} disabled={busy} title="weekly pattern read across your data">[PATTERNS]</button>
      <button class="btn" class:active={cfgOpen} onclick={cfgOpen ? () => cfgOpen = false : openCfg}>[CFG]</button>
      <button class="btn" style="color:var(--red);" title="clears the visible thread — your Desktop transcript keeps the full history" onclick={() => { store.data.agentMemory.recentConversations = []; store.save(); }}>[CLEAR]</button>
    </div>
  </div>

  <div class="agent-readout">
    <span><b>BACKEND</b> {(store.data.settings.localAiProvider || 'Off').toUpperCase()}</span>
    <span><b>MODEL</b> {activeModel}</span>
    <span><b>MEMORY</b> {memoryCount} THREAD{memoryCount === 1 ? '' : 'S'}</span>
    <span class="sync"><b>SYNC</b> {lastSync}</span>
  </div>

  {#if cfgOpen}
    <div class="cfg">
      <div class="cfg-row">
        <label for="cfg-name" class="cfg-label muted">NAME</label>
        <input id="cfg-name" bind:value={cfgName} placeholder="companion name" />
      </div>
      <div class="cfg-row">
        <label for="cfg-backend" class="cfg-label muted">BACKEND</label>
        <select id="cfg-backend" bind:value={cfgProvider} disabled={!isDesktop()}>
          <option value="Claude">Claude · cloud</option>
          <option value="Off">Off · no model calls</option>
          <option value="Ollama">Ollama · manual local</option>
        </select>
      </div>
      {#if !isDesktop()}<div class="cfg-note muted">Browser preview · AI is disabled. Configure a provider in the desktop app.</div>{/if}
      {#if cfgProvider === 'Claude'}
        <div class="cfg-row">
          <label for="cfg-claude-model" class="cfg-label muted">CLAUDE MODEL</label>
          <input id="cfg-claude-model" bind:value={cfgClaudeModel} placeholder="claude-opus-4-8" />
        </div>
        <div class="cfg-row">
          <label for="cfg-api-key" class="cfg-label muted">API KEY</label>
          <input id="cfg-api-key" type="password" bind:value={cfgKey} placeholder="sk-ant-…" />
        </div>
        <div class="cfg-note muted">cloud · your data goes to Anthropic's API</div>
      {:else if cfgProvider === 'Ollama'}
        <div class="cfg-row">
          <label for="cfg-model" class="cfg-label muted">MODEL</label>
          <input id="cfg-model" bind:value={cfgModel} placeholder="qwen2.5:7b" />
        </div>
        <div class="cfg-row">
          <label for="cfg-url" class="cfg-label muted">URL</label>
          <input id="cfg-url" bind:value={cfgUrl} placeholder="http://localhost:11434/api/chat" />
        </div>
        <div class="cfg-note muted">Ollama is dormant unless this backend is selected.</div>
      {:else}
        <div class="cfg-note muted">offline mode · no Claude or Ollama calls</div>
      {/if}

      <div class="cfg-sep">PRESSURE</div>
      <div class="cfg-row">
        <label for="cfg-body" class="cfg-label muted">BODY</label>
        <select id="cfg-body" bind:value={cfgBody}>
          <option value="quiet">Quiet · panels stay, {store.data.settings.companionName} can't see them</option>
          <option value="off">Off · hide VESSEL + FUEL entirely</option>
          <option value="on">On · tracked and fair game</option>
        </select>
      </div>
      <div class="cfg-note muted">
        {#if cfgBody === 'on'}
          water, food, sleep, meds and weight are in every prompt — expect them in nudges.
        {:else if cfgBody === 'quiet'}
          log what you feel like; the numbers never reach {store.data.settings.companionName}, so he can't bring them up.
        {:else}
          panels hidden. Nothing is deleted — every logged day comes back if you switch this on.
        {/if}
      </div>
      <label class="cfg-toggle"><input type="checkbox" bind:checked={cfgPings} /> hourly pings from {store.data.settings.companionName}</label>
      <label class="cfg-toggle"><input type="checkbox" bind:checked={cfgGaps} /> show today's open gaps strip</label>
      <label class="cfg-toggle"><input type="checkbox" bind:checked={cfgAlarm} /> red alarm border while dailies are open</label>
      <div class="cfg-row">
        <label for="cfg-persona" class="cfg-label muted">PERSONA</label>
        <textarea id="cfg-persona" bind:value={cfgPersona} rows="5" placeholder="system prompt…"></textarea>
      </div>
      <div class="cfg-row">
        <label for="cfg-profile" class="cfg-label muted">PROFILE</label>
        <textarea id="cfg-profile" bind:value={cfgProfile} rows="3" placeholder="one fact per line about you…"></textarea>
      </div>
      <div class="cfg-row">
        <label for="cfg-notes" class="cfg-label muted">NOTES</label>
        <textarea id="cfg-notes" bind:value={cfgNotes} rows="3" placeholder="one note per line for the agent…"></textarea>
      </div>
      <div class="cfg-row">
        <span class="cfg-label muted">DATA · EXPORT / ROLL BACK</span>
        <div class="data-actions">
          <button class="btn" onclick={doExport}>[EXPORT]</button>
          <button class="btn" onclick={loadBackups}>[REFRESH]</button>
        </div>
        {#if dataMsg}<div class="cfg-note muted data-msg">{dataMsg}</div>{/if}
        {#if backups.length}
          <div class="backup-list">
            {#each backups as b (b.file)}
              <div class="backup-row" class:pending={confirmFile === b.file}>
                <span class="bk-label">{b.label}</span>
                <span class="bk-when muted">{relTime(b.modified)}</span>
                {#if confirmFile === b.file}
                  <button class="btn bk-confirm" onclick={() => doRestore(b.file)}>confirm</button>
                  <button class="btn bk-cancel" onclick={() => (confirmFile = null)}>x</button>
                {:else}
                  <button class="btn bk-restore" onclick={() => (confirmFile = b.file)}>restore</button>
                {/if}
              </div>
            {/each}
          </div>
          <div class="cfg-note muted">restoring snapshots your current state first, so it's reversible.</div>
        {/if}
      </div>

      <div class="cfg-actions">
        <button class="btn btn-gold" onclick={saveCfg}>[SAVE]</button>
        <button class="btn" onclick={() => cfgOpen = false}>[CANCEL]</button>
      </div>
    </div>
  {:else}
    <AsciiEye {busy} />
    <hr class="divider" />

    <!-- suggested tasks — click to act on / finish; turns green when done -->
    {#if (store.data.agentMemory.advice ?? []).length > 0}
      <div class="advice-strip">
        <span class="adv-label">▸ FINISH</span>
        {#each (store.data.agentMemory.advice ?? []) as adv, i (i)}
          <button class="adv-chip" class:done={adv.done} onclick={() => runAdvice(adv)}>{adv.done ? '✓ ' : ''}{adv.text}</button>
        {/each}
      </div>
    {/if}

    <div class="thread-shell">
      <div class="thread-head">
        <span>TRANSMISSIONS</span>
        <span>{turns.length ? `${turns.length} RECENT` : 'STANDING BY'}</span>
      </div>
      <div class="thread" bind:this={listEl}>
      {#if turns.length === 0}
        <div class="empty-state">
          <span class="empty-kicker">CHANNEL OPEN</span>
          <p>Give the operator a situation, a mess, or a target. It will turn the static into one useful move.</p>
          <button class="empty-brief" onclick={sendBrief} disabled={busy}>[RUN TACTICAL BRIEF]</button>
        </div>
      {/if}
      {#each turns as t, i (i + t.at)}
        <div class="turn" class:meta-turn={isMetaTurn(t)}>
          {#if isMetaTurn(t)}
            <span class="meta-tag">AUTOMATED CHECK-IN</span>
          {/if}
          <div class="turn-user">
            <span class="at muted">{t.at.slice(11)}</span>
            <span class="msg">{t.user}</span>
          </div>
          {#if imagesByTurn[t.at]}
            <div class="turn-imgs">
              {#each imagesByTurn[t.at] as src (src)}<img class="turn-img" {src} alt="shown to fr13nd" />{/each}
            </div>
          {/if}
          <div class="turn-agent">
            <span class="sigil gold">✦</span>
            <span class="msg agent-msg">{t.agent}</span>
          </div>
        </div>
      {/each}
      {#if busy}
        {#if streamingText}
          <div class="turn live-turn">
            <div class="turn-agent">
              <span class="sigil gold">✦</span>
              <span class="msg agent-msg">{streamingText}<span class="caret">▋</span></span>
            </div>
          </div>
        {:else}
          <div class="thinking muted">▸ ▸ ▸</div>
        {/if}
      {/if}
      {#if error}
        <div class="err">{error}</div>
      {/if}
      </div>
    </div>

    <hr class="divider" />

    <div class="input-row">
      <div class="composer-label"><span>DIRECT LINE</span><span>PASTE OR [👁] TO SHOW AN IMAGE · ENTER TO SEND</span></div>
      {#if pending.length}
        <div class="attach-strip">
          {#each pending as p (p.id)}
            <div class="attach-thumb">
              <img src={p.url} alt="pending" />
              <button class="attach-x" onclick={() => removePending(p.id)} title="remove" aria-label="remove image">✕</button>
            </div>
          {/each}
        </div>
      {/if}
      <textarea
        bind:value={input}
        onkeydown={onKeydown}
        onpaste={onPaste}
        rows="2"
        placeholder="transmit…  (paste an image to show fr13nd)"
        disabled={busy}
      ></textarea>
      <div class="composer-actions">
        <input bind:this={fileEl} type="file" accept="image/*" multiple onchange={onAttach} hidden />
        <button class="btn eye-btn" onclick={() => fileEl?.click()} disabled={busy} title="show fr13nd an image" aria-label="attach image">[👁]</button>
        <button class="btn btn-gold send" onclick={() => send(input)} disabled={busy}>[→]</button>
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
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .hbtns { display: flex; gap: 6px; }
  .btn.active { color: var(--gold); }

  .cfg {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--line);
  }
  .cfg-row { display: flex; flex-direction: column; gap: 3px; }
  .cfg-label { font-size: 9px; letter-spacing: 0.1em; }
  .cfg-note { font-size: 9px; letter-spacing: 0.04em; padding: 1px 0 2px; opacity: 0.8; }
  .cfg-sep {
    font-size: 9px; letter-spacing: 0.16em; color: var(--violet);
    border-top: 1px solid var(--line); margin-top: 4px; padding-top: 7px;
  }
  .cfg-toggle {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; color: var(--ink); cursor: pointer; padding: 1px 0;
  }
  .cfg-toggle input { width: 12px; height: 12px; accent-color: var(--violet); cursor: pointer; }
  .cfg-actions { display: flex; gap: 6px; padding-top: 2px; }

  .data-actions { display: flex; gap: 6px; }
  .data-msg { word-break: break-all; }
  .backup-list { display: flex; flex-direction: column; gap: 1px; margin-top: 3px; max-height: 150px; overflow-y: auto; }
  .backup-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; padding: 2px 0; border-bottom: 1px solid var(--line); }
  .backup-row.pending { background: color-mix(in srgb, var(--red) 9%, transparent); }
  .bk-label { font-size: 9px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bk-when { font-size: 8px; }
  .bk-restore { font-size: 8px; color: var(--muted); }
  .bk-restore:hover { color: var(--gold); }
  .bk-confirm { font-size: 8px; color: var(--red); border-color: var(--red); }
  .bk-cancel { font-size: 8px; color: var(--muted); }

  .advice-strip {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .adv-chip {
    font-size: 10px;
    padding: 2px 7px;
    border: 1px solid var(--violet);
    color: var(--violet);
    font-family: var(--font);
    cursor: pointer;
    background: none;
    transition: background 0.1s, color 0.1s;
  }
  .adv-chip:hover {
    background: var(--violet);
    color: var(--void);
  }
  .adv-chip.done {
    border-color: var(--green);
    color: var(--green);
    background: color-mix(in srgb, var(--green) 14%, transparent);
  }
  .adv-chip.done:hover { background: color-mix(in srgb, var(--green) 20%, transparent); color: var(--green); }
  .adv-label { font-size: 8px; letter-spacing: 0.12em; color: var(--muted); align-self: center; }

  .thread {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .turn {
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .turn-user, .turn-agent {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .at { font-size: 9px; flex-shrink: 0; margin-top: 2px; }
  .sigil { flex-shrink: 0; font-size: 12px; }
  .msg { font-size: 11px; white-space: pre-wrap; line-height: 1.5; word-break: break-word; }
  .agent-msg { color: var(--violet); }
  .thinking { padding: 8px; font-size: 13px; letter-spacing: 4px; }
  .caret { animation: blink 1s steps(1) infinite; color: var(--gold); }
  @keyframes blink { 50% { opacity: 0; } }
  .err { padding: 6px 8px; font-size: 11px; color: var(--red); }
  .input-row {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    flex-shrink: 0;
    align-items: flex-end;
  }
  .input-row textarea { flex: 1; }
  .send {
    flex-shrink: 0;
    padding: 4px 8px;
    height: 100%;
    border: 1px solid var(--gold);
  }

  /* ── agent console pass ─────────────────────────────────────────────── */
  .agent-console {
    position: relative;
    background:
      radial-gradient(88% 44% at 4% 0%, color-mix(in srgb, var(--violet) 24%, transparent), transparent 72%),
      radial-gradient(68% 42% at 100% 100%, color-mix(in srgb, var(--blue) 13%, transparent), transparent 76%),
      var(--void);
  }

  .agent-console::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-top: 1px solid color-mix(in srgb, var(--violet) 44%, transparent);
    box-shadow: inset 0 34px 70px -50px color-mix(in srgb, var(--violet) 72%, transparent);
  }

  .header {
    position: relative;
    z-index: 1;
    min-height: 60px;
    padding: 11px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--violet) 32%, var(--line));
    background:
      radial-gradient(120% 150% at 0% 0%, color-mix(in srgb, var(--gold) 9%, transparent), transparent 44%),
      linear-gradient(90deg, color-mix(in srgb, var(--violet) 15%, var(--panel)), color-mix(in srgb, var(--violet) 2%, var(--panel)) 72%);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--gold) 22%, transparent);
  }

  .agent-identity { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .agent-orb {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
  }
  .orb-star { width: 27px; height: 27px; display: block; }
  .orb-star path {
    fill: var(--gold);
    stroke: color-mix(in srgb, var(--gold) 50%, #0c0700);
    stroke-width: 0.5;
    stroke-linejoin: miter;
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--gold) 65%, transparent));
  }
  .agent-orb.busy .orb-star path { animation: agent-flare 0.8s ease-in-out infinite alternate; }
  @keyframes agent-flare {
    from { filter: drop-shadow(0 0 2px color-mix(in srgb, var(--gold) 50%, transparent)); }
    to   { filter: drop-shadow(0 0 7px var(--gold)) drop-shadow(0 0 13px color-mix(in srgb, var(--red) 45%, transparent)); }
  }
  .agent-kicker { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 8px; letter-spacing: .13em; margin-bottom: 3px; }
  .agent-status { display: inline-flex; align-items: center; gap: 4px; color: var(--teal); }
  @keyframes live-blink { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
  h2 { color: var(--ink); font-size: 17px; line-height: 1; letter-spacing: .09em; text-shadow: 0 0 14px color-mix(in srgb, var(--gold) 24%, transparent); }
  .hbtns { gap: 5px; align-self: flex-start; }
  .hbtns .btn { border-color: color-mix(in srgb, var(--violet) 35%, var(--line)); padding: 3px 6px; }
  .hbtns .btn:hover, .hbtns .btn.active { color: var(--violet); border-color: var(--violet); background: color-mix(in srgb, var(--violet) 10%, transparent); }

  .agent-readout {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
    padding: 5px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--violet) 18%, var(--line));
    color: var(--muted);
    font-size: 8px;
    letter-spacing: .05em;
    background: color-mix(in srgb, var(--violet) 4%, transparent);
  }
  .agent-readout span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agent-readout b { color: var(--violet); font-size: 7px; letter-spacing: .1em; margin-right: 3px; }
  .agent-readout .sync { color: var(--gold); text-align: right; }

  .cfg {
    position: relative;
    z-index: 1;
    margin: 12px;
    padding: 10px;
    border: 1px solid color-mix(in srgb, var(--violet) 38%, var(--line));
    background: linear-gradient(135deg, color-mix(in srgb, var(--violet) 10%, transparent), var(--panel) 58%);
    box-shadow: 0 14px 34px rgba(0, 0, 0, .28);
  }
  .cfg-row { gap: 4px; }
  .cfg-label { color: var(--violet); }
  .cfg input:focus, .cfg textarea:focus, .cfg select:focus { border-color: var(--violet); }

  .advice-strip {
    position: relative;
    z-index: 1;
    padding: 6px 12px;
    border-bottom-color: color-mix(in srgb, var(--violet) 20%, var(--line));
    background: color-mix(in srgb, var(--violet) 4%, transparent);
  }
  .adv-chip { border-color: color-mix(in srgb, var(--violet) 70%, var(--line)); background: color-mix(in srgb, var(--violet) 5%, transparent); }

  .thread-shell {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1;
    min-height: 0;
    margin: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--violet) 36%, var(--line));
    background: linear-gradient(145deg, color-mix(in srgb, var(--violet) 7%, transparent), transparent 38%), rgba(5, 5, 9, .74);
    box-shadow: inset 0 0 38px color-mix(in srgb, var(--violet) 4%, transparent), 0 12px 34px rgba(0, 0, 0, .25);
    flex-direction: column;
  }
  .thread-head {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--violet) 26%, var(--line));
    color: var(--violet);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .12em;
    background: color-mix(in srgb, var(--violet) 7%, transparent);
  }
  .thread-head span:last-child { color: var(--gold); }
  .thread { padding: 8px; }
  .turn { gap: 7px; padding: 9px 8px; border-bottom: 1px solid color-mix(in srgb, var(--violet) 12%, var(--line)); }
  .turn:last-child { border-bottom: none; }
  .turn-user { padding: 3px 6px; border-left: 2px solid var(--line); color: var(--muted); }
  .turn-agent { padding: 7px 8px; border: 1px solid color-mix(in srgb, var(--violet) 27%, var(--line)); background: linear-gradient(105deg, color-mix(in srgb, var(--violet) 10%, transparent), transparent 72%); }
  .turn-agent .sigil { color: var(--gold); }
  .agent-msg { color: var(--ink); }
  .live-turn .turn-agent { border-color: var(--violet); box-shadow: inset 0 0 18px color-mix(in srgb, var(--violet) 13%, transparent); }
  .meta-tag { color: var(--teal); font-size: 8px; font-weight: 700; letter-spacing: .12em; }
  .meta-turn { border-left: 2px solid var(--teal); background: color-mix(in srgb, var(--teal) 4%, transparent); }
  .meta-turn .turn-user { border-left-color: color-mix(in srgb, var(--teal) 48%, var(--line)); color: var(--teal); }
  .meta-turn .turn-agent { border-color: color-mix(in srgb, var(--teal) 42%, var(--line)); background: linear-gradient(105deg, color-mix(in srgb, var(--teal) 10%, transparent), transparent 72%); }
  .meta-turn .turn-agent .sigil { color: var(--teal); }

  .empty-state { display: grid; place-items: center; align-content: center; flex: 1; min-height: 260px; padding: 28px; text-align: center; }
  .empty-kicker { color: var(--violet); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
  .empty-state p { max-width: 320px; margin: 8px 0 13px; color: var(--muted); font-size: 11px; line-height: 1.6; }
  .empty-brief { border: 1px solid var(--gold); color: var(--gold); padding: 5px 9px; font-size: 9px; letter-spacing: .08em; }
  .empty-brief:hover { background: var(--gold); color: var(--void); }

  .input-row {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    gap: 5px;
    padding: 8px 12px 12px;
    border-top: 1px solid color-mix(in srgb, var(--violet) 28%, var(--line));
    background: linear-gradient(180deg, color-mix(in srgb, var(--violet) 7%, transparent), var(--panel));
  }
  .composer-label { grid-column: 1 / -1; display: flex; justify-content: space-between; color: var(--violet); font-size: 8px; letter-spacing: .12em; }
  .composer-label span:last-child { color: var(--muted); letter-spacing: .05em; }
  .input-row textarea { min-height: 48px; border-color: color-mix(in srgb, var(--violet) 35%, var(--line)); background: color-mix(in srgb, var(--void) 76%, var(--violet)); }
  .input-row textarea:focus { border-color: var(--violet); box-shadow: 0 0 0 2px color-mix(in srgb, var(--violet) 12%, transparent); }
  .send { height: 48px; border-color: var(--gold); color: var(--gold); font-size: 15px; }
  .send:hover { background: var(--gold); color: var(--void); }

  /* show fr13nd an image — paste/attach thumbnails + in-thread previews */
  .composer-actions { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .composer-actions .send { flex: 1; height: auto; }
  .eye-btn { height: 40px; border-color: color-mix(in srgb, var(--violet) 50%, var(--line)); color: var(--violet); font-size: 14px; }
  .eye-btn:hover:not(:disabled) { background: var(--violet); color: var(--void); }
  .attach-strip { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; padding: 2px 0; }
  .attach-thumb { position: relative; width: 52px; height: 52px; border: 1px solid color-mix(in srgb, var(--violet) 45%, var(--line)); overflow: hidden; }
  .attach-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .attach-x {
    position: absolute; top: 0; right: 0; width: 16px; height: 16px;
    line-height: 14px; font-size: 10px; padding: 0; border: none; cursor: pointer;
    background: rgba(0, 0, 0, 0.72); color: #fff;
  }
  .attach-x:hover { background: var(--red); }
  .turn-imgs { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 2px; padding-left: 14px; }
  .turn-img {
    max-width: 160px; max-height: 120px; object-fit: contain;
    border: 1px solid color-mix(in srgb, var(--gold) 35%, var(--line));
  }

  @media (prefers-reduced-motion: reduce) { .agent-orb.busy .orb-star path { animation: none; } }
</style>
