import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  Channel: class {},
}));

import { defaultSchool } from '../store.svelte';
import * as repo from './repo';
import type { SchoolData } from '../types';
import { localDay, shiftDay } from '../day';

let school: SchoolData;
let semesterId: string;
let courseId: string;

beforeEach(() => {
  school = defaultSchool();
  semesterId = repo.addSemester(school, { title: 'Fall 2026' })!.id;
  courseId = repo.addCourse(school, { semesterId, code: 'CS101', name: 'Programming Languages' })!.id;
});

afterEach(() => vi.useRealTimers());

describe('semesters', () => {
  it('makes the first semester active and keeps exactly one active', () => {
    expect(repo.activeSemester(school)!.title).toBe('Fall 2026');
    const spring = repo.addSemester(school, { title: 'Spring 2027' })!;
    expect(spring.active).toBe(false); // not the first — stays inactive

    repo.setActiveSemester(school, spring.id);
    expect(school.semesters.filter((s) => s.active)).toHaveLength(1);
    expect(repo.activeSemester(school)!.id).toBe(spring.id);
  });

  it('rejects a blank title and an unknown activation', () => {
    expect(repo.addSemester(school, { title: '   ' })).toBeNull();
    expect(repo.setActiveSemester(school, 'nope')).toBe(false);
  });
});

describe('courses', () => {
  it('refuses a course on a semester that does not exist', () => {
    expect(repo.addCourse(school, { semesterId: 'ghost', code: 'X' })).toBeNull();
    expect(repo.addCourse(school, { semesterId, code: '  ' })).toBeNull();
  });

  it('lists by semester and hides archived unless asked', () => {
    const cs102 = repo.addCourse(school, { semesterId, code: 'CS102' })!;
    repo.updateCourse(school, cs102.id, { archived: true });
    expect(repo.coursesOf(school, semesterId).map((c) => c.code)).toEqual(['CS101']);
    expect(repo.coursesOf(school, semesterId, true)).toHaveLength(2);
  });

  it('cannot have its id overwritten by a patch', () => {
    repo.updateCourse(school, courseId, { id: 'hacked' } as never);
    expect(school.courses[0].id).toBe(courseId);
  });
});

describe('deleting a course cascades — no orphans reach the timetable', () => {
  it('removes items, meetings, resources, blocks, sessions and materials', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    repo.addMeeting(school, { courseId, weekday: 1, start: '13:30', end: '15:20' });
    repo.addResource(school, { kind: 'file', label: 'spec', target: 'C:/HW2.pdf', itemId: item.id });
    repo.addBlock(school, { itemId: item.id, day: localDay(), start: '16:00', plannedMinutes: 45, mission: 'read spec' });
    school.materials.push({
      id: 'm1', courseId, title: 'Dragon', kind: 'textbook', sourcePath: 'D:/Dragon.pdf',
      bytes: 1, sha256: 'x', ingest: 'ready', topics: [],
    });
    school.chunks.push({ id: 'c1', materialId: 'm1', page: 1, chars: 10 });

    expect(repo.deleteCourse(school, courseId)).toBe(true);
    expect(school.items).toHaveLength(0);
    expect(school.meetings).toHaveLength(0);
    expect(school.resources).toHaveLength(0);
    expect(school.blocks).toHaveLength(0);
    expect(school.materials).toHaveLength(0);
    expect(school.chunks).toHaveLength(0);
  });

  it('clears prerequisite references to deleted items, so nothing blocks forever', () => {
    const other = repo.addCourse(school, { semesterId, code: 'CS102' })!;
    const lecture = repo.addItem(school, { courseId, type: 'reading', title: 'Lecture 5' })!;
    const hw = repo.addItem(school, {
      courseId: other.id, type: 'assignment', title: 'HW1', prerequisiteIds: [lecture.id],
    })!;

    repo.deleteCourse(school, courseId);
    const survivor = school.items.find((i) => i.id === hw.id)!;
    expect(survivor.prerequisiteIds).toEqual([]);
    expect(repo.prerequisitesMet(school, survivor)).toBe(true);
  });
});

describe('steps and the next action', () => {
  it('sets the next action to the first step, then advances as steps close', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const a = repo.addStep(school, item.id, 'read spec')!;
    const b = repo.addStep(school, item.id, 'implement q1')!;
    expect(repo.nextAction(school, item.id)!.id).toBe(a.id);

    repo.toggleStep(school, item.id, a.id);
    expect(repo.nextAction(school, item.id)!.id).toBe(b.id);

    repo.toggleStep(school, item.id, b.id);
    expect(repo.nextAction(school, item.id)).toBeUndefined(); // nothing left to start
  });

  it('re-points the next action when the pending step is removed', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const a = repo.addStep(school, item.id, 'read spec')!;
    const b = repo.addStep(school, item.id, 'implement q1')!;
    repo.removeStep(school, item.id, a.id);
    expect(repo.nextAction(school, item.id)!.id).toBe(b.id);
  });

  it('rejects blank steps and unknown items', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    expect(repo.addStep(school, item.id, '  ')).toBeNull();
    expect(repo.addStep(school, 'ghost', 'x')).toBeNull();
  });
});

describe('resources — the trust seam', () => {
  it('trusts what the operator typed and distrusts what was inferred', () => {
    const manual = repo.addResource(school, { kind: 'file', label: 'spec', target: 'C:/a.pdf' })!;
    const inferred = repo.addResource(school, {
      kind: 'file', label: 'guessed', target: 'C:/b.pdf', source: 'inferred',
    })!;
    const imported = repo.addResource(school, {
      kind: 'url', label: 'from email', target: 'https://x', source: 'imported',
    })!;

    expect(manual.trusted).toBe(true);
    expect(inferred.trusted).toBe(false);
    expect(imported.trusted).toBe(false);

    repo.trustResource(school, inferred.id);
    expect(school.resources.find((r) => r.id === inferred.id)!.trusted).toBe(true);
  });

  it('deleting a resource unlinks it from items and launch plans', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const r = repo.addResource(school, { kind: 'file', label: 'spec', target: 'C:/a.pdf', itemId: item.id })!;
    const plan = repo.createLaunchPlan(school, 'HW2 workspace', [r.id]);

    repo.deleteResource(school, r.id);
    expect(school.items[0].resourceIds).toEqual([]);
    expect(school.launchPlans.find((p) => p.id === plan.id)!.actions).toEqual([]);
    expect(repo.planSteps(school, plan.id)).toEqual([]);
  });

  it('resourcesFor returns the item\'s own plus course-wide ones', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    repo.addResource(school, { kind: 'file', label: 'hw2 spec', target: 'C:/hw2.pdf', itemId: item.id });
    repo.addResource(school, { kind: 'folder', label: 'course folder', target: 'D:/CS101', courseId });
    repo.addResource(school, { kind: 'url', label: 'unrelated', target: 'https://x' });
    expect(repo.resourcesFor(school, item.id).map((r) => r.label))
      .toEqual(['hw2 spec', 'course folder']);
  });

  it('planSteps keeps declared order and drops disabled actions', () => {
    const a = repo.addResource(school, { kind: 'file', label: 'a', target: 'C:/a.pdf' })!;
    const b = repo.addResource(school, { kind: 'file', label: 'b', target: 'C:/b.pdf' })!;
    const c = repo.addResource(school, { kind: 'file', label: 'c', target: 'C:/c.pdf' })!;
    const plan = repo.createLaunchPlan(school, 'w', [a.id, b.id, c.id]);
    plan.actions[1].enabled = false;
    expect(repo.planSteps(school, plan.id).map((s) => s.resource.label)).toEqual(['a', 'c']);
  });
});

describe('blocks and deferral', () => {
  it('deferring keeps the work, chains the trail, and counts against the item', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const first = repo.addBlock(school, {
      itemId: item.id, day: localDay(), start: '13:30', plannedMinutes: 45, mission: 'read spec',
    })!;

    const moved = repo.deferBlock(school, first.id, shiftDay(localDay(), 1), '16:00')!;
    expect(school.blocks.find((b) => b.id === first.id)!.status).toBe('deferred');
    expect(moved.status).toBe('queued');
    expect(moved.mission).toBe('read spec'); // the work travels with it
    expect(moved.deferredFrom).toBe(first.id);
    expect(school.items[0].deferCount).toBe(1);

    const again = repo.deferBlock(school, moved.id, shiftDay(localDay(), 2), '18:00')!;
    expect(school.items[0].deferCount).toBe(2);
    expect(repo.deferChain(school, again.id)).toBe(2); // "you deferred this twice"
  });

  it('blocksOnDay hides deferred ghosts and sorts by start time', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const day = localDay();
    repo.addBlock(school, { itemId: item.id, day, start: '19:30', plannedMinutes: 30, mission: 'c' });
    repo.addBlock(school, { itemId: item.id, day, start: '09:00', plannedMinutes: 30, mission: 'a' });
    const mid = repo.addBlock(school, { itemId: item.id, day, start: '13:00', plannedMinutes: 30, mission: 'b' })!;
    repo.deferBlock(school, mid.id, shiftDay(day, 1), '10:00');

    expect(repo.blocksOnDay(school, day).map((b) => b.mission)).toEqual(['a', 'c']);
  });

  it('cancelling an item clears its pending blocks but preserves finished ones', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const done = repo.addBlock(school, { itemId: item.id, day: localDay(), start: '09:00', plannedMinutes: 30, mission: 'a' })!;
    repo.setBlockStatus(school, done.id, 'done');
    repo.addBlock(school, { itemId: item.id, day: localDay(), start: '16:00', plannedMinutes: 30, mission: 'b' });

    repo.cancelItem(school, item.id, 'dropped the course');
    expect(school.items[0].status).toBe('cancelled');
    expect(school.items[0].cancelledReason).toBe('dropped the course');
    expect(school.blocks.map((b) => b.mission)).toEqual(['a']); // history kept
  });
});

describe('study sessions', () => {
  it('runs one at a time and only persists the start instant', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    const s = repo.startSession(school, { itemId: item.id, objective: 'read spec' })!;
    expect(school.activeSessionId).toBe(s.id);
    expect(s.actualMinutes).toBe(0); // elapsed is derived, never written per tick
    expect(school.items[0].status).toBe('in_progress');

    expect(repo.startSession(school, { itemId: item.id })).toBeNull(); // no second clock
  });

  it('folds a finished session back into the item', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 14, 16, 0));
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2', estimateMinutes: 150 })!;
    const block = repo.addBlock(school, {
      itemId: item.id, day: localDay(), start: '16:00', plannedMinutes: 45, mission: 'read spec',
    })!;
    repo.startSession(school, { itemId: item.id, blockId: block.id });

    vi.setSystemTime(new Date(2026, 8, 14, 16, 45));
    const done = repo.finishSession(school, { outcome: 'partial', percentComplete: 30 })!;

    expect(done.actualMinutes).toBe(45);
    expect(school.items[0].spentMinutes).toBe(45);
    expect(school.items[0].percentComplete).toBe(30);
    expect(school.items[0].status).toBe('in_progress');
    expect(school.blocks[0].status).toBe('partial');
    expect(school.activeSessionId).toBeUndefined();
    expect(repo.remainingMinutes(school.items[0])).toBe(105); // 150 * 0.7
  });

  it('a done outcome completes the item; blocked records a reason, not a verdict', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2' })!;
    repo.startSession(school, { itemId: item.id });
    repo.finishSession(school, { outcome: 'done' });
    expect(school.items[0].status).toBe('done');
    expect(school.items[0].percentComplete).toBe(100);
    expect(repo.remainingMinutes(school.items[0])).toBe(0);

    const second = repo.addItem(school, { courseId, type: 'assignment', title: 'HW3' })!;
    repo.startSession(school, { itemId: second.id });
    repo.finishSession(school, { outcome: 'blocked', blockedReason: 'need the grammar spec' });
    expect(school.items[1].status).toBe('blocked');
    expect(repo.lastSession(school, second.id)!.blockedReason).toBe('need the grammar spec');
  });

  it('finishing with no session running is a no-op, not a crash', () => {
    expect(repo.finishSession(school, { outcome: 'done' })).toBeNull();
  });
});

describe('derived views', () => {
  it('sorts open items by deadline and puts undated ones last', () => {
    const soon = repo.addItem(school, { courseId, type: 'assignment', title: 'soon', due: `${shiftDay(localDay(), 1)}T23:59` })!;
    const later = repo.addItem(school, { courseId, type: 'exam', title: 'later', due: `${shiftDay(localDay(), 9)}T09:00` })!;
    const undated = repo.addItem(school, { courseId, type: 'reading', title: 'undated' })!;
    repo.setItemStatus(school, repo.addItem(school, { courseId, type: 'quiz', title: 'finished' })!.id, 'done');

    expect(repo.openItems(school).map((i) => i.id)).toEqual([soon.id, later.id, undated.id]);
  });

  it('itemsDueWithin includes the overdue, and overdueItems finds them', () => {
    const past = repo.addItem(school, { courseId, type: 'assignment', title: 'late', due: `${shiftDay(localDay(), -2)}T23:59` })!;
    repo.addItem(school, { courseId, type: 'assignment', title: 'next week', due: `${shiftDay(localDay(), 8)}T23:59` });
    const near = repo.addItem(school, { courseId, type: 'assignment', title: 'friday', due: `${shiftDay(localDay(), 3)}T23:59` })!;

    expect(repo.itemsDueWithin(school, 7).map((i) => i.id)).toEqual([past.id, near.id]);
    expect(repo.overdueItems(school).map((i) => i.id)).toEqual([past.id]);
  });

  it('prerequisitesMet gates work that cannot start yet', () => {
    const lecture = repo.addItem(school, { courseId, type: 'reading', title: 'Lecture 5' })!;
    const hw = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2', prerequisiteIds: [lecture.id] })!;
    expect(repo.prerequisitesMet(school, hw)).toBe(false);
    repo.setItemStatus(school, lecture.id, 'done');
    expect(repo.prerequisitesMet(school, hw)).toBe(true);
  });

  it('remainingMinutes never goes negative and is zero once done or cancelled', () => {
    const item = repo.addItem(school, { courseId, type: 'assignment', title: 'HW2', estimateMinutes: 100 })!;
    repo.updateItem(school, item.id, { percentComplete: 140 }); // clamped
    expect(school.items[0].percentComplete).toBe(100);
    expect(repo.remainingMinutes(school.items[0])).toBe(0);

    repo.cancelItem(school, item.id, 'dropped');
    expect(repo.remainingMinutes(school.items[0])).toBe(0);
  });

  it('meetingsOnDay resolves the weekday of a date key and sorts by time', () => {
    // 2026-09-14 is a Monday
    repo.addMeeting(school, { courseId, weekday: 1, start: '15:40', end: '17:30' });
    repo.addMeeting(school, { courseId, weekday: 1, start: '08:40', end: '10:30' });
    repo.addMeeting(school, { courseId, weekday: 3, start: '13:30', end: '15:20' });
    expect(repo.meetingsOnDay(school, '2026-09-14').map((m) => m.start)).toEqual(['08:40', '15:40']);
    expect(repo.meetingsOnDay(school, '2026-09-16').map((m) => m.start)).toEqual(['13:30']);
  });
});
