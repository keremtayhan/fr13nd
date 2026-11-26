import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pressure controls decide how hard the app is allowed to push at the
// operator. These tests pin the calm defaults so they can't silently regress.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  Channel: class {},
}));

import { WidgetStore, store } from './store.svelte';
import { hasMissingDailyActivities, missingDailySummary } from './daily';
import { bodyVisibleToAgent, buildAppContext, buildAgentSystem, buildWeeklyDigest } from './agent/context';
import type { AppData } from './types';
import { localDay } from './day';

/** A fresh default AppData with one open daily quest and an unsealed signal. */
function freshData(): AppData {
  const d = new WidgetStore().data;
  d.quests.push({
    id: 'q1', title: 'stretch', kind: 'Ritual', cadence: 'Daily',
    note: '', progress: 0, target: 1, completed: false,
  });
  d.vessel.today.water = 0;
  return d;
}

beforeEach(() => {
  store.data.settings.bodyTracking = 'quiet';
  store.data.settings.alarmBorder = false;
  store.data.settings.showDailyGaps = true;
  store.data.settings.hourlyPings = true;
});

describe('defaults ship calm', () => {
  it('a brand-new store keeps the body trackers quiet and the alarm dark', () => {
    const s = new WidgetStore();
    expect(s.data.settings.bodyTracking).toBe('quiet');
    expect(s.data.settings.alarmBorder).toBe(false);
    expect(s.data.settings.showDailyGaps).toBe(true);
    expect(s.data.settings.hourlyPings).toBe(false);
  });
});

describe('hasMissingDailyActivities — the red alarm border', () => {
  it('stays dark by default even with dailies open and the signal unsealed', () => {
    expect(hasMissingDailyActivities(freshData())).toBe(false);
  });

  it('lights up only when the operator opts in', () => {
    const d = freshData();
    d.settings.alarmBorder = true;
    expect(hasMissingDailyActivities(d)).toBe(true);
  });

  it('opted in but with nothing open stays dark', () => {
    const d = freshData();
    d.settings.alarmBorder = true;
    d.quests[0].completed = true;
    d.signal.today.date = localDay();
    d.signal.today.checkedIn = true;
    expect(hasMissingDailyActivities(d)).toBe(false);
  });
});

describe('missingDailySummary — the open-gaps strip', () => {
  it('lists open work but never body upkeep while tracking is quiet', () => {
    const out = missingDailySummary(freshData());
    expect(out).toContain('1 daily quest open');
    expect(out.some((l) => l.includes('water'))).toBe(false);
  });

  it('mentions water only when body tracking is fully on', () => {
    const d = freshData();
    d.settings.bodyTracking = 'on';
    expect(missingDailySummary(d)).toContain('no water logged');
  });

  it('goes silent entirely when the strip is switched off', () => {
    const d = freshData();
    d.settings.showDailyGaps = false;
    expect(missingDailySummary(d)).toEqual([]);
  });
});

describe('body data reaching the model', () => {
  it('is withheld on quiet and off, exposed only on on', () => {
    store.data.settings.bodyTracking = 'quiet';
    expect(bodyVisibleToAgent()).toBe(false);
    store.data.settings.bodyTracking = 'off';
    expect(bodyVisibleToAgent()).toBe(false);
    store.data.settings.bodyTracking = 'on';
    expect(bodyVisibleToAgent()).toBe(true);
  });

  it('keeps VESSEL / FUEL / MEAL TIMES out of the prompt context when quiet', () => {
    store.data.settings.bodyTracking = 'quiet';
    const ctx = buildAppContext();
    expect(ctx).not.toContain('VESSEL:');
    expect(ctx).not.toContain('FUEL:');
    expect(ctx).not.toContain('MEAL TIMES');
    // the rest of the operator's state still goes through
    expect(ctx).toContain('QUESTS:');
    expect(ctx).toContain('SIGNAL:');
    expect(ctx).toContain('CRAFT:');
  });

  it('puts them back when tracking is switched on', () => {
    store.data.settings.bodyTracking = 'on';
    const ctx = buildAppContext();
    expect(ctx).toContain('VESSEL:');
    expect(ctx).toContain('FUEL:');
  });

  it('keeps body rows out of the weekly digest when quiet', () => {
    store.data.vessel.today.date = localDay();
    store.data.vessel.today.sleep = 7;
    store.data.settings.bodyTracking = 'quiet';
    expect(buildWeeklyDigest()).not.toContain('sleep 7h');
    store.data.settings.bodyTracking = 'on';
    expect(buildWeeklyDigest()).toContain('sleep 7h');
  });

  it('tells the agent body upkeep is off limits when quiet, and not when on', () => {
    store.data.settings.bodyTracking = 'quiet';
    expect(buildAgentSystem()).toContain('BODY TRACKING IS OFF');
    store.data.settings.bodyTracking = 'on';
    expect(buildAgentSystem()).not.toContain('BODY TRACKING IS OFF');
  });
});
