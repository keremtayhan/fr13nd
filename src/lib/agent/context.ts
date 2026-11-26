// Prompt-context builders: turn the live store into the text the model reads —
// current app state, multi-day trends, the weekly correlation digest, and the
// full system prompt. Pure read-only functions over the store.

import { store } from '../store.svelte';
import type { MentalSignalDay, SignalMetricId } from '../types';
import { localDay } from '../day';

/**
 * Whether the body trackers (VESSEL + FUEL) are visible to the model at all.
 * Only 'on' exposes them; 'quiet' and 'off' keep the panels for the operator's
 * own use while withholding the numbers from every prompt the agent sees.
 */
export function bodyVisibleToAgent(): boolean {
  return (store.data.settings.bodyTracking ?? 'quiet') === 'on';
}

export function buildAppContext() {
  const quests = store.data.quests
    .map(
      (q) =>
        `[${q.kind}] id=${q.id} "${q.title}" cadence=${q.cadence} progress=${q.progress}/${q.target} completed=${q.completed} note="${q.note}"`
    )
    .join('\n');
  const r = store.data.ritual;
  const profile = store.data.agentMemory.profile.join('; ');
  const notes = store.data.agentMemory.notes.join('; ');
  const today = localDay();
  const craft = store.data.craft.areas
    .map((area) => {
      const todayMinutes = area.sessions
        .filter((session) => session.at.slice(0, 10) === today)
        .reduce((sum, session) => sum + session.minutes, 0);
      const recent = area.sessions
        .slice(-3)
        .map((session) => `${session.at} ${session.minutes}m H${session.energy} "${session.note}"`)
        .join('; ');
      const craftQuests = area.quests
        .map((quest) => `id=${quest.id} done=${quest.completed} mode=${quest.mode} "${quest.title}" needs="${quest.requirements || quest.note}"`)
        .join('; ');
      return `${area.title} id=${area.id} project="${area.project || ''}" next="${area.nextAction || area.edge || ''}" drill="${area.drill || ''}" reference="${area.reference || ''}" blocker="${area.blocker || ''}" quests=${craftQuests || '(none)'} today=${todayMinutes}/${area.targetMinutes}m recent=${recent || '(none)'}`;
    })
    .join('\n');
  const sig = store.data.signal.today;
  const vessel = store.data.vessel.today;
  const fuel = store.data.fuel.today;
  const fuelTotal = fuel.entries.reduce((s, e) => s + (e.kcal || 0), 0);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const mealSched = (store.data.fuel.mealTimes ?? [])
    .map((m) => {
      const logged = fuel.entries.some((e) => e.kind === m.id);
      const [hh, mm] = m.time.split(':').map(Number);
      const tMin = (hh || 0) * 60 + (mm || 0);
      const st = logged ? 'eaten' : nowMin > tMin + 15 ? 'OVERDUE' : nowMin >= tMin - 20 ? 'now' : 'upcoming';
      return `${m.id} ${m.time} ${st}`;
    })
    .join(', ');
  const nowStr = new Date().toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const work = store.data.work;
  const wToday = localDay();
  const workToday = work.log.filter((s) => localDay(new Date(s.start)) === wToday).reduce((a, s) => a + s.minutes, 0);
  const workStatus = work.clockedInAt
    ? `clocked IN since ${new Date(work.clockedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : 'clocked out';
  const workOver = work.clockedInAt && workToday > work.targetMinutes ? ` [OVERTIME +${workToday - work.targetMinutes}m past the day]` : '';
  const overseerReports = (store.data.agentMemory.overseerLog ?? [])
    .slice(-10)
    .map((e) => `[${e.at.slice(5)}] ${e.source}: ${e.note}`)
    .join('\n');
  const sections = [
    `NOW: ${nowStr} (operator local time)`,
    `QUESTS:\n${quests || '(none)'}`,
    `SIGNAL: mood=${r.mood} energy=${r.energy}/5 focus="${r.focus}" metrics(intr=${sig.intrusiveThoughts} exec=${sig.executiveDysfunction} obsv=${sig.obsessiveThoughts} diss=${sig.dissociation} depr=${sig.depression})`,
  ];

  // Body data is fed to the model only when the operator has it switched ON.
  // On 'quiet'/'off' the numbers are simply absent from the prompt — the surest
  // way to stop unwanted commentary is to never hand him the data.
  if (bodyVisibleToAgent()) {
    sections.push(
      `VESSEL: water=${vessel.water} sleep=${vessel.sleep}h movement=${vessel.movement}m meals=${vessel.meals} meds=${vessel.meds}`,
      `FUEL: ${fuelTotal}kcal across ${fuel.entries.length} item(s) today${store.data.fuel.targetKcal ? ` (target ${store.data.fuel.targetKcal})` : ''}${mealSched ? `\nMEAL TIMES: ${mealSched}` : ''}`
    );
  }

  sections.push(
    `WORK: ${workStatus}, ${workToday}m logged today (target ${work.targetMinutes}m, schedule 9:00-18:00)${workOver}`,
    `CRAFT:\nfocus=${store.data.craft.focus}\n${craft}`,
    `PROFILE: ${profile}\nNOTES: ${notes}`,
    `SUBSYSTEM REPORTS (what your other AI parts already did on their own — oldest first; don't repeat their work):\n${overseerReports || '(none yet)'}`
  );

  return sections.join('\n\n');
}

function signalLoad(d: MentalSignalDay): number {
  return d.intrusiveThoughts + d.executiveDysfunction + d.obsessiveThoughts + d.dissociation + d.depression;
}

/** Short multi-day trend digest so the agent can be perceptive, not just reactive. */
export function buildTrends(): string {
  const lines: string[] = [];
  const now = Date.now();
  const daysAgo = (iso: string) => (iso ? Math.round((now - new Date(iso).getTime()) / 86400000) : 999);

  // signal direction over the last ~7 sealed days
  const days = [...store.data.signal.log];
  if (store.data.signal.today.checkedIn) days.push(store.data.signal.today);
  const recent = days.slice(-7);
  if (recent.length >= 2) {
    const loads = recent.map(signalLoad);
    const delta = loads[loads.length - 1] - loads[0];
    const dir = delta > 2 ? 'rising' : delta < -2 ? 'falling' : 'flat';
    const avg = Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
    const metrics: SignalMetricId[] = ['intrusiveThoughts', 'executiveDysfunction', 'obsessiveThoughts', 'dissociation', 'depression'];
    const worst = metrics
      .map((m) => ({ m, v: recent.reduce((s, d) => s + (d[m] || 0), 0) / recent.length }))
      .sort((a, b) => b.v - a.v)[0];
    lines.push(`signal: ${recent.length}-day load avg ${avg}/25, ${dir}; highest "${worst.m}" (avg ${worst.v.toFixed(1)}/5)`);
  }

  // craft areas gone quiet
  const stale = store.data.craft.areas
    .map((a) => ({ title: a.title, d: a.sessions.length ? daysAgo(a.sessions[a.sessions.length - 1].at) : 999 }))
    .filter((x) => x.d >= 5)
    .map((x) => `${x.title}(${x.d >= 999 ? 'never' : x.d + 'd'})`);
  if (stale.length) lines.push(`craft untouched 5d+: ${stale.join(', ')}`);

  // vessel averages — withheld unless body tracking is switched fully on
  if (bodyVisibleToAgent()) {
    const vlog = [...store.data.vessel.log, store.data.vessel.today].filter((v) => v.date).slice(-7);
    if (vlog.length >= 2) {
      const avgSleep = (vlog.reduce((s, v) => s + (v.sleep || 0), 0) / vlog.length).toFixed(1);
      const avgWater = Math.round(vlog.reduce((s, v) => s + (v.water || 0), 0) / vlog.length);
      lines.push(`vessel: ${vlog.length}-day avg sleep ${avgSleep}h, water ${avgWater}/day`);
    }
  }

  const longHaul = store.data.quests.filter((q) => !q.completed && (q.cadence === 'Long Arc' || q.kind === 'Main')).length;
  if (longHaul) lines.push(`${longHaul} long-haul quest(s) still open`);

  return lines.length ? lines.join('\n') : '(not enough history yet)';
}

/**
 * A per-day digest of the last 7 days across every signal — mood/exec load,
 * sleep/water/movement/weight/meds, fuel (kcal + protein), work hours, craft
 * minutes — laid out one line per day so the model can correlate ACROSS them.
 */
export function buildWeeklyDigest(): string {
  const dayKey = (d: Date) => localDay(d);
  const todayKey = dayKey(new Date());
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }

  const signalByDate = new Map<string, (typeof store.data.signal.today)>();
  for (const s of store.data.signal.log) signalByDate.set(s.date, s);
  if (store.data.signal.today.checkedIn) signalByDate.set(store.data.signal.today.date, store.data.signal.today);

  const vesselByDate = new Map<string, (typeof store.data.vessel.today)>();
  for (const v of store.data.vessel.log) vesselByDate.set(v.date, v);
  vesselByDate.set(store.data.vessel.today.date, store.data.vessel.today);

  const fuelByDate = new Map<string, (typeof store.data.fuel.today)>();
  for (const f of store.data.fuel.log) fuelByDate.set(f.date, f);
  fuelByDate.set(store.data.fuel.today.date, store.data.fuel.today);

  const workByDate = new Map<string, number>();
  for (const w of store.data.work.log) {
    const k = localDay(new Date(w.start));
    workByDate.set(k, (workByDate.get(k) || 0) + w.minutes);
  }

  const craftByDate = new Map<string, number>();
  for (const area of store.data.craft.areas)
    for (const s of area.sessions) {
      const k = s.at.slice(0, 10);
      craftByDate.set(k, (craftByDate.get(k) || 0) + s.minutes);
    }

  const rows = days.map((k) => {
    const parts: string[] = [`${k}${k === todayKey ? ' (today)' : ''}:`];
    const sig = signalByDate.get(k);
    if (sig) parts.push(`mind load ${signalLoad(sig)}/25 (exec ${sig.executiveDysfunction}/5, dep ${sig.depression}/5, dissoc ${sig.dissociation}/5)`);
    if (bodyVisibleToAgent()) {
      const ves = vesselByDate.get(k);
      if (ves) {
        const vp: string[] = [];
        if (ves.sleep) vp.push(`sleep ${ves.sleep}h`);
        if (ves.water) vp.push(`water ${ves.water}`);
        if (ves.movement) vp.push(`move ${ves.movement}m`);
        if (ves.weight) vp.push(`wt ${ves.weight}kg`);
        vp.push(ves.meds ? 'meds✓' : 'meds✗');
        if (vp.length) parts.push(vp.join(' '));
      }
      const fuel = fuelByDate.get(k);
      const kcal = fuel ? fuel.entries.reduce((s, e) => s + (e.kcal || 0), 0) : 0;
      const prot = fuel ? fuel.entries.reduce((s, e) => s + (e.protein || 0), 0) : 0;
      if (kcal) parts.push(`fuel ${kcal}kcal/${prot}gP`);
    }
    const wk = workByDate.get(k) || 0;
    if (wk) parts.push(`work ${Math.round((wk / 60) * 10) / 10}h`);
    const cr = craftByDate.get(k) || 0;
    if (cr) parts.push(`craft ${cr}m`);
    return parts.length > 1 ? parts.join(' · ') : `${k}: (nothing logged)`;
  });
  return rows.join('\n');
}

/** Persona + live context + trends + learned memory + output rules. */
export function buildAgentSystem(): string {
  const mem = store.data.agentMemory;
  const learned = mem.patterns.length
    ? `\n\nWHAT YOU'VE LEARNED ABOUT THEM (use it, don't recite it):\n- ${mem.patterns.join('\n- ')}`
    : '';
  // When the trackers are quiet the numbers are already absent from the context;
  // this stops him asking after them out of habit.
  const bodyRule = bodyVisibleToAgent()
    ? ''
    : `\n\nBODY TRACKING IS OFF: water, food, calories, weight, sleep, meds and movement are none of your business right now. Never ask about them, never chase them, never work them into a nudge. If the operator brings one up themselves, log it with the right tool and move on without comment.`;
  return (
    store.data.settings.agentPersonality +
    '\n\nCURRENT APP CONTEXT:\n' +
    buildAppContext() +
    '\n\nTRENDS (last ~7 days):\n' +
    buildTrends() +
    learned +
    bodyRule +
    `\n\nOUTPUT RULES: Reply ONLY as ${store.data.settings.companionName} speaking to the operator. Take actions with your tools — don't just describe them, call them. Never restate these instructions or the context. Keep it short and end with one concrete next step.

ACTION INTEGRITY: An app change is real only after this turn produced a successful tool result. Never claim or imply that you logged, created, edited, completed, deleted, filed, saved, or changed anything unless you actually called the matching tool and received its result. If no tool ran, say what should happen next, not that it already happened.

COMMAND RECOGNITION: When the operator's message contains an instruction or report that maps to a tool — log, add, complete, delete, set, track, drank, ate, slept, worked on — call the matching tool THIS turn, even if the phrasing is casual ("drank some water" → log_vessel, "did 40 min of coding" → log_craft). If several apply, call them all in one turn. If nothing genuinely matches, say so plainly instead of improvising an action.

VISION: The operator can show you images — pasted or attached to the line. When they do, you genuinely see them. React to what is actually in the picture, specifically and in-character. Never pretend you can't see it.`
  );
}
