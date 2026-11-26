import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Tauri IPC boundary — these tests exercise pure logic + the store's
// own read/write orchestration, not the real Rust backend.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  WidgetStore,
  redactForExport,
  mergeCraft,
  defaultCraft,
  mergeSignal,
  defaultSignal,
  emptySignalToday,
} from './store.svelte';
import type { AppData, Craft, MentalSignals } from './types';
import { localDay } from './day';
import * as repo from './school/repo';

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

describe('redactForExport', () => {
  it('replaces a set API key with a placeholder', () => {
    const data = { settings: { anthropicApiKey: 'test-only-secret', companionName: 'fr13nd' } } as Partial<AppData>;
    const out = redactForExport(data);
    expect(out.settings!.anthropicApiKey).not.toBe('test-only-secret');
    expect(out.settings!.anthropicApiKey).toContain('redacted');
    expect(out.settings!.companionName).toBe('fr13nd'); // other settings untouched
  });

  it('leaves an empty key empty (does not fabricate a placeholder for "no key set")', () => {
    const data = { settings: { anthropicApiKey: '', companionName: 'fr13nd' } } as Partial<AppData>;
    expect(redactForExport(data).settings!.anthropicApiKey).toBe('');
  });

  it('does not mutate the input', () => {
    const data = { settings: { anthropicApiKey: 'test-only-x' } } as Partial<AppData>;
    redactForExport(data);
    expect(data.settings!.anthropicApiKey).toBe('test-only-x');
  });

  it('passes through data with no settings untouched', () => {
    const data = {} as Partial<AppData>;
    expect(redactForExport(data)).toBe(data);
  });
});

describe('mergeCraft', () => {
  it('round-trips through JSON and keeps custom fields, defaults missing areas', () => {
    const custom = defaultCraft();
    custom.focus = 'coding';
    const coding = custom.areas.find((a) => a.id === 'coding')!;
    coding.project = 'life-widget';
    coding.sessions = [{ id: 'a1', at: '2026-06-01 10:00', minutes: 45, energy: 3, mode: 'make', note: 'shipped a panel' }];
    coding.quests = [{ id: 'q1', title: 'ship queue', mode: 'make', requirements: 'need x', note: '', completed: true, createdAt: '2026-06-01 09:00' }];
    custom.levelsSeen = { coding: 3, overall: 2 };

    const roundTripped = JSON.parse(JSON.stringify(custom)) as Partial<Craft>;
    const merged = mergeCraft(roundTripped);

    expect(merged.focus).toBe('coding');
    expect(merged.areas).toHaveLength(8); // all craft areas always present
    const mergedCoding = merged.areas.find((a) => a.id === 'coding')!;
    expect(mergedCoding.project).toBe('life-widget');
    expect(mergedCoding.sessions).toHaveLength(1);
    expect(mergedCoding.quests).toHaveLength(1);
    expect(mergedCoding.quests[0].completed).toBe(true);
    expect(merged.levelsSeen).toEqual({ coding: 3, overall: 2 });
    // an untouched area still comes back with sane defaults, not undefined
    const music = merged.areas.find((a) => a.id === 'music')!;
    expect(music.sessions).toEqual([]);
    expect(music.quests).toEqual([]);
  });

  it('drops craft quests with an empty/whitespace title instead of keeping garbage rows', () => {
    const saved: Partial<Craft> = {
      focus: 'music',
      areas: [
        {
          id: 'music',
          title: 'Music',
          project: '',
          nextAction: '',
          drill: '',
          reference: '',
          blocker: '',
          edge: '',
          targetMinutes: 30,
          sessions: [],
          quests: [
            { id: 'good', title: 'real quest', mode: 'make', requirements: '', note: '', completed: false, createdAt: '' },
            { id: 'bad', title: '   ', mode: 'make', requirements: '', note: '', completed: false, createdAt: '' },
          ],
        },
      ],
      updated: '',
    };
    const merged = mergeCraft(saved);
    const music = merged.areas.find((a) => a.id === 'music')!;
    expect(music.quests.map((q) => q.id)).toEqual(['good']);
  });

  it('falls back to the default focus if the saved focus area no longer exists', () => {
    const merged = mergeCraft({ focus: 'not_a_real_area' as never, areas: [], updated: '' });
    expect(merged.focus).toBe('music');
  });

  it('handles a completely missing craft block (fresh install / corrupt save)', () => {
    const merged = mergeCraft(undefined);
    expect(merged.areas).toHaveLength(8);
    expect(merged.focus).toBe('music');
  });
});

describe('mergeSignal', () => {
  it('keeps today intact when the saved date matches today', () => {
    const today = localDay();
    const saved: MentalSignals = {
      today: { ...emptySignalToday(today), executiveDysfunction: 4, note: 'rough one', checkedIn: false },
      log: [],
      updated: '2026-06-01 12:00',
      voidLog: [{ id: 'v1', at: '2026-06-01 12:00', text: 'a thought sent off' }],
    };
    const roundTripped = JSON.parse(JSON.stringify(saved)) as Partial<MentalSignals>;
    const merged = mergeSignal(roundTripped);

    expect(merged.today.executiveDysfunction).toBe(4);
    expect(merged.today.note).toBe('rough one');
    expect(merged.voidLog).toHaveLength(1);
    expect(merged.voidLog![0].text).toBe('a thought sent off');
    expect(merged.log).toHaveLength(0);
  });

  it('rolls a checked-in prior day into the log and resets today (no data lost)', () => {
    const yesterday = localDay(new Date(Date.now() - 86400000));
    const saved: Partial<MentalSignals> = {
      today: { ...emptySignalToday(yesterday), depression: 3, checkedIn: true, sigil: '◆' },
      log: [],
      updated: '',
      voidLog: [],
    };
    const merged = mergeSignal(saved);

    expect(merged.log).toHaveLength(1);
    expect(merged.log[0].date).toBe(yesterday);
    expect(merged.log[0].depression).toBe(3);
    expect(merged.log[0].sigil).toBe('◆');
    // today resets clean, on today's date
    const today = localDay();
    expect(merged.today.date).toBe(today);
    expect(merged.today.depression).toBe(0);
    expect(merged.today.checkedIn).toBe(false);
  });

  it('discards an un-checked-in prior day silently (never logged, nothing to keep)', () => {
    const yesterday = localDay(new Date(Date.now() - 86400000));
    const saved: Partial<MentalSignals> = {
      today: { ...emptySignalToday(yesterday), depression: 3, checkedIn: false },
      log: [],
      updated: '',
    };
    const merged = mergeSignal(saved);
    expect(merged.log).toHaveLength(0);
  });

  it('produces a valid default when nothing was saved (fresh install)', () => {
    const merged = mergeSignal(undefined);
    expect(merged.voidLog).toEqual([]);
    expect(merged.log).toEqual([]);
    expect(merged.today.checkedIn).toBe(false);
  });
});

describe('upsertVesselDay — reviewing and backfilling past days', () => {
  const todayStr = localDay();

  it("returns the live today object for today's date (edits hit the main panel state)", () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    expect(s.upsertVesselDay(todayStr)).toBe(s.data.vessel.today);
  });

  it('creates a blank entry for a day that was never logged and keeps the log date-sorted', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    s.data.vessel.log = [
      { date: '2026-06-01', water: 3, sleep: 7, movement: 20, meals: 2, meds: true, note: '', weight: 0 },
      { date: '2026-06-05', water: 5, sleep: 6, movement: 0, meals: 3, meds: false, note: '', weight: 124 },
    ];
    const created = s.upsertVesselDay('2026-06-03');
    expect(created).not.toBeNull();
    expect(created!.water).toBe(0);
    expect(created!.meds).toBe(false);
    expect(s.data.vessel.log.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-03', '2026-06-05']);
  });

  it('returns the existing entry for an already-logged day without duplicating it', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    const existing = { date: '2026-06-01', water: 3, sleep: 7, movement: 20, meals: 2, meds: true, note: 'sore', weight: 0 };
    s.data.vessel.log = [existing];
    expect(s.upsertVesselDay('2026-06-01')).toBe(s.data.vessel.log[0]);
    expect(s.data.vessel.log).toHaveLength(1);
  });

  it('rejects future dates and garbage input without touching the log', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    expect(s.upsertVesselDay('2999-01-01')).toBeNull();
    expect(s.upsertVesselDay('not-a-date')).toBeNull();
    expect(s.upsertVesselDay('')).toBeNull();
    expect(s.data.vessel.log).toHaveLength(0);
  });
});

describe('reportToOverseer — the subsystem ledger', () => {
  it('appends events newest-last and caps the log at 40', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    for (let i = 0; i < 45; i++) s.reportToOverseer('test', `event ${i}`);
    const log = s.data.agentMemory.overseerLog!;
    expect(log).toHaveLength(40);
    expect(log[0].note).toBe('event 5'); // oldest five fell off
    expect(log[39].note).toBe('event 44');
    expect(log[39].source).toBe('test');
    expect(log[39].at).toBeTruthy();
  });

  it('truncates oversized notes so the ledger stays terse', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    s.reportToOverseer('test', 'x'.repeat(500));
    expect(s.data.agentMemory.overseerLog![0].note).toHaveLength(160);
  });
});

describe('kanji SRS — addKanji / gradeKanji Leitner scheduling', () => {
  const todayStr = localDay();
  function daysFromNow(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return localDay(d);
  }

  it('adds a card at box 0, brand-new (due now)', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    const id = s.addKanji('水', 'water', 'みず・スイ', 'flowing');
    expect(id).toBeTruthy();
    const card = s.data.kanji.cards.find((k) => k.id === id)!;
    expect(card).toMatchObject({ char: '水', meaning: 'water', box: 0, due: '', reps: 0, lapses: 0 });
  });

  it('rejects a blank glyph', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    expect(s.addKanji('   ', 'x', 'y')).toBeNull();
  });

  it('promotes a box and schedules further out on correct recall', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    const id = s.addKanji('火', 'fire', 'ひ・カ')!;
    s.gradeKanji(id, true); // box 0 -> 1, interval 1 day
    let card = s.data.kanji.cards.find((k) => k.id === id)!;
    expect(card.box).toBe(1);
    expect(card.reps).toBe(1);
    expect(card.due).toBe(daysFromNow(1));

    s.gradeKanji(id, true); // box 1 -> 2, interval 2 days
    card = s.data.kanji.cards.find((k) => k.id === id)!;
    expect(card.box).toBe(2);
    expect(card.due).toBe(daysFromNow(2));
  });

  it('demotes a box and recycles same-day (interval 0) on a miss', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    const id = s.addKanji('木', 'tree', 'き・モク')!;
    s.gradeKanji(id, true);
    s.gradeKanji(id, true); // box 2
    s.gradeKanji(id, false); // miss: box 2 -> 1
    let card = s.data.kanji.cards.find((k) => k.id === id)!;
    expect(card.box).toBe(1);
    expect(card.lapses).toBe(1);

    // drop to box 0 -> interval 0 -> due today (recycles into the session)
    s.gradeKanji(id, false);
    card = s.data.kanji.cards.find((k) => k.id === id)!;
    expect(card.box).toBe(0);
    expect(card.due).toBe(todayStr);
  });

  it('caps mastery at box 5 and never demotes below 0', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    const id = s.addKanji('人', 'person', 'ひと・ジン')!;
    for (let i = 0; i < 8; i++) s.gradeKanji(id, true);
    expect(s.data.kanji.cards.find((k) => k.id === id)!.box).toBe(5);
    for (let i = 0; i < 8; i++) s.gradeKanji(id, false);
    expect(s.data.kanji.cards.find((k) => k.id === id)!.box).toBe(0);
  });

  it('deletes a card by id', () => {
    const s = new WidgetStore();
    invokeMock.mockResolvedValue(undefined);
    const id = s.addKanji('山', 'mountain', 'やま・サン')!;
    const before = s.data.kanji.cards.length;
    s.deleteKanji(id);
    expect(s.data.kanji.cards.length).toBe(before - 1);
    expect(s.data.kanji.cards.find((k) => k.id === id)).toBeUndefined();
  });
});

describe('load() — SCHOOL arrives without disturbing existing saves', () => {
  /** Feed load() a saved file and hand back the store it produced. */
  async function loadFrom(saved: Record<string, unknown>) {
    const s = new WidgetStore();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_data') return JSON.stringify(saved);
      return undefined;
    });
    await s.load();
    return s;
  }

  it('a save written before SCHOOL existed loads with an empty, valid academic core', async () => {
    const s = await loadFrom({ quests: [{ id: 'q', title: 'old quest', kind: 'Main', cadence: 'Daily', note: '', progress: 0, target: 1, completed: false }] });
    expect(s.data.quests).toHaveLength(1); // the old data survives
    expect(s.data.school.courses).toEqual([]);
    expect(s.data.school.items).toEqual([]);
    expect(s.data.school.chunks).toEqual([]);
    expect(s.data.school.activeSessionId).toBeUndefined();
  });

  it('a partially-written school block never leaves a collection undefined', async () => {
    // the failure this guards against is a downstream .filter() on undefined
    const s = await loadFrom({ school: { courses: [{ id: 'c1', semesterId: 's1', code: 'CS101' }] } });
    expect(s.data.school.courses).toHaveLength(1);
    for (const key of ['semesters', 'meetings', 'items', 'resources', 'launchPlans', 'blocks', 'sessions', 'materials', 'chunks'] as const) {
      expect(Array.isArray(s.data.school[key])).toBe(true);
    }
  });

  it('round-trips a populated academic core through JSON', async () => {
    const source = new WidgetStore();
    const sem = repo.addSemester(source.data.school, { title: 'Fall 2026' })!;
    const course = repo.addCourse(source.data.school, { semesterId: sem.id, code: 'CS101' })!;
    const item = repo.addItem(source.data.school, { courseId: course.id, type: 'assignment', title: 'HW2', estimateMinutes: 150 })!;
    repo.addStep(source.data.school, item.id, 'read spec');

    const s = await loadFrom(JSON.parse(JSON.stringify(source.data)));
    expect(s.data.school.courses[0].code).toBe('CS101');
    expect(s.data.school.items[0].steps).toHaveLength(1);
    expect(s.data.school.items[0].nextActionId).toBe(source.data.school.items[0].steps[0].id);
  });
});

describe('WidgetStore.save / load — the API-key redaction boundary', () => {
  it('save() writes the real key to disk but redacts it in the Desktop mirror', async () => {
    vi.useFakeTimers();
    const s = new WidgetStore();
    s.data.settings.anthropicApiKey = 'test-only-key';
    invokeMock.mockResolvedValue(undefined);

    s.save();
    await vi.advanceTimersByTimeAsync(600); // past the 500ms debounce
    vi.useRealTimers();

    const writeCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'write_data');
    const mirrorCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'mirror_data');
    expect(writeCall).toBeDefined();
    expect(mirrorCall).toBeDefined();

    const writtenContent = JSON.parse((writeCall![1] as { content: string }).content) as AppData;
    const mirroredContent = JSON.parse((mirrorCall![1] as { content: string }).content) as AppData;

    expect(writtenContent.settings.anthropicApiKey).toBe('test-only-key'); // the real file needs the real key
    expect(mirroredContent.settings.anthropicApiKey).not.toBe('test-only-key'); // the visible mirror must not
    expect(mirroredContent.settings.anthropicApiKey).toContain('redacted');
  });

  it('load() populates the on-launch Desktop mirror redacted, but keeps the real key in memory', async () => {
    const s = new WidgetStore();
    const onDisk: Partial<AppData> = {
      settings: { ...s.data.settings, anthropicApiKey: 'test-only-disk-key' },
    };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_data') return JSON.stringify(onDisk);
      return undefined;
    });

    await s.load();

    expect(s.data.settings.anthropicApiKey).toBe('test-only-disk-key'); // the running app keeps the real key

    const mirrorCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'mirror_data');
    expect(mirrorCall).toBeDefined();
    const mirrored = JSON.parse((mirrorCall![1] as { content: string }).content) as AppData;
    expect(mirrored.settings.anthropicApiKey).not.toBe('test-only-disk-key');
  });

  it('exportData() writes a redacted portable copy', async () => {
    const s = new WidgetStore();
    s.data.settings.anthropicApiKey = 'test-only-export-key';
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === 'export_data') return `C:\\fake\\${(args as { name: string }).name}`;
      return undefined;
    });

    await s.exportData();

    const exportCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'export_data');
    expect(exportCall).toBeDefined();
    const exported = JSON.parse((exportCall![1] as { content: string }).content) as AppData;
    expect(exported.settings.anthropicApiKey).not.toBe('test-only-export-key');
  });
});
