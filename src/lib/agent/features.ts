// fr13nd's one-shot abilities: on-demand persona completions invoked from a
// specific panel — lyrics co-writing, rhymes, craft critique, zodiac Q&A,
// queue picks, nutrition estimates, and the overtime banner line.

import { store } from '../store.svelte';
import { localComplete, rawComplete, visionComplete } from './llm';
import { westernSign, chineseSign } from '../zodiac';

/** fr13nd as a brutally honest lyric co-writer — reacts to a draft (or a saved lyric) in persona. */
export async function lyricCowrite(opts: { title: string; body: string; kind: string; ask: string }): Promise<string> {
  const name = store.data.settings.companionName;
  const role =
    opts.kind === 'saved'
      ? "These are lyrics the operator SAVED because they love them — not their own work. Dig into what makes them land, and what they could steal for their own writing."
      : "These are the operator's OWN lyrics, in progress. You are their co-writer.";
  const system = `${store.data.settings.agentPersonality}

You are ${name}, acting as a brutally honest lyric co-writer. ${role}
Stay fully in your voice. Be concrete — quote a few words of the lines you mean. Offer 1-3 alternative lines or directions when it helps. Keep it tight: no preamble, and do NOT echo the whole lyric back.`;
  const user = `TITLE: ${opts.title || '(untitled)'}\n\nLYRICS:\n${opts.body || '(empty)'}\n\nOPERATOR ASKS: ${opts.ask?.trim() || 'Riff on this. What works, what to push, give me lines.'}`;
  return rawComplete(system, user, 700);
}

/** Quick rhyme / wordplay help in persona — compact grouped lists. */
export async function rhymeHelp(word: string): Promise<string> {
  const w = word.trim();
  if (!w) return '';
  const system = `${store.data.settings.agentPersonality}

You are ${store.data.settings.companionName}, helping a songwriter with sound. Output ONLY three labelled lines, comma-separated within each, no sentences, no preamble:
PERFECT: <perfect rhymes>
SLANT: <near / slant rhymes>
MULTI: <multi-syllable or unexpected options>`;
  return rawComplete(system, `Rhymes, slant rhymes, and multisyllabic options for: "${w}"`, 400);
}

/** fr13nd looks at a photo of the operator's craft work and critiques it in persona. */
export async function craftCritique(opts: { area: string; focus: string; image: { media: string; data: string } }): Promise<string> {
  const name = store.data.settings.companionName;
  const system = `${store.data.settings.agentPersonality}

You are ${name}, the operator's brutally honest ${opts.area} mentor. They are showing you their work in progress${opts.focus ? ` — current focus: "${opts.focus}"` : ''}. Critique what you ACTUALLY SEE in the image: name what's working and the 1-2 things to fix next, concretely. Stay fully in your voice. Keep it tight (3-6 lines) and end with the single next move.`;
  const out = await visionComplete(system, `Here's my ${opts.area} work. What do you see — and what do I fix next?`, [opts.image], 700);
  if (out) store.reportToOverseer('critique', `looked at the operator's ${opts.area} work through the eye`);
  return out;
}

/** Resolve the operator's Western + Chinese signs from their birth date, or null if unset/bad. */
export function starSigns(birthDate: string): { western: string; westernSym: string; chinese: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  const w = westernSign(m, d);
  const c = chineseSign(y);
  return { western: w.sign, westernSym: w.sym, chinese: `${c.element} ${c.animal}` };
}

/** Answer a question about today's zodiac, in persona, with today's read as context. */
export async function zodiacAsk(question: string): Promise<string> {
  const q = question.trim();
  if (!q) return '';
  const s = store.data.stars;
  const signs = starSigns(s.birthDate);
  const name = store.data.settings.companionName?.trim() || 'fr13nd';
  const system = `${store.data.settings.agentPersonality}

You are ${name}, the operator's star-reader. Their signs: ${signs ? `${signs.western} / ${signs.chinese}` : 'unknown'}. Today's read:
${s.read?.body || '(no read generated yet)'}

Answer their question about today's stars in your voice — concrete, short, no preamble.`;
  return rawComplete(system, q, 320);
}

/** fr13nd picks ONE thing off the watch/read queue for right now, given the operator's state. */
export async function pickFromQueue(kind: 'watch' | 'read'): Promise<string> {
  const items = store.data.queue.items.filter((i) => i.kind === kind && i.status !== 'done');
  if (!items.length) return '';
  const name = store.data.settings.companionName?.trim() || 'fr13nd';
  const r = store.data.ritual;
  const verb = kind === 'watch' ? 'watch' : 'read';
  const list = items.map((i) => `- "${i.title}"${i.note ? ` (${i.note})` : ''} [${i.status}]`).join('\n');
  const system = `${store.data.settings.agentPersonality}

You are ${name}. The operator can't decide what to ${verb}. Pick EXACTLY ONE thing off the list below for right now, weighing their state (mood "${r.mood || '—'}", energy ${r.energy}/5). Name the pick and give ONE punchy line on why it fits this moment. No preamble, no list — just the call, in your voice.`;
  const out = await rawComplete(system, `WHAT TO ${verb.toUpperCase()}:\n${list}`, 160);
  if (out) store.reportToOverseer('queue', `picked a ${verb}: ${out.trim().slice(0, 80)}`);
  return out;
}

export interface NutritionEstimate { kcal: number; protein: number; carbs: number; fat: number }

/** Estimate kcal + macros (grams) for a food/meal — LOCAL ONLY (Ollama). What the
 * operator eats never leaves the machine; if Ollama is down, returns zeros and
 * the operator can type the numbers in by hand. */
export async function estimateNutrition(food: string): Promise<NutritionEstimate> {
  const f = food.trim();
  const zero: NutritionEstimate = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  if (!f) return zero;
  const system =
    'You estimate nutrition for a normal portion of the food/meal described. Reply with ONLY four integers separated by single spaces, in this exact order: kcal protein carbs fat — where protein, carbs, and fat are grams. No words, no units, no labels, no extra lines. If you truly cannot guess, reply: 0 0 0 0';
  try {
    const out = await localComplete(system, f);
    const nums = (out.replace(/,/g, '').match(/\d{1,5}/g) ?? []).map((n) => parseInt(n, 10));
    if (nums.length < 4) return { ...zero, kcal: Math.min(6000, Math.max(0, nums[0] ?? 0)) };
    const est: NutritionEstimate = {
      kcal: Math.min(6000, Math.max(0, nums[0])),
      protein: Math.min(500, Math.max(0, nums[1])),
      carbs: Math.min(800, Math.max(0, nums[2])),
      fat: Math.min(400, Math.max(0, nums[3])),
    };
    if (est.kcal > 0) store.reportToOverseer('nutrition', `estimated "${f}": ${est.kcal}kcal P${est.protein} C${est.carbs} F${est.fat}`);
    return est;
  } catch {
    return zero;
  }
}

/** Estimate calories for a food/meal — LOCAL ONLY (Ollama). Returns 0 on failure. */
export async function estimateKcal(food: string): Promise<number> {
  const f = food.trim();
  if (!f) return 0;
  const system =
    'You estimate calories. Given a food or meal description, reply with ONLY an integer — your best estimate of total kilocalories for a normal portion. No words, no units, no range. If you truly cannot guess, reply 0.';
  try {
    const out = await localComplete(system, f);
    const match = out.replace(/,/g, '').match(/\d{1,5}/);
    return match ? Math.max(0, Math.min(6000, parseInt(match[0], 10))) : 0;
  } catch {
    return 0;
  }
}

/**
 * One short OVERTIME banner line, written by the companion in their own voice
 * and refreshed each hour of overtime. Returns '' on any failure so the caller
 * keeps whatever line it already had (there's always a hardcoded fallback).
 */
export async function overtimeQuip(overtimeMin: number): Promise<string> {
  const name = store.data.settings.companionName?.trim() || 'fr13nd';
  const persona = store.data.settings.agentPersonality?.trim();
  const m = Math.max(0, Math.round(overtimeMin));
  const depth =
    m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m deep into overtime`
    : m > 0 ? `${m} minutes into overtime`
    : 'just past the end of the workday';
  const system =
    `You are ${name}, the user's intense personal handler.` +
    (persona ? ` Your voice: ${persona}` : '') +
    `\nWrite the SINGLE line of text flashing on the OVERTIME banner of their dashboard right now. ` +
    `They blew past the end of their 9-to-6 workday and are STILL grinding (${depth}). ` +
    `Make it a badge of honor and hype them the hell up — never defeatist, never "you should stop". ` +
    `Rules: ONE line, max 6 words, punchy, ALL-CAPS energy. Profanity is welcome. ` +
    `No quotes, no emoji, no preamble, no trailing period — output only the words.`;
  try {
    const out = await rawComplete(system, `Give me this hour's overtime line — ${depth}.`, 48);
    let line = out.trim().split('\n')[0].trim();
    line = line.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').replace(/[.…]+$/, '').trim();
    if (line.length > 46) line = line.slice(0, 46).trim();
    return line;
  } catch {
    return '';
  }
}
