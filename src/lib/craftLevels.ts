// Craft leveling: XP and levels derived from logged sessions + completed craft
// quests. Pure functions over existing data — no stored XP, works retroactively.
import type { Craft, CraftArea } from './types';

const QUEST_XP = 20; // bonus XP per completed craft quest (on top of logged minutes)

export function areaXp(area: CraftArea): number {
  const minutes = area.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const quests = area.quests.filter((q) => q.completed).length;
  return minutes + quests * QUEST_XP;
}

/** Rising-cost curve: level 1 spans `base` XP; each level after costs `step` more. */
export function levelInfo(xp: number, base = 60, step = 30) {
  let level = 1, need = base, cum = 0;
  while (xp >= cum + need) { cum += need; level++; need += step; }
  const into = Math.max(0, Math.round(xp - cum));
  return { level, into, span: need, pct: Math.min(100, Math.round((into / need) * 100)) };
}

export function areaLevel(area: CraftArea) { return levelInfo(areaXp(area)); }

export function overallXp(craft: Craft): number {
  return craft.areas.reduce((sum, a) => sum + areaXp(a), 0);
}

/** Overall craft level uses a slower curve so it stays meaningful as a meta-rank. */
export function overallLevel(craft: Craft) { return levelInfo(overallXp(craft), 240, 120); }
