import { invoke } from './runtime';
import { populateDemo } from './demo';
import type { AppData, ConversationTurn, Craft, CraftAreaId, CraftQuest, KanjiCard, LyricKind, MentalSignalDay, MentalSignals, QueueKind, SchoolData, VesselLog } from './types';
import { localDay, localStamp } from './day';

const CRAFT_AREAS: { id: CraftAreaId; title: string; targetMinutes: number }[] = [
  { id: 'music', title: 'Music', targetMinutes: 30 },
  { id: 'game_dev', title: 'Game Dev', targetMinutes: 45 },
  { id: 'modelling', title: 'Modelling', targetMinutes: 30 },
  { id: 'drawing', title: 'Drawing', targetMinutes: 30 },
  { id: 'animating', title: 'Animating', targetMinutes: 30 },
  { id: 'coding', title: 'Coding', targetMinutes: 45 },
  { id: 'gym', title: 'Gym', targetMinutes: 45 },
  { id: 'reading', title: 'Reading', targetMinutes: 30 },
];

/**
 * Strip the Anthropic API key before writing any copy that leaves the app's
 * private local storage — the Desktop mirror and manual exports are visible
 * files that could get synced, backed up elsewhere, or shared. The real working
 * data file and rolling backups (used for in-app restore) are NOT redacted:
 * they live in app-local storage and the app needs the real key to function
 * after a restore.
 */
export function redactForExport<T extends Partial<AppData>>(data: T): T {
  if (!data?.settings) return data;
  return {
    ...data,
    settings: {
      ...data.settings,
      anthropicApiKey: data.settings.anthropicApiKey ? '[redacted — set again in CFG]' : '',
    },
  };
}

export function defaultCraft(): Craft {
  return {
    focus: 'music',
    updated: '',
    areas: CRAFT_AREAS.map((area) => ({
      ...area,
      project: '',
      nextAction: '',
      drill: '',
      reference: '',
      blocker: '',
      edge: '',
      quests: [],
      sessions: [],
    })),
    levelsSeen: {},
  };
}

function normalizeCraftQuests(quests: unknown): CraftQuest[] {
  if (!Array.isArray(quests)) return [];

  return quests
    .map((quest) => {
      const item = quest as Partial<CraftQuest>;
      const title = String(item.title ?? '').trim();
      if (!title) return null;

      return {
        id: item.id || crypto.randomUUID().replace(/-/g, ''),
        title,
        mode: String(item.mode ?? 'make').trim() || 'make',
        requirements: String(item.requirements ?? item.note ?? '').trim(),
        note: String(item.note ?? '').trim(),
        completed: Boolean(item.completed),
        createdAt: item.createdAt || '',
      };
    })
    .filter((quest): quest is CraftQuest => quest !== null);
}

export function mergeCraft(saved?: Partial<Craft>): Craft {
  const fallback = defaultCraft();
  const savedAreas = saved?.areas ?? [];
  const areas = fallback.areas.map((area) => {
    const existing = savedAreas.find((item) => item.id === area.id);
    const legacyEdge = existing?.edge ?? '';
    return {
      ...area,
      ...existing,
      project: existing?.project ?? '',
      nextAction: existing?.nextAction ?? legacyEdge,
      drill: existing?.drill ?? '',
      reference: existing?.reference ?? '',
      blocker: existing?.blocker ?? '',
      edge: legacyEdge,
      quests: normalizeCraftQuests(existing?.quests),
      sessions: existing?.sessions ?? [],
    };
  });

  const focus = areas.some((area) => area.id === saved?.focus) ? saved!.focus! : fallback.focus;
  return {
    focus,
    areas,
    updated: saved?.updated ?? '',
    levelsSeen: saved?.levelsSeen ?? {},
  };
}

export function emptySignalToday(date = localDay()): MentalSignalDay {
  return {
    date,
    intrusiveThoughts: 0,
    executiveDysfunction: 0,
    obsessiveThoughts: 0,
    dissociation: 0,
    depression: 0,
    note: '',
    sigil: '',
    checkedIn: false,
    at: '',
  };
}

export function defaultSignal(): MentalSignals {
  return {
    today: emptySignalToday(),
    log: [],
    updated: '',
    voidLog: [],
  };
}

export function mergeSignal(saved?: Partial<MentalSignals>): MentalSignals {
  const fallback = defaultSignal();
  const today = localDay();
  const merged: MentalSignals = {
    today: {
      ...fallback.today,
      ...saved?.today,
    },
    log: saved?.log ?? [],
    updated: saved?.updated ?? '',
    voidLog: saved?.voidLog ?? [],
  };

  if (merged.today.date !== today) {
    if (merged.today.checkedIn) {
      merged.log.push({ ...merged.today });
    }
    merged.today = emptySignalToday(today);
  }

  return merged;
}

export function defaultSchool(): SchoolData {
  return {
    semesters: [], courses: [], meetings: [], items: [], resources: [],
    launchPlans: [], blocks: [], sessions: [], materials: [], chunks: [],
    updated: '',
  };
}

// Generic public-edition persona; no private profile or conversation history.
const DEFAULT_PERSONA = `You are fr13nd, a practical desktop companion. Help the user
choose a small next action. Be concise, curious, and encouraging. Use tools only
when they match the user's request. Treat all starter content as fictional demo data.`;
const STOCK_PERSONAS: string[] = [];

const DEFAULT_DATA: AppData = {
  lastDailyReset: '',
  settings: {
    companionName: 'fr13nd',
    companionTone: 'concise and encouraging',
    pinned: true,
    compact: false,
    localAiProvider: 'Off',
    localAiUrl: 'http://localhost:11434/api/chat',
    localAiModel: 'qwen2.5:7b',
    anthropicApiKey: '',
    anthropicModel: 'claude-opus-4-8',
    agentPersonality: DEFAULT_PERSONA,
    // Calm by default. The trackers stay usable; they just don't get to judge.
    bodyTracking: 'quiet',
    alarmBorder: false,
    showDailyGaps: true,
    hourlyPings: false,
  },
  quests: [],
  recipes: [],
  ritual: { mood: '', energy: 3, focus: '', lastCheckIn: '', notes: [] },
  agentMemory: {
    profile: [],
    preferences: [],
    patterns: [],
    notes: [],
    recentConversations: [],
    advice: [],
    updated: '',
    lastProactiveAt: 0,
    lastHourlyNotifyAt: 0,
  },
  abode: { tasks: [] },
  pet: { tasks: [] },
  vessel: { today: { date: '', water: 0, sleep: 0, movement: 0, meals: 0, meds: false, note: '', weight: 0 }, log: [] },
  craft: defaultCraft(),
  signal: defaultSignal(),
  fuel: {
    today: { date: '', entries: [] },
    log: [],
    targetKcal: 0,
    targetProtein: 0,
    targetCarbs: 0,
    targetFat: 0,
    mealTimes: [
      { id: 'breakfast', time: '09:00' },
      { id: 'lunch', time: '13:00' },
      { id: 'dinner', time: '18:00' },
    ],
    updated: '',
  },
  work: { clockedInAt: 0, log: [], targetMinutes: 540, updated: '' },
  lyrics: { entries: [], updated: '' },
  stars: { birthDate: '', updated: '' },
  queue: { items: [], updated: '' },
  // starter deck: common JLPT N5 kanji so practice works on first run.
  // due:'' marks a card as brand-new (due immediately).
  school: defaultSchool(),
  kanji: {
    cards: (
      [
        ['一', 'one', 'いち・イチ'],
        ['二', 'two', 'に・ニ'],
        ['三', 'three', 'さん・サン'],
        ['人', 'person', 'ひと・ジン'],
        ['日', 'day / sun', 'ひ・ニチ'],
        ['月', 'month / moon', 'つき・ゲツ'],
        ['水', 'water', 'みず・スイ'],
        ['火', 'fire', 'ひ・カ'],
        ['木', 'tree / wood', 'き・モク'],
        ['山', 'mountain', 'やま・サン'],
        ['川', 'river', 'かわ・セン'],
        ['大', 'big', 'おお・ダイ'],
        ['小', 'small', 'ちい・ショウ'],
        ['中', 'middle / inside', 'なか・チュウ'],
        ['本', 'book / origin', 'もと・ホン'],
      ] as [string, string, string][]
    ).map(([char, meaning, reading], i) => ({
      id: `k-seed-${i + 1}`,
      char,
      meaning,
      reading,
      note: '',
      box: 0,
      due: '',
      reps: 0,
      lapses: 0,
      added: '',
    })),
    updated: '',
  },
};

export class WidgetStore {
  data = $state<AppData>(structuredClone(DEFAULT_DATA));
  loaded = $state(false);
  /** A prompt queued from another panel (e.g. LYRICS) for the AGENT chat to pick up and send. Not persisted. */
  pendingAgentPrompt = $state<string | null>(null);

  private _saveTimer?: ReturnType<typeof setTimeout>;

  async load() {
    try {
      const raw = await invoke<string>('read_data');
      if (!raw?.trim()) {
        this.data = populateDemo(structuredClone(DEFAULT_DATA));
        this.save();
      }
      // durable backup: snapshot the on-disk file once per local day (kept rolling, last 7)
      void invoke('backup_data', { label: localDay() }).catch(() => {});
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw) as Partial<AppData>;
        // populate the visible Desktop archive right away on launch — redacted,
        // since this mirror is a visible file that could be synced/shared/moved.
        void invoke('mirror_data', {
          content: JSON.stringify(redactForExport(parsed), null, 2),
          label: localDay(),
        }).catch(() => {});
        if (parsed.settings) this.data.settings = parsed.settings;
        // pressure controls arrived after launch — saves predating them adopt the
        // calm defaults rather than the old always-on nagging.
        {
          const s = this.data.settings;
          s.bodyTracking ??= 'quiet';
          s.alarmBorder ??= false;
          s.showDailyGaps ??= true;
          s.hourlyPings ??= true;
        }
        // upgrade any previously-shipped default persona to the latest; leave a customized one untouched
        {
          const saved = this.data.settings.agentPersonality?.trim();
          if (saved && STOCK_PERSONAS.some((p) => p.trim() === saved)) {
            this.data.settings.agentPersonality = DEFAULT_PERSONA;
          }
        }
        // move off the old non-tool-calling model to the tool-capable default
        if (this.data.settings.localAiModel === 'gemma3:4b') {
          this.data.settings.localAiModel = 'qwen2.5:7b';
        }
        if (parsed.lastDailyReset) this.data.lastDailyReset = parsed.lastDailyReset;
        if (parsed.quests) {
          this.data.quests = parsed.quests.map((quest) => ({ advice: '', ...quest }));
        }
        if (parsed.recipes) this.data.recipes = parsed.recipes;
        if (parsed.ritual) this.data.ritual = parsed.ritual;
        if (parsed.agentMemory) {
          this.data.agentMemory = parsed.agentMemory;
          this.data.agentMemory.advice ??= [];
          this.data.agentMemory.overseerLog ??= [];
        }
        if (parsed.abode) this.data.abode = parsed.abode;
        if (parsed.pet) this.data.pet = parsed.pet;
        if (parsed.vessel) this.data.vessel = parsed.vessel;
        this.data.craft = mergeCraft(parsed.craft);
        this.data.signal = mergeSignal(parsed.signal);
        // reset vessel today if it's a new day
        const today = localDay();
        if (this.data.vessel.today.date !== today) {
          if (this.data.vessel.today.date) this.data.vessel.log.push(this.data.vessel.today);
          this.data.vessel.today = { date: today, water: 0, sleep: 0, movement: 0, meals: 0, meds: false, note: '', weight: 0 };
        }
        // fuel: load saved + roll today over to the log on a new day
        if (parsed.fuel) {
          this.data.fuel = {
            today: parsed.fuel.today ?? { date: '', entries: [] },
            log: parsed.fuel.log ?? [],
            targetKcal: parsed.fuel.targetKcal ?? 0,
            targetProtein: parsed.fuel.targetProtein ?? 200,
            targetCarbs: parsed.fuel.targetCarbs ?? 180,
            targetFat: parsed.fuel.targetFat ?? 65,
            mealTimes: parsed.fuel.mealTimes?.length
              ? parsed.fuel.mealTimes
              : [
                  { id: 'breakfast', time: '09:00' },
                  { id: 'lunch', time: '13:00' },
                  { id: 'dinner', time: '18:00' },
                ],
            updated: parsed.fuel.updated ?? '',
          };
        }
        if (this.data.fuel.today.date !== today) {
          if (this.data.fuel.today.date && this.data.fuel.today.entries.length) {
            this.data.fuel.log.push(this.data.fuel.today);
          }
          this.data.fuel.today = { date: today, entries: [] };
        }
        if (parsed.work) {
          this.data.work = {
            clockedInAt: Number(parsed.work.clockedInAt) || 0,
            log: parsed.work.log ?? [],
            targetMinutes: parsed.work.targetMinutes ?? 540,
            updated: parsed.work.updated ?? '',
          };
        }
        if (parsed.lyrics) {
          this.data.lyrics = { entries: parsed.lyrics.entries ?? [], updated: parsed.lyrics.updated ?? '' };
        }
        if (parsed.stars) {
          this.data.stars = { birthDate: parsed.stars.birthDate ?? '', read: parsed.stars.read, updated: parsed.stars.updated ?? '' };
        }
        if (parsed.queue) {
          this.data.queue = { items: parsed.queue.items ?? [], updated: parsed.queue.updated ?? '' };
        }
        // school: every collection defaulted individually, so a save written by
        // an older build (or a partially-written one) can never leave a
        // collection undefined and crash a .filter() downstream.
        if (parsed.school) {
          const d = defaultSchool();
          const k = parsed.school;
          this.data.school = {
            semesters: k.semesters ?? d.semesters,
            courses: k.courses ?? d.courses,
            meetings: k.meetings ?? d.meetings,
            items: k.items ?? d.items,
            resources: k.resources ?? d.resources,
            launchPlans: k.launchPlans ?? d.launchPlans,
            blocks: k.blocks ?? d.blocks,
            sessions: k.sessions ?? d.sessions,
            materials: k.materials ?? d.materials,
            chunks: k.chunks ?? d.chunks,
            activeSessionId: k.activeSessionId,
            updated: k.updated ?? '',
          };
        }
        // kanji: keep saved deck; leave the seed deck in place for saves predating it
        if (parsed.kanji?.cards) {
          this.data.kanji = { cards: parsed.kanji.cards, updated: parsed.kanji.updated ?? '' };
        }
        // roll over recurring (Daily) quests and tasks on a new day
        if (!this.data.lastDailyReset) {
          // first run with this field: adopt today, don't disturb existing completions
          this.data.lastDailyReset = today;
        } else if (this.data.lastDailyReset !== today) {
          this.resetDailies();
          this.data.lastDailyReset = today;
        }
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    this.loaded = true;
  }

  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      try {
        const snapshot = $state.snapshot(this.data);
        const content = JSON.stringify(snapshot, null, 2);
        await invoke('write_data', { content });
        // also mirror a dated copy into the visible Desktop archive (Desktop/fr13nd-public/) —
        // redacted, since this copy can leave the machine (sync/backup/share) unlike
        // the real data file. Fire-and-forget so a Desktop hiccup never breaks the save.
        const mirrorContent = JSON.stringify(redactForExport(snapshot), null, 2);
        void invoke('mirror_data', { content: mirrorContent, label: localDay() }).catch(() => {});
      } catch (e) {
        console.error('Failed to save data:', e);
      }
    }, 500);
  }

  // ── lyrics ────────────────────────────────────────────────────────────────
  /** Create a blank lyric entry of the given kind; returns its id so the UI can open it. */
  addLyric(kind: LyricKind = 'song'): string {
    const at = this.nowString();
    const id = this.newId();
    this.data.lyrics.entries.push({ id, kind, title: '', body: '', artist: '', tags: '', createdAt: at, updatedAt: at });
    this.data.lyrics.updated = at;
    this.save();
    return id;
  }

  /** Mark a lyric edited (bump its timestamp) and persist. Safe to call on every keystroke (save is debounced). */
  touchLyric(id: string) {
    const e = this.data.lyrics.entries.find((x) => x.id === id);
    if (e) e.updatedAt = this.nowString();
    this.data.lyrics.updated = this.nowString();
    this.save();
  }

  /** Promote a caught fragment into a full song draft. */
  promoteFragment(id: string) {
    const e = this.data.lyrics.entries.find((x) => x.id === id);
    if (e) {
      e.kind = 'song';
      e.updatedAt = this.nowString();
      this.save();
    }
  }

  deleteLyric(id: string) {
    this.data.lyrics.entries = this.data.lyrics.entries.filter((x) => x.id !== id);
    this.data.lyrics.updated = this.nowString();
    this.save();
  }

  /** Queue a message for the AGENT panel to send; a page effect flips to that panel and it picks this up. */
  askAgent(text: string) {
    const t = text.trim();
    if (t) this.pendingAgentPrompt = t;
  }

  // ── data safety: list / restore backups, export ────────────────────────────
  async listBackups(): Promise<{ file: string; label: string; modified: number; bytes: number }[]> {
    try {
      return await invoke('list_backups');
    } catch {
      return [];
    }
  }

  /** Roll back to a backup. Snapshots the current state first, then reloads from the backup. */
  async restoreFromBackup(file: string): Promise<void> {
    // flush current to disk so the safety snapshot captures the latest state
    const current = JSON.stringify($state.snapshot(this.data), null, 2);
    await invoke('write_data', { content: current });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await invoke('snapshot_backup', { label: `pre-restore-${stamp}` }).catch(() => {});
    const content = await invoke<string>('read_backup', { file });
    if (!content || !content.trim()) throw new Error('that backup is empty');
    await invoke('write_data', { content });
    this.loaded = false;
    await this.load();
  }

  /** Write a timestamped portable copy to Desktop/fr13nd-public/exports/. Returns the path.
   * Redacted (see redactForExport) — an export is meant to be moved/shared. */
  async exportData(): Promise<string> {
    const content = JSON.stringify(redactForExport($state.snapshot(this.data)), null, 2);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return invoke<string>('export_data', { content, name: `life-widget-export-${stamp}.json` });
  }

  /**
   * Get the vessel entry for a local date (YYYY-MM-DD) so past days can be
   * reviewed and edited. Today returns the live `vessel.today` object; a past
   * day returns its log entry, creating a blank one if that day was never
   * logged (the operator forgot to open the app) — kept date-sorted so the
   * weight trend stays correct. Future/garbage dates return null.
   */
  upsertVesselDay(date: string): VesselLog | null {
    const today = localDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return null;
    if (date === today) return this.data.vessel.today;
    const existing = this.data.vessel.log.find((v) => v.date === date);
    if (existing) return existing;
    const entry: VesselLog = { date, water: 0, sleep: 0, movement: 0, meals: 0, meds: false, note: '', weight: 0 };
    this.data.vessel.log.push(entry);
    this.data.vessel.log.sort((a, b) => a.date.localeCompare(b.date));
    this.save();
    return entry;
  }

  setBirthDate(date: string) {
    this.data.stars.birthDate = date.trim();
    this.data.stars.updated = this.nowString();
    this.save();
  }

  // ── queue (watch / read backlog) ────────────────────────────────────────────
  addQueueItem(kind: QueueKind, title: string): string {
    const t = title.trim();
    const at = this.nowString();
    const id = this.newId();
    this.data.queue.items.push({ id, kind, title: t, status: 'queued', note: '', addedAt: at });
    this.data.queue.updated = at;
    this.save();
    return id;
  }

  /** queued → active → done → queued; stamps finishedAt on the way into done. */
  cycleQueueStatus(id: string) {
    const it = this.data.queue.items.find((x) => x.id === id);
    if (!it) return;
    it.status = it.status === 'queued' ? 'active' : it.status === 'active' ? 'done' : 'queued';
    it.finishedAt = it.status === 'done' ? this.nowString() : undefined;
    this.data.queue.updated = this.nowString();
    this.save();
  }

  touchQueueItem(id: string) {
    if (this.data.queue.items.some((x) => x.id === id)) this.data.queue.updated = this.nowString();
    this.save();
  }

  deleteQueueItem(id: string) {
    this.data.queue.items = this.data.queue.items.filter((x) => x.id !== id);
    this.data.queue.updated = this.nowString();
    this.save();
  }

  // ── kanji (Leitner spaced-repetition deck) ──────────────────────────────────
  /** Days until next review by Leitner box. Box 0 (missed/new) recycles same session. */
  static KANJI_INTERVALS = [0, 1, 2, 4, 8, 16];

  addKanji(char: string, meaning: string, reading: string, note = ''): string | null {
    const c = char.trim();
    if (!c) return null;
    const id = this.newId();
    this.data.kanji.cards.push({
      id,
      char: c,
      meaning: meaning.trim(),
      reading: reading.trim(),
      note: note.trim(),
      box: 0,
      due: '',
      reps: 0,
      lapses: 0,
      added: this.nowString(),
    });
    this.data.kanji.updated = this.nowString();
    this.save();
    return id;
  }

  /** Grade a review: correct promotes a box, wrong demotes; both reschedule `due`. */
  gradeKanji(id: string, ok: boolean) {
    const card = this.data.kanji.cards.find((k) => k.id === id);
    if (!card) return;
    if (ok) {
      card.box = Math.min(card.box + 1, 5);
      card.reps += 1;
    } else {
      card.box = Math.max(card.box - 1, 0);
      card.lapses += 1;
    }
    const days = WidgetStore.KANJI_INTERVALS[card.box] ?? 1;
    const next = new Date();
    next.setDate(next.getDate() + days);
    card.due = localDay(next);
    this.data.kanji.updated = this.nowString();
    this.save();
  }

  touchKanji() {
    this.data.kanji.updated = this.nowString();
    this.save();
  }

  deleteKanji(id: string) {
    this.data.kanji.cards = this.data.kanji.cards.filter((k) => k.id !== id);
    this.data.kanji.updated = this.nowString();
    this.save();
  }

  /**
   * The overseer ledger: every AI subsystem (hourly notify, zodiac, capture
   * router, nutrition estimator, critiques, level-ups…) reports what it did
   * here, and every prompt built from app context reads it back — so the
   * parts stay aware of each other instead of acting blind. Capped at 40;
   * oldest entries fall off.
   */
  reportToOverseer(source: string, note: string) {
    const log = (this.data.agentMemory.overseerLog ??= []);
    log.push({ at: this.nowString(), source, note: note.trim().slice(0, 160) });
    if (log.length > 40) log.splice(0, log.length - 40);
    this.save();
  }

  /** Send a diary entry off into the void — kept in the signal void log + a Desktop diary file. */
  sendToVoid(text: string) {
    const t = text.trim();
    if (!t) return;
    const at = this.nowString();
    (this.data.signal.voidLog ??= []).push({ id: this.newId(), at, text: t });
    this.data.signal.updated = at;
    const now = new Date();
    const stamp = now.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    void invoke('append_void', { label: localDay(now), text: `### ${stamp}\n${t}\n\n` }).catch(() => {});
    this.save();
  }

  /**
   * Record a conversation turn: keep it in the live thread AND append it to the
   * durable per-day Desktop transcript (Desktop/fr13nd-public/conversations/) so the
   * full history survives [CLEAR] and any loss of the working file. The
   * transcript write is fire-and-forget — it never blocks or breaks chat.
   */
  recordTurn(turn: ConversationTurn) {
    this.data.agentMemory.recentConversations.push(turn);
    this.data.agentMemory.updated = turn.at;
    const now = new Date();
    const name = this.data.settings.companionName || 'fr13nd';
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const entry = `### ${time} · you\n${turn.user}\n\n### ${time} · ${name}\n${turn.agent}\n\n`;
    void invoke('append_conversation', { label: localDay(now), text: entry }).catch(() => {});
    this.save();
  }

  resetDailies() {
    for (const quest of this.data.quests) {
      if (quest.cadence === 'Daily') {
        quest.completed = false;
        quest.progress = 0;
      }
    }
    for (const task of this.data.abode.tasks) {
      if (task.cadence === 'Daily') {
        task.completed = false;
        task.progress = 0;
      }
    }
    for (const task of this.data.pet.tasks) {
      if (task.cadence === 'Daily') {
        task.completed = false;
        task.progress = 0;
      }
    }
  }

  newId(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  /**
   * The stamp on every record. This used to be `toISOString()`, which wrote UTC
   * in a format that reads like local time — at UTC+3 a session logged at 01:00
   * was stamped 22:00 and filed under the previous day. Now genuinely local.
   * Records written before this change keep their old UTC values; they are not
   * rewritten, so historical times may read up to one offset early.
   */
  nowString(): string {
    return localStamp();
  }

  // Append the current in-progress reading to the all-time log, then reset
  // today — so signal can be logged as many times a day as needed.
  sealSignal() {
    const at = this.nowString();
    const today = localDay();
    this.data.signal.log.push({ ...this.data.signal.today, date: today, checkedIn: true, at });
    this.data.signal.updated = at;
    this.data.signal.today = emptySignalToday(today);
    this.save();
  }

  clockIn() {
    if (this.data.work.clockedInAt) return;
    this.data.work.clockedInAt = Date.now();
    this.data.work.updated = this.nowString();
    this.save();
  }

  clockOut() {
    const start = this.data.work.clockedInAt;
    if (!start) return;
    const end = Date.now();
    const minutes = Math.max(1, Math.round((end - start) / 60000));
    this.data.work.log.push({ id: this.newId(), start, end, minutes });
    this.data.work.clockedInAt = 0;
    this.data.work.updated = this.nowString();
    this.save();
  }
}

export const store = new WidgetStore();
