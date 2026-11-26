// fr13nd's scheduled side: everything that fires on a clock rather than a
// click — hourly notifications, the 9am zodiac read, level-up toasts, and the
// daily brief / reflection / evening review pass.

import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { store } from '../store.svelte';
import { rawComplete } from './llm';
import { bodyVisibleToAgent, buildAgentSystem, buildAppContext, buildTrends } from './context';
import { stripLeakedInstructions } from './tools';
import { chatWithTools } from './chat';
import { starSigns } from './features';
import { localDay } from '../day';

/**
 * fr13nd's daily zodiac read. Generates once per day, at/after 9am, for the
 * operator's signs — a short read + do's & don'ts. Fires a toast on the natural
 * 9am path. `force` (manual refresh / first birth-date set) skips the gates and
 * the toast. No-op if no birth date is set.
 */
export async function runDailyZodiac(force = false): Promise<void> {
  const s = store.data.stars;
  if (!s.birthDate) return;
  const signs = starSigns(s.birthDate);
  if (!signs) return;
  const today = localDay();
  if (!force) {
    if (s.read?.date === today) return; // already have today's read
    if (new Date().getHours() < 9) return; // hold until 9am
  }
  const name = store.data.settings.companionName?.trim() || 'fr13nd';
  const system = `${store.data.settings.agentPersonality}

You are ${name}, reading the operator's stars for TODAY (${today}). Western sign: ${signs.western}. Chinese sign: ${signs.chinese}. Write a short daily read in your full voice, weaving BOTH signs together. Output EXACTLY this shape, nothing else:
READ: <2-3 sentences on today's energy>
DO: <one short, concrete thing to lean into>
DO: <another>
DON'T: <one short, concrete thing to avoid>
DON'T: <another>`;
  let body = '';
  try {
    body = (await rawComplete(system, `Give me today's read.`, 340)).trim();
  } catch {
    return;
  }
  if (!body) return;
  store.data.stars.read = { date: today, western: `${signs.westernSym} ${signs.western}`, chinese: signs.chinese, body };
  store.data.stars.updated = store.nowString();
  store.save();
  store.reportToOverseer('zodiac', `daily read generated (${signs.western} / ${signs.chinese})`);
  if (!force) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === 'granted';
      if (granted) sendNotification({ title: `★ ${name} · TODAY'S STARS`, body: `${signs.westernSym} ${signs.western} · ${signs.chinese} — your read is in` });
    } catch {
      // notifications unavailable — skip
    }
  }
}

/** Clean an LLM one-liner for a toast: strip quotes/leaks, and if it was cut mid-
 * thought, drop a dangling trailing connective so it never ends on "a" / "and". */
function tidyNotifyLine(s: string, maxChars = 130): string {
  let t = stripLeakedInstructions(s).trim().split('\n')[0].trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
  if (!/[.!?]$/.test(t)) {
    t = t.replace(/[\s,;:–—-]+(?:a|an|the|and|or|but|so|to|of|in|on|at|with|for|your|my|that|this|is|are|was|it'?s|into|like)\s*$/i, '').trim();
  }
  return t.slice(0, maxChars);
}

/** Craft one short desktop-notification line in the companion's voice from live state. */
async function craftNotificationLine(): Promise<string> {
  const name = store.data.settings.companionName?.trim() || 'fr13nd';
  const persona = store.data.settings.agentPersonality?.trim();
  const system =
    `You are ${name}, the user's intense personal handler.` +
    (persona ? ` Your voice: ${persona}` : '') +
    `\nWrite ONE COMPLETE desktop-notification line for RIGHT NOW — a single finished sentence, ~12 words max, ` +
    `never cut off mid-thought. Point at ONE thing worth doing next, or say something that lands. Never repeat a ` +
    `line that already went out recently — check SUBSYSTEM REPORTS in the state and pick something new. Punchy, ` +
    `specific, in your voice. No quotes, no preamble, no emoji.` +
    `\n\nTONE: you are backup, not a supervisor. Never scold, never tally what they failed to do, never guilt them ` +
    `about anything unlogged or overdue. If nothing needs doing, just say something in character.` +
    (bodyVisibleToAgent()
      ? ''
      : ` Body upkeep (water, food, calories, weight, sleep, meds, movement) is OFF LIMITS — never mention it.`);
  try {
    const out = await rawComplete(system, `STATE:\n${buildAppContext()}\n\nGive me this hour's line.`, 80);
    return tidyNotifyLine(out);
  } catch {
    return '';
  }
}

/**
 * fr13nd's hourly notification: one OS toast in his voice, gated to waking hours
 * (08–22) and at most once per hour. Persists the timestamp so relaunches don't
 * re-fire. Call it on a short interval from the UI.
 */
export async function runHourlyNotify(): Promise<void> {
  if (store.data.settings.hourlyPings === false) return; // operator switched them off
  const h = new Date().getHours();
  if (h < 8 || h >= 22) return; // no pings overnight
  const mem = store.data.agentMemory;
  const now = Date.now();
  if (mem.lastHourlyNotifyAt && now - mem.lastHourlyNotifyAt < 58 * 60_000) return;
  mem.lastHourlyNotifyAt = now; // claim the hour before the slow call
  store.save();

  const line = await craftNotificationLine();
  if (!line) { mem.lastHourlyNotifyAt = 0; store.save(); return; } // failed — let it retry
  store.reportToOverseer('notify', `hourly nudge sent: "${line}"`);
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) {
      const name = store.data.settings.companionName?.trim() || 'fr13nd';
      sendNotification({ title: `★ ${name}`, body: line });
    }
  } catch {
    // notifications unavailable on this platform/session — silently skip
  }
}

/** A loud LEVEL-UP line + desktop notification when a craft area (or overall) ranks up. */
export async function craftLevelLine(area: string, level: number): Promise<string> {
  const name = store.data.settings.companionName?.trim() || 'fr13nd';
  const persona = store.data.settings.agentPersonality?.trim();
  const system =
    `You are ${name}, the user's intense personal handler.` +
    (persona ? ` Your voice: ${persona}` : '') +
    `\nThe user just hit ${area} LEVEL ${level} in their craft grind. Fire ONE short, LOUD, COMPLETE hype line ` +
    `for it — a finished phrase, ~10 words max, never cut off mid-thought. ALL-CAPS energy, profanity welcome, ` +
    `their voice. No quotes, no preamble, no emoji.`;
  let line = '';
  try {
    const out = await rawComplete(system, `Hype them — ${area} just hit LV${level}.`, 64);
    line = tidyNotifyLine(out, 90).replace(/[.…]+$/, '').trim();
  } catch {
    // model offline — still notify with a plain line
  }
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title: `★ ${name} · LEVEL UP`, body: line || `${area} reached level ${level}` });
  } catch {
    // notifications unavailable
  }
  store.reportToOverseer('levels', `${area} hit LV${level}, hype fired`);
  return line;
}

/** Proactive once-a-day briefing, fired on launch and stored in the agent thread. */
export async function runDailyBrief(): Promise<void> {
  const now = new Date();
  if (now.getHours() >= 14) return; // a "morning sync" only makes sense in the morning
  const today = localDay(now);
  if (store.data.agentMemory.lastBriefDate === today) return;
  store.data.agentMemory.lastBriefDate = today; // claim the slot before the slow call

  const open = store.data.quests
    .filter((q) => !q.completed)
    .map((q) => `[${q.kind}] id=${q.id} "${q.title}" (${q.cadence}) ${q.progress}/${q.target}`)
    .join('\n');
  const r = store.data.ritual;
  const prompt = `MORNING SYNC. mood:${r.mood || '—'} energy:${r.energy}/5 focus:${r.focus || '—'}
OPEN DIRECTIVES:
${open || '(none)'}

Give a 2-3 line tactical briefing for today, then call set_advice with 2-3 clickable next actions. Read the SIGNAL: if they're low or overloaded, keep it gentle and pick one tiny win.`;

  try {
    const { content, results } = await chatWithTools({
      url: store.data.settings.localAiUrl,
      model: store.data.settings.localAiModel,
      system: buildAgentSystem(),
      messages: [{ role: 'user', content: prompt }],
    });
    let reply = content || '▸ standing by — name the first move.';
    if (results.length) reply = `${content}\n\n[ACTIONS]\n${results.map((x) => `- ${x}`).join('\n')}`.trim();
    store.recordTurn({ at: store.nowString(), user: '[morning sync]', agent: reply });
    store.reportToOverseer('brief', 'morning sync posted to the thread');
  } catch {
    // model offline at launch — release the slot so it retries later today
    store.data.agentMemory.lastBriefDate = '';
  }
}

/**
 * Reflection: distill recent conversation + trends into durable memory the
 * agent carries forward. Plain-text (no tools) so it works on any model.
 */
export async function runReflection(): Promise<void> {
  const mem = store.data.agentMemory;
  const today = localDay();
  if (mem.lastReflectionDate === today) return;
  if (mem.recentConversations.length < 2) return;
  mem.lastReflectionDate = today;

  const convo = mem.recentConversations
    .slice(-12)
    .map((t) => `op: ${t.user}\n${store.data.settings.companionName}: ${t.agent}`)
    .join('\n\n');
  const system =
    `You are the reflective memory of ${store.data.settings.companionName}, a personal life agent. ` +
    `Read the recent log + trends and distill DURABLE facts about this operator: recurring patterns, what genuinely helps them, what they're building, what trips them up. ` +
    `Output 3-6 terse lines, one fact each, no preamble, no headers, no markdown. Each line under 100 chars. Specific over generic.`;
  const user = `TRENDS:\n${buildTrends()}\n\nSTATE:\n${buildAppContext()}\n\nRECENT EXCHANGES:\n${convo}\n\nWHAT YOU ALREADY KNOW:\n- ${mem.patterns.join('\n- ') || '(nothing yet)'}\n\nReturn the updated durable facts.`;

  try {
    const content = stripLeakedInstructions(await rawComplete(system, user));
    const facts = content
      .split('\n')
      .map((l) => l.replace(/^\s*[-*•\d.)\s]+/, '').trim())
      .filter((l) => l.length >= 6 && l.length <= 140 && !/^(here|okay|sure|durable|facts|updated)\b/i.test(l));

    if (facts.length) {
      const merged = [...facts];
      for (const p of mem.patterns) {
        if (merged.length >= 12) break;
        if (!merged.some((m) => m.toLowerCase() === p.toLowerCase())) merged.push(p);
      }
      mem.patterns = merged.slice(0, 12);
      mem.updated = store.nowString();
      store.save();
      store.reportToOverseer('reflection', `distilled ${facts.length} durable pattern(s) into memory`);
    }
  } catch {
    mem.lastReflectionDate = ''; // retry later
  }
}

/** Evening follow-through: close the day's loop, once, after 18:00. */
export async function runEveningReview(): Promise<void> {
  const now = new Date();
  if (now.getHours() < 18) return;
  const today = localDay(now);
  const mem = store.data.agentMemory;
  if (mem.lastEveningDate === today) return;
  mem.lastEveningDate = today;

  const done = store.data.quests.filter((q) => q.completed).length;
  const open = store.data.quests.filter((q) => !q.completed).slice(0, 6).map((q) => `"${q.title}"`).join(', ');
  const craftToday = store.data.craft.areas.reduce(
    (s, a) => s + a.sessions.filter((x) => x.at.slice(0, 10) === today).reduce((n, x) => n + x.minutes, 0),
    0
  );
  const prompt = `EVENING REVIEW. Quests completed today: ${done}. Still open: ${open || '(none)'}. Craft minutes today: ${craftToday}. Signal sealed: ${store.data.signal.today.checkedIn}.
Close the loop in 2-3 lines: name what actually landed today, then set one tiny thing to seal the night. Do NOT inventory what they missed or read anything into an empty day — an unlogged day is not a failed one. Then call set_advice with 1-2 chips.`;

  try {
    const { content, results } = await chatWithTools({
      url: store.data.settings.localAiUrl,
      model: store.data.settings.localAiModel,
      system: buildAgentSystem(),
      messages: [{ role: 'user', content: prompt }],
    });
    let reply = content || '▸ evening. seal the day.';
    if (results.length) reply = `${content}\n\n[ACTIONS]\n${results.map((x) => `- ${x}`).join('\n')}`.trim();
    store.recordTurn({ at: store.nowString(), user: '[evening review]', agent: reply });
    store.reportToOverseer('evening', 'evening review posted to the thread');
  } catch {
    mem.lastEveningDate = '';
  }
}

/** All proactive passes, sequenced so they don't fight over the model. */
export async function runProactive(): Promise<void> {
  const hour = new Date().getHours();
  // quiet hours: never ping automatically late at night or pre-dawn
  if (hour < 7 || hour >= 23) return;
  // don't re-run on every relaunch — one proactive pass per ~30 min is plenty.
  // this is what stops fr13nd re-attempting (and re-posting) on rapid restarts
  // or after a transient model failure releases a daily slot.
  const mem = store.data.agentMemory;
  const now = Date.now();
  if (mem.lastProactiveAt && now - mem.lastProactiveAt < 30 * 60_000) return;
  mem.lastProactiveAt = now;
  store.save();

  await runDailyBrief();
  await runReflection();
  await runEveningReview();
}
