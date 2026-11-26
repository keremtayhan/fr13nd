// The tool protocol: schemas the models see, the executor that turns tool calls
// into store mutations, the text-action fallback parser for models without
// native tool-calling, capture routing, and response-integrity scrubbers.
// Small local models can't be trusted to call tools cleanly, so everything
// here is forgiving: fuzzy names, alias maps, coercion.

import { store } from '../store.svelte';
import { craftNeedKit, looksLikeNeedList, valueText } from '../craftNeeds';
import { asRecord } from './llm';
import { buildAppContext } from './context';
import type { AgentAdvice, CraftAreaId, QuestCadence, QuestKind, SignalMetricId } from '../types';
import { localDay } from '../day';

const SIGNAL_METRICS: SignalMetricId[] = [
  'intrusiveThoughts',
  'executiveDysfunction',
  'obsessiveThoughts',
  'dissociation',
  'depression',
];

function normalizeQuestKind(value: unknown): QuestKind {
  const key = String(value ?? '').trim().toLowerCase();
  const map: Record<string, QuestKind> = {
    main: 'Main',
    job: 'Job',
    work: 'Job',
    school: 'School',
    side: 'Side',
    ritual: 'Ritual',
    daily: 'Ritual',
  };
  return map[key] ?? 'Main';
}

function normalizeQuestCadence(value: unknown): QuestCadence {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const map: Record<string, QuestCadence> = {
    today: 'Today',
    daily: 'Daily',
    day: 'Daily',
    weekly: 'Weekly',
    week: 'Weekly',
    monthly: 'Monthly',
    month: 'Monthly',
    longarc: 'Long Arc',
    long: 'Long Arc',
    arc: 'Long Arc',
  };
  return map[key] ?? 'Daily';
}

function normalizeCraftAreaId(area: unknown): CraftAreaId | null {
  const key = String(area ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, CraftAreaId> = {
    music: 'music',
    gamedev: 'game_dev',
    gamedevelopment: 'game_dev',
    games: 'game_dev',
    modelling: 'modelling',
    modeling: 'modelling',
    model: 'modelling',
    drawing: 'drawing',
    draw: 'drawing',
    animating: 'animating',
    animation: 'animating',
    coding: 'coding',
    code: 'coding',
    programming: 'coding',
    gym: 'gym',
    fitness: 'gym',
    body: 'gym',
    reading: 'reading',
    read: 'reading',
    book: 'reading',
    books: 'reading',
    literature: 'reading',
  };
  return map[key] ?? null;
}

export function getCraftArea(area: unknown) {
  const id = normalizeCraftAreaId(area) ?? store.data.craft.focus;
  return store.data.craft.areas.find((a) => a.id === id) ?? store.data.craft.areas[0];
}

function normalizeCraftMode(value: unknown, areaId: CraftAreaId): string {
  const key = String(value ?? '').trim().toLowerCase();
  if (['make', 'practice', 'study', 'polish', 'body'].includes(key)) return key;
  if (areaId === 'gym') return 'body';
  if (areaId === 'reading') return 'study';
  return 'make';
}

function normalizeSignalMetric(value: unknown): SignalMetricId | null {
  const key = String(value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, SignalMetricId> = {
    intrusive: 'intrusiveThoughts',
    intrusivethoughts: 'intrusiveThoughts',
    intr: 'intrusiveThoughts',
    executive: 'executiveDysfunction',
    executivedysfunction: 'executiveDysfunction',
    exec: 'executiveDysfunction',
    dysfunction: 'executiveDysfunction',
    obsessive: 'obsessiveThoughts',
    obsessivethoughts: 'obsessiveThoughts',
    obsv: 'obsessiveThoughts',
    ocd: 'obsessiveThoughts',
    dissociation: 'dissociation',
    dissociated: 'dissociation',
    dissoc: 'dissociation',
    diss: 'dissociation',
    depression: 'depression',
    depressed: 'depression',
    depr: 'depression',
  };
  return map[key] ?? null;
}

function normalizeToolName(name: unknown): string {
  const key = String(name ?? '').trim().replace(/[^a-z0-9]/gi, '').toLowerCase();
  const map: Record<string, string> = {
    completequest: 'complete_quest',
    progressquest: 'progress_quest',
    addquest: 'add_quest',
    createquest: 'add_quest',
    newquest: 'add_quest',
    addquests: 'add_quests',
    createquests: 'add_quests',
    setquests: 'add_quests',
    editquest: 'edit_quest',
    updatequest: 'edit_quest',
    setqueststeps: 'set_quest_steps',
    setsteps: 'set_quest_steps',
    addsteps: 'set_quest_steps',
    addqueststeps: 'set_quest_steps',
    queststeps: 'set_quest_steps',
    breakdownquest: 'set_quest_steps',
    setquestbreakdown: 'set_quest_steps',
    deletequest: 'delete_quest',
    removequest: 'delete_quest',
    setsignal: 'set_signal',
    setsignalmetric: 'set_signal_metric',
    setmetric: 'set_signal_metric',
    logsignal: 'set_signal_metric',
    logvessel: 'log_vessel',
    setvessel: 'log_vessel',
    updatevessel: 'log_vessel',
    logbody: 'log_vessel',
    logwater: 'log_vessel',
    logsleep: 'log_vessel',
    logmeds: 'log_vessel',
    logmovement: 'log_vessel',
    logfuel: 'log_fuel',
    logmeal: 'log_fuel',
    logfood: 'log_fuel',
    addmeal: 'log_fuel',
    addfood: 'log_fuel',
    trackfuel: 'log_fuel',
    logsnack: 'log_fuel',
    addbasetask: 'add_base_task',
    addchore: 'add_base_task',
    addbase: 'add_base_task',
    addpettask: 'add_pet_task',
    addpet: 'add_pet_task',
    setcraftedge: 'set_craft_edge',
    setcraftfocus: 'set_craft_edge',
    setcraftplan: 'set_craft_edge',
    setcraftquests: 'set_craft_quests',
    setcraftquest: 'set_craft_quests',
    addcraftquests: 'set_craft_quests',
    addcraftquest: 'set_craft_quests',
    createcraftquests: 'set_craft_quests',
    completecraftquest: 'complete_craft_quest',
    finishcraftquest: 'complete_craft_quest',
    finishquest: 'complete_quest',
    donequest: 'complete_quest',
    logcraft: 'log_craft',
    logcraftsession: 'log_craft',
    logsession: 'log_craft',
    logworkout: 'log_craft',
    setadvice: 'set_advice',
    getcontext: 'get_context',
  };
  return map[key] ?? String(name ?? '');
}

function findQuest(args: Record<string, unknown>) {
  const id = String(args.id ?? '').trim();
  const title = String(args.title ?? args.name ?? '').trim().toLowerCase();
  return (
    store.data.quests.find((quest) => quest.id === id) ??
    (title ? store.data.quests.find((quest) => quest.title.trim().toLowerCase() === title) : undefined)
  );
}

// ── tool executor ───────────────────────────────────────────────────────────
export function executeTool(name: string, args: Record<string, unknown>): string {
  name = normalizeToolName(name);
  switch (name) {
    case 'get_context': {
      return buildAppContext();
    }
    case 'complete_quest': {
      const q = findQuest(args);
      if (!q) return `Quest ${args.id ?? args.title ?? args.name} not found.`;
      q.completed = true;
      q.progress = q.target;
      store.save();
      return `Quest "${q.title}" marked complete.`;
    }
    case 'progress_quest': {
      const q = findQuest(args);
      if (!q) return `Quest ${args.id ?? args.title ?? args.name} not found.`;
      q.progress = Math.min(q.progress + 1, q.target);
      if (q.progress >= q.target) q.completed = true;
      store.save();
      return `Quest "${q.title}" progress: ${q.progress}/${q.target}.`;
    }
    case 'add_quest': {
      const id = store.newId();
      const title = String(args.title ?? args.name ?? '').trim();
      if (!title) return 'No valid quest title provided.';
      store.data.quests.push({
        id,
        title,
        kind: normalizeQuestKind(args.kind),
        cadence: normalizeQuestCadence(args.cadence),
        target: Math.max(1, Math.round(Number(args.target ?? 1) || 1)),
        progress: 0,
        completed: false,
        note: String(args.note ?? args.requirements ?? ''),
      });
      store.save();
      return `Quest "${title}" added (${normalizeQuestKind(args.kind)} · ${normalizeQuestCadence(args.cadence)}).`;
    }
    case 'add_quests': {
      const incoming = Array.isArray(args.quests) ? args.quests : Array.isArray(args.items) ? args.items : [args];
      const added: string[] = [];
      for (const item of incoming) {
        const quest = asRecord(item);
        const title = String(quest.title ?? quest.name ?? '').trim();
        if (!title) continue;
        const id = store.newId();
        store.data.quests.push({
          id,
          title,
          kind: normalizeQuestKind(quest.kind),
          cadence: normalizeQuestCadence(quest.cadence),
          target: Math.max(1, Math.round(Number(quest.target ?? 1) || 1)),
          progress: 0,
          completed: false,
          note: String(quest.note ?? quest.requirements ?? ''),
        });
        added.push(title);
      }
      if (added.length) store.save();
      return added.length ? `Quests added: ${added.join(', ')}.` : 'No valid quests provided.';
    }
    case 'edit_quest': {
      const q = findQuest(args);
      if (!q) return `Quest ${args.id ?? args.title ?? args.name} not found.`;
      if (args.title) q.title = String(args.title);
      if (args.kind !== undefined) q.kind = normalizeQuestKind(args.kind);
      if (args.cadence !== undefined) q.cadence = normalizeQuestCadence(args.cadence);
      if (args.target !== undefined) q.target = Math.max(1, Math.round(Number(args.target) || q.target));
      if (args.note !== undefined) q.note = String(args.note);
      store.save();
      return `Quest "${q.title}" updated.`;
    }
    case 'set_quest_steps': {
      const q = findQuest(args);
      if (!q) return `Quest ${args.id ?? args.title ?? args.name} not found.`;
      const incoming = Array.isArray(args.steps)
        ? args.steps
        : Array.isArray(args.items)
          ? args.items
          : [];
      const steps = incoming
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          const r = asRecord(item);
          return String(r.text ?? r.title ?? r.step ?? '').trim();
        })
        .filter(Boolean)
        .map((text) => ({ id: store.newId(), text, done: false }));
      if (steps.length === 0) return `No steps provided for "${q.title}".`;
      const replace = Boolean(args.replace ?? true);
      q.steps = replace ? steps : [...(q.steps ?? []), ...steps];
      store.save();
      return `Steps ${replace ? 'set' : 'added'} for "${q.title}": ${steps.length}.`;
    }
    case 'delete_quest': {
      const before = store.data.quests.length;
      const q = findQuest(args);
      store.data.quests = q
        ? store.data.quests.filter((quest) => quest.id !== q.id)
        : store.data.quests.filter((quest) => quest.id !== args.id);
      store.save();
      return before > store.data.quests.length
        ? `Quest ${q?.title ?? args.id} deleted.`
        : `Quest ${args.id ?? args.title ?? args.name} not found.`;
    }
    case 'set_signal': {
      if (args.mood !== undefined) store.data.ritual.mood = String(args.mood);
      if (args.energy !== undefined) store.data.ritual.energy = Number(args.energy);
      if (args.focus !== undefined) store.data.ritual.focus = String(args.focus);
      store.data.ritual.lastCheckIn = store.nowString();
      store.save();
      return `Signal updated: mood=${store.data.ritual.mood} energy=${store.data.ritual.energy} focus=${store.data.ritual.focus}`;
    }
    case 'set_signal_metric': {
      const today = store.data.signal.today;
      const applied: string[] = [];
      const apply = (metricRaw: unknown, valueRaw: unknown) => {
        const id = normalizeSignalMetric(metricRaw);
        if (!id) return;
        const value = Math.max(0, Math.min(5, Math.round(Number(valueRaw) || 0)));
        today[id] = value;
        applied.push(`${id}=${value}`);
      };
      const metrics = asRecord(args.metrics);
      for (const [k, v] of Object.entries(metrics)) apply(k, v);
      if (args.metric !== undefined) apply(args.metric, args.value);
      for (const id of SIGNAL_METRICS) if (args[id] !== undefined) apply(id, args[id]);
      if (applied.length === 0) return 'No signal metric recognized.';
      if (typeof args.note === 'string') today.note = args.note;
      if (!today.date) today.date = localDay();
      today.at = store.nowString();
      store.data.signal.updated = today.at;
      store.save();
      return `Signal metrics set: ${applied.join(', ')}.`;
    }
    case 'log_vessel': {
      const v = store.data.vessel.today;
      const changed: string[] = [];
      if (args.water !== undefined) {
        v.water = Math.max(0, v.water + Math.round(Number(args.water) || 0));
        changed.push(`water=${v.water}`);
      }
      if (args.meals !== undefined) {
        v.meals = Math.max(0, v.meals + Math.round(Number(args.meals) || 0));
        changed.push(`meals=${v.meals}`);
      }
      if (args.movement !== undefined) {
        v.movement = Math.max(0, v.movement + Math.round(Number(args.movement) || 0));
        changed.push(`movement=${v.movement}m`);
      }
      if (args.sleep !== undefined) {
        v.sleep = Math.max(0, Math.min(24, Number(args.sleep) || 0));
        changed.push(`sleep=${v.sleep}h`);
      }
      if (args.meds !== undefined) {
        v.meds = Boolean(args.meds);
        changed.push(`meds=${v.meds ? 'taken' : 'no'}`);
      }
      if (typeof args.note === 'string' && args.note.trim()) v.note = args.note.trim();
      if (changed.length === 0) return 'Vessel: nothing to log.';
      if (!v.date) v.date = localDay();
      store.save();
      return `Vessel logged: ${changed.join(', ')}.`;
    }
    case 'log_fuel': {
      const name = String(args.name ?? args.food ?? args.item ?? '').trim();
      if (!name) return 'No food to log.';
      const kindKey = String(args.kind ?? '').trim().toLowerCase();
      const kind = (['breakfast', 'lunch', 'dinner', 'snack'].includes(kindKey) ? kindKey : 'snack') as
        | 'breakfast'
        | 'lunch'
        | 'dinner'
        | 'snack';
      const kcal = Math.max(0, Math.round(Number(args.kcal ?? args.calories ?? 0) || 0));
      store.data.fuel.today.entries.push({ id: store.newId(), at: store.nowString(), name, kcal, kind, note: '', estimated: true });
      store.data.fuel.updated = store.nowString();
      store.save();
      return `Logged ${kind}: "${name}"${kcal ? ` (${kcal} kcal)` : ''}.`;
    }
    case 'add_base_task': {
      const title = String(args.title ?? args.name ?? '').trim();
      if (!title) return 'No base task title provided.';
      store.data.abode.tasks.push({
        id: store.newId(),
        room: String(args.room ?? ''),
        title,
        cadence: String(args.cadence ?? 'Daily'),
        note: String(args.note ?? ''),
        progress: 0,
        target: Math.max(1, Math.round(Number(args.target ?? 1) || 1)),
        completed: false,
      });
      store.save();
      return `Base task added: "${title}".`;
    }
    case 'add_pet_task': {
      const title = String(args.title ?? args.name ?? '').trim();
      if (!title) return 'No Pet task title provided.';
      store.data.pet.tasks.push({
        id: store.newId(),
        title,
        kind: String(args.kind ?? 'care'),
        cadence: String(args.cadence ?? 'Daily'),
        note: String(args.note ?? ''),
        progress: 0,
        target: Math.max(1, Math.round(Number(args.target ?? 1) || 1)),
        completed: false,
      });
      store.save();
      return `Pet task added: "${title}".`;
    }
    case 'set_craft_edge': {
      const area = getCraftArea(args.area);
      if (args.project !== undefined) area.project = String(args.project ?? '').trim();
      if (args.nextAction !== undefined || args.edge !== undefined) {
        area.nextAction = String(args.nextAction ?? args.edge ?? '').trim();
        area.edge = area.nextAction;
      }
      if (args.drill !== undefined) area.drill = String(args.drill ?? '').trim();
      if (args.reference !== undefined) area.reference = String(args.reference ?? '').trim();
      if (args.blocker !== undefined) area.blocker = String(args.blocker ?? '').trim();
      if (args.targetMinutes !== undefined) {
        area.targetMinutes = Math.max(5, Math.round(Number(args.targetMinutes) || area.targetMinutes));
      }
      store.data.craft.focus = area.id;
      store.data.craft.updated = store.nowString();
      store.save();
      return `Craft plan set for ${area.title}: ${area.nextAction || area.project || '(blank)'}.`;
    }
    case 'set_craft_quests': {
      const area = getCraftArea(args.area);
      const incoming = Array.isArray(args.quests) ? args.quests : args.quest ? [args.quest] : [];
      const quests = incoming
        .map((item) => item as Record<string, unknown>)
        .map((item) => {
          const title = valueText(item.title ?? item.name);
          const rawNeed = valueText(
            item.requirements ?? item.needs ?? item.materials ?? item.tools ?? item.supplies ?? item.kit ?? item.setup
          );
          const note = valueText(item.note);

          return {
            id: store.newId(),
            title,
            mode: normalizeCraftMode(item.mode, area.id),
            requirements: looksLikeNeedList(rawNeed) ? rawNeed : craftNeedKit(area.id, title),
            note: looksLikeNeedList(rawNeed) ? note : note || rawNeed,
            completed: false,
            createdAt: store.nowString(),
          };
        })
        .filter((item) => item.title);

      if (quests.length === 0) {
        return `No valid craft quests provided for ${area.title}.`;
      }

      if (Boolean(args.replace ?? true)) {
        const completed = area.quests.filter((quest) => quest.completed);
        area.quests = [...quests, ...completed];
      } else {
        area.quests = [...area.quests, ...quests];
      }

      store.data.craft.focus = area.id;
      store.data.craft.updated = store.nowString();
      store.save();
      return `Craft quests set for ${area.title}: ${quests.length}.`;
    }
    case 'complete_craft_quest': {
      const area = getCraftArea(args.area);
      const title = String(args.title ?? '').trim().toLowerCase();
      const quest =
        area.quests.find((item) => item.id === args.id) ??
        (title ? area.quests.find((item) => item.title.trim().toLowerCase() === title) : undefined);
      if (!quest) return `Craft quest ${args.id} not found for ${area.title}.`;
      area.quests = area.quests.map((item) => (item.id === quest.id ? { ...item, completed: true } : item));
      store.data.craft.focus = area.id;
      store.data.craft.updated = store.nowString();
      store.save();
      return `Craft quest completed for ${area.title}: ${quest.title}.`;
    }
    case 'log_craft': {
      const area = getCraftArea(args.area);
      const minutes = Math.max(1, Math.round(Number(args.minutes ?? area.targetMinutes)));
      area.sessions = [
        ...area.sessions,
        {
          id: store.newId(),
          at: store.nowString(),
          minutes,
          energy: Math.max(1, Math.min(5, Math.round(Number(args.energy ?? 3)))),
          mode: String(args.mode ?? 'make'),
          note: String(args.note ?? ''),
        },
      ];
      store.data.craft.focus = area.id;
      store.data.craft.updated = store.nowString();
      store.save();
      return `Craft session logged for ${area.title}: ${minutes}m.`;
    }
    case 'set_advice': {
      const rawItems = Array.isArray(args.items) ? args.items : [];
      const extra: string[] = [];
      const chips: AgentAdvice[] = [];
      for (const item of rawItems) {
        const action = asRecord(asRecord(item).action);
        const type = String(action.type ?? '');
        // the model sometimes nests a real quest-create inside an advice item —
        // run it instead of storing a dead chip
        if (type === 'add_quest' || type === 'add_quests') {
          extra.push(executeTool(type, { ...action }));
        } else {
          chips.push(item as AgentAdvice);
        }
      }
      store.data.agentMemory.advice = chips.slice(0, 3);
      store.save();
      const parts: string[] = [];
      if (store.data.agentMemory.advice.length) parts.push(`${store.data.agentMemory.advice.length} advice items set.`);
      parts.push(...extra);
      return parts.length ? parts.join(' ') : 'No advice items set.';
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// Distinctive phrases that only appear in the system prompt / tool schema.
const LEAK_MARKERS = [
  'you are fr13nd',
  'you are the capture router',
  'you have access to app actions',
  'rules of engagement',
  'routing guide',
  'output rules',
  'current app context',
  'dialed to 9000',
];

// A line that is just a tool name (optionally bold/heading/colon decorated).
const TOOL_LABEL_RE =
  /^\s*[*_#>\s]*(set_advice|add_quests?|progress_quest|complete_quest|edit_quest|set_quest_steps|delete_quest|set_signal(_metric)?|log_vessel|add_base_task|add_pet_task|set_craft_edge|set_craft_quests|complete_craft_quest|log_craft|get_context)[*_:\s]*$/i;

/**
 * Small local models sometimes parrot the system prompt back instead of
 * answering. Cut any echoed instructions / tool-schema / context dump out of
 * what the operator actually sees in the chat.
 */
export function stripLeakedInstructions(text: string): string {
  let out = text.replace(/<\/?actions>/gi, '');

  // if the model started reciting the prompt, cut from the first marker on
  const lower = out.toLowerCase();
  let cut = -1;
  for (const marker of LEAK_MARKERS) {
    const i = lower.indexOf(marker);
    if (i >= 0 && (cut === -1 || i < cut)) cut = i;
  }
  if (cut >= 0) out = out.slice(0, cut);

  // drop stray fence markers, raw tool-schema lines, and bare tool-name labels
  out = out
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .filter((line) => !/^\s*\{?\s*"(name|tool|action|args|text|title)"\s*:/i.test(line))
    .filter((line) => !TOOL_LABEL_RE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

// ── parse <actions> block and run it ─────────────────────────────────────────
type ToolAction = {
  name?: string;
  tool?: string;
  action?: string;
  args?: Record<string, unknown>;
} & Record<string, unknown>;

function cleanActionPayload(payload: string): string {
  const cleaned = payload
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/^json\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
  const start = cleaned.search(/[\[{]/);
  if (start < 0) return cleaned;
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  return end >= start ? cleaned.slice(start, end + 1) : cleaned.slice(start);
}

function coerceActions(parsed: unknown): ToolAction[] {
  if (Array.isArray(parsed)) {
    // a bare array of advice items ({text, action}) with no tool name is really
    // a set_advice call the model forgot to wrap
    const looksLikeAdvice =
      parsed.length > 0 &&
      parsed.every((item) => {
        const r = asRecord(item);
        return r.text !== undefined && r.action !== undefined && r.name === undefined && r.tool === undefined;
      });
    if (looksLikeAdvice) return [{ name: 'set_advice', args: { items: parsed } } as ToolAction];

    return parsed.map((item) => asRecord(item) as ToolAction);
  }

  const record = asRecord(parsed);
  if (Array.isArray(record.actions)) return record.actions.map((item) => asRecord(item) as ToolAction);
  if (Array.isArray(record.tools)) return record.tools.map((item) => asRecord(item) as ToolAction);
  if (record.name || record.tool || record.action) return [record as ToolAction];

  return [];
}

function actionArgs(action: ToolAction): Record<string, unknown> {
  const direct = { ...action };
  delete direct.name;
  delete direct.tool;
  delete direct.action;
  delete direct.args;

  return { ...direct, ...asRecord(action.args) };
}

/**
 * JSON that merely *appears* in prose (code samples, lyric metadata, examples
 * the operator asked for) must never be executed as actions. Loose payload
 * formats (fence / bare) only count when the JSON explicitly references a
 * real tool name — or an advice-item action type for the bare set_advice
 * fallback. The <actions> wrapper stays an explicit opt-in with no gate.
 */
const KNOWN_TOOL_RE =
  /"(?:name|tool|action)"\s*:\s*"(?:get_context|complete_quest|progress_quest|add_quests?|edit_quest|set_quest_steps|delete_quest|set_signal(?:_metric)?|log_vessel|log_fuel|add_base_task|add_pet_task|set_craft_edge|set_craft_quests|complete_craft_quest|log_craft|set_advice)"|"type"\s*:\s*"(?:complete_quest|progress_quest|open_panel)"/i;

/**
 * Find an action payload in a model reply. Small models rarely use the exact
 * <actions> wrapper — they drop the JSON in a ```json fence or bare at the end.
 * Accept all three, and report the source so we know how strict to be on errors.
 */
function extractActionPayload(raw: string): {
  payload: string | null;
  visible: string;
  source: 'tags' | 'fence' | 'bare';
} {
  const tags = raw.match(/<actions>\s*([\s\S]*?)\s*<\/actions>/i);
  if (tags) {
    return { payload: tags[1], visible: raw.replace(/<actions>[\s\S]*?<\/actions>/i, ''), source: 'tags' };
  }

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && KNOWN_TOOL_RE.test(fence[1])) {
    return { payload: fence[1], visible: raw.replace(/```(?:json)?[\s\S]*?```/i, ''), source: 'fence' };
  }

  const bare = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})\s*$/);
  if (bare && KNOWN_TOOL_RE.test(bare[1])) {
    return { payload: bare[1], visible: raw.slice(0, bare.index ?? 0), source: 'bare' };
  }

  return { payload: null, visible: raw, source: 'bare' };
}

/** Parse a model reply, execute any actions it carries, and report what ran. */
export function executeActions(raw: string): { visible: string; results: string[] } {
  const { payload, visible: rawVisible, source } = extractActionPayload(raw);
  const visible = stripLeakedInstructions(rawVisible);
  if (!payload) return { visible, results: [] };

  try {
    const parsed = JSON.parse(cleanActionPayload(payload));
    const actions = coerceActions(parsed);
    const results = actions
      .map((action) => {
        const name = String(action.name ?? action.tool ?? action.action ?? '');
        if (!name.trim()) return '';
        return executeTool(name, actionArgs(action));
      })
      .filter(Boolean);
    return { visible, results };
  } catch (e: unknown) {
    // only surface a parse error when the model explicitly used <actions> tags
    if (source === 'tags') {
      const message = e instanceof Error ? e.message : String(e);
      return { visible, results: [`[ACTIONS FAILED] ${message}`] };
    }
    return { visible, results: [] };
  }
}

// ── capture routing ──────────────────────────────────────────────────────────
export const TOOL_PROMPT = `
You have access to app actions. After your response, if you want to take actions, append a JSON block like this (no extra text after it):
<actions>
[
  {"name": "complete_quest", "args": {"id": "QUEST_ID"}},
  {"name": "progress_quest", "args": {"id": "QUEST_ID"}},
  {"name": "add_quest", "args": {"title": "...", "kind": "Main|Job|School|Side|Ritual", "cadence": "Today|Daily|Weekly|Monthly|Long Arc", "target": 1, "note": "..."}},
  {"name": "edit_quest", "args": {"id": "QUEST_ID", "title": "...", "note": "..."}},
  {"name": "set_quest_steps", "args": {"id": "QUEST_ID", "steps": ["first small step", "second step", "third step"], "replace": true}},
  {"name": "delete_quest", "args": {"id": "QUEST_ID"}},
  {"name": "set_signal", "args": {"mood": "...", "energy": 3, "focus": "..."}},
  {"name": "set_signal_metric", "args": {"metrics": {"intrusiveThoughts": 0, "executiveDysfunction": 0, "obsessiveThoughts": 0, "dissociation": 0, "depression": 0}}},
  {"name": "log_vessel", "args": {"water": 1, "sleep": 7, "movement": 20, "meals": 1, "meds": true, "note": "..."}},
  {"name": "log_fuel", "args": {"name": "what they ate", "kcal": 400, "kind": "breakfast|lunch|dinner|snack"}},
  {"name": "add_base_task", "args": {"title": "...", "room": "...", "cadence": "Daily|Weekly", "note": "..."}},
  {"name": "add_pet_task", "args": {"title": "...", "cadence": "Daily|Weekly", "note": "..."}},
  {"name": "set_craft_edge", "args": {"area": "music|game_dev|modelling|drawing|animating|coding|gym|reading", "project": "...", "nextAction": "...", "drill": "...", "reference": "...", "blocker": "...", "targetMinutes": 30}},
  {"name": "set_craft_quests", "args": {"area": "music|game_dev|modelling|drawing|animating|coding|gym|reading", "quests": [{"title": "small concrete craft quest", "mode": "make|practice|study|polish|body", "requirements": "tools/materials/setup needed, e.g. notebook, 0.5 mechanical pencil, timer"}], "replace": true}},
  {"name": "complete_craft_quest", "args": {"area": "music|game_dev|modelling|drawing|animating|coding|gym|reading", "id": "CRAFT_QUEST_ID", "title": "optional exact title fallback"}},
  {"name": "log_craft", "args": {"area": "music|game_dev|modelling|drawing|animating|coding|gym|reading", "minutes": 30, "mode": "make|practice|study|polish|body", "note": "..."}},
  {"name": "set_advice", "args": {"items": [{"text": "short chip label", "action": {"type": "complete_quest|progress_quest|open_panel|custom", "id": "QUEST_ID_if_needed"}}]}}
]
</actions>
Only include actions you actually want to execute. set_advice items appear as clickable chips in compact mode.
For log_vessel, water/meals/movement are added to today's running total; sleep/meds are set. Signal metrics are on a 0-5 scale.
When the operator asks you to set craft quests, call set_craft_quests for the relevant craft area. Keep craft quest titles plain, concrete, and visibly finishable in one focused session. No poetic or oracle-style titles. Always include requirements as the tools, materials, and setup the operator needs ready before starting; do not use requirements for completion criteria.`;

const CAPTURE_ROUTER = `You are the CAPTURE ROUTER for a personal life widget. The operator just dumped one raw thought. Decide where it belongs and FILE it by emitting ONLY an <actions> JSON block — no commentary, no greeting, nothing before or after the block.

Routing guide:
- Something to do / remember / a task → add_quest. Default kind "Side" and cadence "Today" unless it clearly recurs ("every day" → Daily), is schoolwork (School), or is a job task (Job).
- A feeling, mood, headspace, or symptom → set_signal for a one-line mood/focus, and/or set_signal_metric (0-5) for intrusiveThoughts, executiveDysfunction, obsessiveThoughts, dissociation, depression. Infer reasonable severities from the wording.
- Body & health — drank water, slept N hours, took meds, ate, moved/walked/exercised minutes → log_vessel.
- Did craft work (music, drawing, coding, modelling, animating, game dev, gym, reading) → log_craft. Planning craft work → set_craft_quests.
- A home/chore task → add_base_task. Anything for Pet → add_pet_task.

If the thought covers several of these, emit multiple actions. Always emit at least one action. Never invent quest ids — only reference ids that appear in the context below.`;

export function buildCaptureSystem(): string {
  return `${CAPTURE_ROUTER}
${TOOL_PROMPT}

CURRENT APP CONTEXT (existing ids you may reference):
${buildAppContext()}`;
}

/** Offline / model-failure safety net: never lose a captured thought. */
export function heuristicCapture(text: string): { name: string; args: Record<string, unknown> } {
  const t = text.toLowerCase();

  if (/\b(took|taken)\b.*\b(meds?|medication|pills?)\b|\bmeds?\b/.test(t)) {
    return { name: 'log_vessel', args: { meds: true } };
  }
  const sleep = t.match(/(\d+(?:\.\d+)?)\s*(?:h\b|hours?\b)/);
  if (sleep && /\bsl(ept|eep)\b|\bwoke\b|\bnap\b/.test(t)) {
    return { name: 'log_vessel', args: { sleep: Number(sleep[1]) } };
  }
  if (/\b(drank|water|hydrate|glass|cup|bottle)\b/.test(t) && !/\bquest\b/.test(t)) {
    return { name: 'log_vessel', args: { water: 1 } };
  }
  if (/\b(ate|eat|eating|meal|breakfast|lunch|dinner|snack|snacked|food)\b/.test(t)) {
    return { name: 'log_fuel', args: { name: text.trim().slice(0, 80) } };
  }

  const recurring = /\b(every ?day|daily|each day)\b/.test(t);
  return {
    name: 'add_quest',
    args: { title: text.trim().slice(0, 120), kind: 'Side', cadence: recurring ? 'Daily' : 'Today' },
  };
}

// ── native tool-calling schemas ──────────────────────────────────────────────
const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

function toolDef(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

const KINDS = 'Main|Job|School|Side|Ritual';
const CADENCES = 'Today|Daily|Weekly|Monthly|Long Arc';
const AREAS = 'music|game_dev|modelling|drawing|animating|coding|gym|reading';

export const AGENT_TOOLS = [
  toolDef('add_quest', 'Create a new quest / directive. Call whenever the operator names something they need to do, remember, start, or commit to — even casually mentioned.', {
    title: str('short imperative title'),
    kind: str(`one of ${KINDS}`),
    cadence: str(`one of ${CADENCES}`),
    target: num('reps to finish, default 1'),
    note: str('what counts as done / requirements'),
  }, ['title']),
  toolDef('progress_quest', 'Add one unit of progress to a quest. Call when the operator reports partial progress on an open quest.', { id: str('quest id') }, ['id']),
  toolDef('complete_quest', 'Mark a quest complete. Call when the operator says they finished, did, or handled something matching an open quest.', { id: str('quest id') }, ['id']),
  toolDef('edit_quest', 'Edit a quest. Call when the operator wants a quest renamed, rescheduled, or its note changed.', { id: str('quest id'), title: str(''), kind: str(KINDS), cadence: str(CADENCES), note: str('') }, ['id']),
  toolDef('set_quest_steps', "Break a quest into an ordered checklist of small steps, shown in that quest's dropdown drawer. Call when the operator asks you to break down, split up, or outline the steps of a quest, or when a multi-step quest would clearly be easier with sub-steps. Keep steps short, concrete, and in order.", {
    id: str('quest id'),
    title: str('exact quest title, as a fallback when id is unknown'),
    steps: { type: 'array', description: 'ordered list of short step strings', items: { type: 'string' } },
    replace: { type: 'boolean', description: 'replace existing steps (default true) or append to them' },
  }, ['steps']),
  toolDef('delete_quest', 'Delete a quest. Call when the operator wants one gone / cancelled.', { id: str('quest id') }, ['id']),
  toolDef('set_signal', 'Set mood, energy (1-5), and focus. Call when the operator describes how they feel, their energy, or their headspace.', { mood: str(''), energy: num('1-5'), focus: str('') }),
  toolDef('set_signal_metric', "Set today's mental signal metrics, each 0-5. Call when the operator mentions intrusive or obsessive thoughts, executive dysfunction, dissociation, or feeling depressed.", {
    intrusiveThoughts: num('0-5'),
    executiveDysfunction: num('0-5'),
    obsessiveThoughts: num('0-5'),
    dissociation: num('0-5'),
    depression: num('0-5'),
  }),
  toolDef('log_vessel', 'Log body upkeep. Call when the operator mentions drinking water, hours slept, taking meds, movement/walk/exercise minutes, or how many meals they had. water/meals/movement add to today; sleep/meds set.', {
    water: num('glasses to add'),
    meals: num('meals to add'),
    movement: num('minutes to add'),
    sleep: num('hours slept (sets)'),
    meds: { type: 'boolean', description: 'meds taken' },
    note: str(''),
  }),
  toolDef('log_fuel', 'Log a specific food, meal, or snack the operator ate, with an estimated calorie count. Call whenever they mention eating or drinking something specific.', {
    name: str('what they ate'),
    kcal: num('estimated calories — estimate from the food if not stated'),
    kind: str('breakfast|lunch|dinner|snack'),
  }, ['name']),
  toolDef('add_base_task', 'Add a household / base chore. Call when the operator names housework: cleaning, dishes, laundry, repairs.', { title: str(''), room: str(''), cadence: str('Daily|Weekly'), note: str('') }, ['title']),
  toolDef('add_pet_task', 'Add a task for Pet. Call when the operator mentions something to do for or with Pet.', { title: str(''), cadence: str('Daily|Weekly'), note: str('') }, ['title']),
  toolDef('set_craft_edge', 'Set the plan for a craft area. Call when the operator states a project, next move, drill, reference, or blocker for one of their crafts.', {
    area: str(AREAS), project: str(''), nextAction: str('the next concrete move'), drill: str(''), reference: str(''), blocker: str(''), targetMinutes: num(''),
  }, ['area']),
  toolDef('set_craft_quests', 'Set concrete, one-session craft quests for an area. Call when the operator asks for craft quests, drills, or missions.', {
    area: str(AREAS),
    quests: {
      type: 'array',
      description: 'list of {title, mode, requirements}',
      items: { type: 'object', properties: { title: str(''), mode: str('make|practice|study|polish|body'), requirements: str('tools/materials needed') } },
    },
  }, ['area', 'quests']),
  toolDef('complete_craft_quest', 'Complete a craft quest. Call when the operator says they finished one.', { area: str(AREAS), id: str('craft quest id'), title: str('exact title fallback') }, ['area']),
  toolDef('log_craft', 'Log a craft work session. Call when the operator reports time spent on music, game dev, modelling, drawing, animating, coding, gym, or reading.', { area: str(AREAS), minutes: num(''), mode: str('make|practice|study|polish|body'), note: str('') }, ['area']),
  toolDef('set_advice', 'Set 2-3 clickable next-action chips for the compact bar. Call after a brief or review, or when the operator asks what to do next.', {
    items: {
      type: 'array',
      description: 'list of {text, action}',
      items: { type: 'object', properties: { text: str('short chip label'), action: { type: 'object', description: 'type: open_panel|complete_quest|progress_quest|custom' } } },
    },
  }, ['items']),
];

// Anthropic tool shape (name / description / input_schema), mapped from AGENT_TOOLS.
export const ANTHROPIC_TOOLS = AGENT_TOOLS.map((t) => {
  const fn = (t as { function: { name: string; description: string; parameters: unknown } }).function;
  return { name: fn.name, description: fn.description, input_schema: fn.parameters };
});

const UNVERIFIED_ACTION_CLAIM = /\b(?:i(?:'ve| have)|we(?:'ve| have)|i just|we just)\b[^\n.!?]{0,120}\b(?:logged|recorded|created|added|set|updated|completed|marked|deleted|filed|saved|changed|cleared|moved)\b/i;
// Only verbs that can't open an honest imperative/descriptive sentence. "Set a
// timer", "Marked improvement", "Cleared for takeoff" are things fr13nd SAYS —
// stripping them made replies look like failed commands. The I've/I-just form
// above still catches those verbs when they're framed as claims.
const BARE_ACTION_STATUS = /^\s*(?:[-*•]\s*)?(?:(?:quest|task|signal|vessel|water|sleep|movement|meal|fuel|note|craft|recipe|entry)\s+)?(?:logged|recorded|created|added|updated|completed|deleted|filed|saved)\b/i;

/**
 * A provider occasionally writes a past-tense action claim without ever using
 * a tool. Keep the UI honest: verified actions are rendered from `results`,
 * while these unsupported claims are removed and explicitly flagged.
 */
export function removeUnverifiedActionClaims(text: string): string {
  let removed = false;
  const safe = text
    .split('\n')
    .filter((line) => {
      if (UNVERIFIED_ACTION_CLAIM.test(line) || BARE_ACTION_STATUS.test(line)) {
        removed = true;
        return false;
      }
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!removed) return text;
  const fallback = safe || 'No app action was executed.';
  return `${fallback}\n\n[NO APP ACTION EXECUTED — unverified claim removed.]`;
}

export function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return asRecord(raw);
}
