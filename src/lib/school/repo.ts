// Typed access to the academic core.
//
// Every function takes the SchoolData it operates on rather than reaching for
// the store singleton. That keeps the academic logic out of both the UI and the
// store (which is already 700 lines), and lets tests build a bare collection
// instead of a whole app. Callers persist: `repo.addCourse(store.data.school, …)`
// then `store.save()`.
//
// Mutations are in-place so Svelte's reactivity sees them.

import type {
  AcademicItem, BlockStatus, Course, CourseMeeting, GradingWeight, ItemStatus, ItemType,
  LaunchAction, LaunchPlan, Material, Resource, ResourceKind, SchoolData, Semester,
  SessionOutcome, StudyBlock, StudySession, TaskStep,
} from '../types';
import { localDay, localStamp, daysBetween } from '../day';

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function touch(school: SchoolData) {
  school.updated = localStamp();
}

// ── semesters ────────────────────────────────────────────────────────────────

export function addSemester(
  school: SchoolData,
  fields: { title: string; startDate?: string; endDate?: string; active?: boolean }
): Semester | null {
  const title = fields.title.trim();
  if (!title) return null;
  const semester: Semester = {
    id: newId(),
    title,
    startDate: fields.startDate ?? localDay(),
    endDate: fields.endDate ?? '',
    active: fields.active ?? school.semesters.length === 0, // the first one is active
  };
  if (semester.active) school.semesters.forEach((s) => (s.active = false));
  school.semesters.push(semester);
  touch(school);
  return semester;
}

/** Exactly one semester is active; activating one deactivates the rest. */
export function setActiveSemester(school: SchoolData, id: string): boolean {
  if (!school.semesters.some((s) => s.id === id)) return false;
  school.semesters.forEach((s) => (s.active = s.id === id));
  touch(school);
  return true;
}

export function activeSemester(school: SchoolData): Semester | undefined {
  return school.semesters.find((s) => s.active);
}

// ── courses ──────────────────────────────────────────────────────────────────

export function addCourse(
  school: SchoolData,
  fields: {
    semesterId: string; code: string; name?: string; instructor?: string; credits?: number;
    location?: string; color?: string; attendanceRequired?: boolean;
    gradingWeights?: GradingWeight[];
  }
): Course | null {
  const code = fields.code.trim();
  if (!code) return null;
  if (!school.semesters.some((s) => s.id === fields.semesterId)) return null;
  const course: Course = {
    id: newId(),
    semesterId: fields.semesterId,
    code,
    name: (fields.name ?? '').trim(),
    instructor: (fields.instructor ?? '').trim(),
    credits: fields.credits ?? 0,
    location: (fields.location ?? '').trim(),
    color: fields.color ?? '',
    gradingWeights: fields.gradingWeights ?? [],
    attendanceRequired: fields.attendanceRequired ?? false,
    archived: false,
  };
  school.courses.push(course);
  touch(school);
  return course;
}

export function updateCourse(school: SchoolData, id: string, patch: Partial<Course>): Course | null {
  const course = school.courses.find((c) => c.id === id);
  if (!course) return null;
  Object.assign(course, patch, { id: course.id, semesterId: patch.semesterId ?? course.semesterId });
  touch(school);
  return course;
}

export function coursesOf(school: SchoolData, semesterId: string, includeArchived = false): Course[] {
  return school.courses.filter(
    (c) => c.semesterId === semesterId && (includeArchived || !c.archived)
  );
}

/**
 * Remove a course and everything hanging off it. Cascades explicitly rather
 * than leaving orphaned items and blocks that would surface in the timetable
 * with no course to render.
 */
export function deleteCourse(school: SchoolData, id: string): boolean {
  if (!school.courses.some((c) => c.id === id)) return false;
  const itemIds = new Set(school.items.filter((i) => i.courseId === id).map((i) => i.id));
  const materialIds = new Set(school.materials.filter((m) => m.courseId === id).map((m) => m.id));

  school.courses = school.courses.filter((c) => c.id !== id);
  school.meetings = school.meetings.filter((m) => m.courseId !== id);
  school.items = school.items.filter((i) => i.courseId !== id);
  school.resources = school.resources.filter((r) => r.courseId !== id && !(r.itemId && itemIds.has(r.itemId)));
  school.blocks = school.blocks.filter((b) => b.courseId !== id);
  school.sessions = school.sessions.filter((s) => s.courseId !== id);
  school.materials = school.materials.filter((m) => m.courseId !== id);
  school.chunks = school.chunks.filter((c) => !materialIds.has(c.materialId));
  // a prerequisite pointing at a deleted item would block scheduling forever
  school.items.forEach((i) => {
    i.prerequisiteIds = i.prerequisiteIds.filter((p) => !itemIds.has(p));
  });
  touch(school);
  return true;
}

// ── meetings ─────────────────────────────────────────────────────────────────

export function addMeeting(
  school: SchoolData,
  fields: { courseId: string; weekday: number; start: string; end: string; location?: string }
): CourseMeeting | null {
  if (!school.courses.some((c) => c.id === fields.courseId)) return null;
  if (fields.weekday < 0 || fields.weekday > 6) return null;
  const meeting: CourseMeeting = {
    id: newId(),
    courseId: fields.courseId,
    weekday: Math.round(fields.weekday),
    start: fields.start,
    end: fields.end,
    location: fields.location ?? '',
  };
  school.meetings.push(meeting);
  touch(school);
  return meeting;
}

export function removeMeeting(school: SchoolData, id: string): boolean {
  const before = school.meetings.length;
  school.meetings = school.meetings.filter((m) => m.id !== id);
  if (school.meetings.length === before) return false;
  touch(school);
  return true;
}

/** Meetings on a given local day, earliest first. */
export function meetingsOnDay(school: SchoolData, day: string): CourseMeeting[] {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(y, (m || 1) - 1, d || 1).getDay();
  return school.meetings
    .filter((mt) => mt.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ── academic items ───────────────────────────────────────────────────────────

export function addItem(
  school: SchoolData,
  fields: {
    courseId: string; type: ItemType; title: string; due?: string; earliestStart?: string;
    estimateMinutes?: number; weight?: number; prerequisiteIds?: string[];
  }
): AcademicItem | null {
  const title = fields.title.trim();
  if (!title) return null;
  if (!school.courses.some((c) => c.id === fields.courseId)) return null;
  const now = localStamp();
  const item: AcademicItem = {
    id: newId(),
    courseId: fields.courseId,
    type: fields.type,
    title,
    due: fields.due,
    earliestStart: fields.earliestStart,
    estimateMinutes: Math.max(0, Math.round(fields.estimateMinutes ?? 60)),
    spentMinutes: 0,
    percentComplete: 0,
    weight: fields.weight,
    status: 'not_started',
    prerequisiteIds: fields.prerequisiteIds ?? [],
    steps: [],
    resourceIds: [],
    deferCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  school.items.push(item);
  touch(school);
  return item;
}

export function updateItem(school: SchoolData, id: string, patch: Partial<AcademicItem>): AcademicItem | null {
  const item = school.items.find((i) => i.id === id);
  if (!item) return null;
  Object.assign(item, patch, { id: item.id });
  item.percentComplete = Math.max(0, Math.min(100, item.percentComplete));
  item.updatedAt = localStamp();
  touch(school);
  return item;
}

export function setItemStatus(school: SchoolData, id: string, status: ItemStatus): AcademicItem | null {
  const item = school.items.find((i) => i.id === id);
  if (!item) return null;
  item.status = status;
  if (status === 'done') item.percentComplete = 100;
  item.updatedAt = localStamp();
  touch(school);
  return item;
}

/**
 * Cancelling is a deliberate act, not a quiet disappearance: the item stays,
 * carries a reason, and can be un-cancelled. Its blocks are dropped so a
 * cancelled requirement stops occupying the timetable.
 */
export function cancelItem(school: SchoolData, id: string, reason: string): AcademicItem | null {
  const item = school.items.find((i) => i.id === id);
  if (!item) return null;
  item.status = 'cancelled';
  item.cancelledReason = reason.trim();
  item.updatedAt = localStamp();
  school.blocks = school.blocks.filter((b) => b.itemId !== id || b.status === 'done');
  touch(school);
  return item;
}

export function deleteItem(school: SchoolData, id: string): boolean {
  if (!school.items.some((i) => i.id === id)) return false;
  school.items = school.items.filter((i) => i.id !== id);
  school.items.forEach((i) => {
    i.prerequisiteIds = i.prerequisiteIds.filter((p) => p !== id);
  });
  school.blocks = school.blocks.filter((b) => b.itemId !== id);
  school.resources = school.resources.filter((r) => r.itemId !== id);
  touch(school);
  return true;
}

// ── steps / next action ──────────────────────────────────────────────────────

export function addStep(school: SchoolData, itemId: string, text: string, estimateMinutes?: number): TaskStep | null {
  const item = school.items.find((i) => i.id === itemId);
  const t = text.trim();
  if (!item || !t) return null;
  const step: TaskStep = { id: newId(), text: t, done: false, estimateMinutes };
  item.steps.push(step);
  if (!item.nextActionId) item.nextActionId = step.id;
  item.updatedAt = localStamp();
  touch(school);
  return step;
}

/**
 * Toggling a step advances the next action to the first one still open, so the
 * UI always has the smallest concrete thing to show without asking twice.
 */
export function toggleStep(school: SchoolData, itemId: string, stepId: string): TaskStep | null {
  const item = school.items.find((i) => i.id === itemId);
  const step = item?.steps.find((s) => s.id === stepId);
  if (!item || !step) return null;
  step.done = !step.done;
  item.nextActionId = item.steps.find((s) => !s.done)?.id;
  item.updatedAt = localStamp();
  touch(school);
  return step;
}

export function removeStep(school: SchoolData, itemId: string, stepId: string): boolean {
  const item = school.items.find((i) => i.id === itemId);
  if (!item) return false;
  const before = item.steps.length;
  item.steps = item.steps.filter((s) => s.id !== stepId);
  if (item.steps.length === before) return false;
  if (item.nextActionId === stepId) item.nextActionId = item.steps.find((s) => !s.done)?.id;
  item.updatedAt = localStamp();
  touch(school);
  return true;
}

/** The smallest concrete thing to start on this item right now. */
export function nextAction(school: SchoolData, itemId: string): TaskStep | undefined {
  const item = school.items.find((i) => i.id === itemId);
  if (!item) return undefined;
  return item.steps.find((s) => s.id === item.nextActionId) ?? item.steps.find((s) => !s.done);
}

// ── resources & launch plans ─────────────────────────────────────────────────

export function addResource(
  school: SchoolData,
  fields: {
    kind: ResourceKind; label: string; target: string; courseId?: string; itemId?: string;
    args?: string[]; source?: Resource['source'];
  }
): Resource | null {
  const target = fields.target.trim();
  if (!target) return null;
  const source = fields.source ?? 'manual';
  const resource: Resource = {
    id: newId(),
    courseId: fields.courseId,
    itemId: fields.itemId,
    kind: fields.kind,
    label: fields.label.trim() || target,
    target,
    args: fields.args ?? [],
    // Only what the operator typed themselves is trusted. Anything inferred from
    // a PDF or an email must be confirmed before it can be launched.
    trusted: source === 'manual',
    source,
  };
  school.resources.push(resource);
  if (fields.itemId) {
    const item = school.items.find((i) => i.id === fields.itemId);
    if (item && !item.resourceIds.includes(resource.id)) item.resourceIds.push(resource.id);
  }
  touch(school);
  return resource;
}

/** Promote an inferred resource to trusted — the explicit confirmation step. */
export function trustResource(school: SchoolData, id: string): Resource | null {
  const resource = school.resources.find((r) => r.id === id);
  if (!resource) return null;
  resource.trusted = true;
  touch(school);
  return resource;
}

export function deleteResource(school: SchoolData, id: string): boolean {
  if (!school.resources.some((r) => r.id === id)) return false;
  school.resources = school.resources.filter((r) => r.id !== id);
  school.items.forEach((i) => {
    i.resourceIds = i.resourceIds.filter((r) => r !== id);
  });
  school.launchPlans.forEach((p) => {
    p.actions = p.actions.filter((a) => a.resourceId !== id);
  });
  touch(school);
  return true;
}

export function resourcesFor(school: SchoolData, itemId: string): Resource[] {
  const item = school.items.find((i) => i.id === itemId);
  if (!item) return [];
  const own = school.resources.filter((r) => item.resourceIds.includes(r.id));
  const courseWide = school.resources.filter((r) => r.courseId === item.courseId && !r.itemId);
  return [...own, ...courseWide];
}

export function createLaunchPlan(school: SchoolData, label: string, resourceIds: string[]): LaunchPlan {
  const actions: LaunchAction[] = resourceIds.map((resourceId, order) => ({
    id: newId(), resourceId, order, enabled: true, optional: false,
  }));
  const plan: LaunchPlan = { id: newId(), label: label.trim() || 'launch', actions };
  school.launchPlans.push(plan);
  touch(school);
  return plan;
}

export function attachLaunchPlan(school: SchoolData, itemId: string, planId: string): boolean {
  const item = school.items.find((i) => i.id === itemId);
  if (!item || !school.launchPlans.some((p) => p.id === planId)) return false;
  item.launchPlanId = planId;
  item.updatedAt = localStamp();
  touch(school);
  return true;
}

/** A plan's enabled actions in order, resolved to their resources. */
export function planSteps(school: SchoolData, planId: string): { action: LaunchAction; resource: Resource }[] {
  const plan = school.launchPlans.find((p) => p.id === planId);
  if (!plan) return [];
  return plan.actions
    .filter((a) => a.enabled)
    .sort((a, b) => a.order - b.order)
    .map((action) => ({ action, resource: school.resources.find((r) => r.id === action.resourceId)! }))
    .filter((s) => s.resource);
}

// ── study blocks ─────────────────────────────────────────────────────────────

export function addBlock(
  school: SchoolData,
  fields: {
    itemId: string; day: string; start: string; plannedMinutes: number; mission: string;
    generated?: boolean; deferredFrom?: string;
  }
): StudyBlock | null {
  const item = school.items.find((i) => i.id === fields.itemId);
  if (!item) return null;
  const block: StudyBlock = {
    id: newId(),
    itemId: item.id,
    courseId: item.courseId,
    day: fields.day,
    start: fields.start,
    plannedMinutes: Math.max(1, Math.round(fields.plannedMinutes)),
    mission: fields.mission.trim(),
    status: 'queued',
    generated: fields.generated ?? false,
    deferredFrom: fields.deferredFrom,
  };
  school.blocks.push(block);
  touch(school);
  return block;
}

export function setBlockStatus(school: SchoolData, id: string, status: BlockStatus): StudyBlock | null {
  const block = school.blocks.find((b) => b.id === id);
  if (!block) return null;
  block.status = status;
  touch(school);
  return block;
}

/**
 * Deferring never deletes work. The original block is marked deferred and a new
 * one is created at the new time, chained by `deferredFrom` so the trail — and
 * "you deferred this twice" — stays truthful. The item's deferCount feeds
 * urgency later.
 */
export function deferBlock(school: SchoolData, id: string, day: string, start: string): StudyBlock | null {
  const block = school.blocks.find((b) => b.id === id);
  if (!block) return null;
  block.status = 'deferred';
  const item = school.items.find((i) => i.id === block.itemId);
  if (item) {
    item.deferCount += 1;
    item.updatedAt = localStamp();
  }
  const moved: StudyBlock = {
    ...block,
    id: newId(),
    day,
    start,
    status: 'queued',
    deferredFrom: block.id,
  };
  school.blocks.push(moved);
  touch(school);
  return moved;
}

export function blocksOnDay(school: SchoolData, day: string): StudyBlock[] {
  return school.blocks
    .filter((b) => b.day === day && b.status !== 'deferred')
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** How many times this item's blocks have been pushed — the audit chain length. */
export function deferChain(school: SchoolData, blockId: string): number {
  let depth = 0;
  let current = school.blocks.find((b) => b.id === blockId);
  while (current?.deferredFrom) {
    depth += 1;
    current = school.blocks.find((b) => b.id === current!.deferredFrom);
  }
  return depth;
}

// ── study sessions ───────────────────────────────────────────────────────────

/**
 * Start the clock. Only `startedAt` is persisted — elapsed time is derived in
 * the UI, exactly like the work clock, so a running timer never rewrites the
 * whole data file once a second.
 */
export function startSession(
  school: SchoolData,
  fields: { itemId: string; blockId?: string; objective?: string; plannedMinutes?: number }
): StudySession | null {
  const item = school.items.find((i) => i.id === fields.itemId);
  if (!item) return null;
  if (school.activeSessionId) return null; // one session at a time
  const block = fields.blockId ? school.blocks.find((b) => b.id === fields.blockId) : undefined;
  const session: StudySession = {
    id: newId(),
    blockId: block?.id,
    itemId: item.id,
    courseId: item.courseId,
    startedAt: Date.now(),
    plannedMinutes: fields.plannedMinutes ?? block?.plannedMinutes ?? 45,
    actualMinutes: 0,
    objective: (fields.objective ?? block?.mission ?? item.title).trim(),
  };
  school.sessions.push(session);
  school.activeSessionId = session.id;
  if (block) block.status = 'active';
  if (item.status === 'not_started') item.status = 'in_progress';
  item.updatedAt = localStamp();
  touch(school);
  return session;
}

export function activeSession(school: SchoolData): StudySession | undefined {
  return school.sessions.find((s) => s.id === school.activeSessionId);
}

/**
 * Close the session and fold what happened back into the item: minutes spent,
 * status, and (for a partial) the fact that work remains. `blocked` records a
 * reason rather than a judgement.
 */
export function finishSession(
  school: SchoolData,
  fields: { outcome: SessionOutcome; blockedReason?: string; percentComplete?: number; note?: string }
): StudySession | null {
  const session = activeSession(school);
  if (!session) return null;
  session.endedAt = Date.now();
  session.actualMinutes = Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000));
  session.outcome = fields.outcome;
  if (fields.blockedReason) session.blockedReason = fields.blockedReason.trim();
  if (fields.note) session.resumeContext = { ...session.resumeContext, lastNote: fields.note.trim() };

  const item = school.items.find((i) => i.id === session.itemId);
  if (item) {
    item.spentMinutes += session.actualMinutes;
    if (fields.percentComplete !== undefined) {
      item.percentComplete = Math.max(0, Math.min(100, Math.round(fields.percentComplete)));
    }
    if (fields.outcome === 'done') {
      item.status = 'done';
      item.percentComplete = 100;
    } else if (fields.outcome === 'blocked') {
      item.status = 'blocked';
    } else {
      item.status = 'in_progress';
    }
    item.updatedAt = localStamp();
    session.resumeContext = { ...session.resumeContext, nextActionId: item.nextActionId };
  }

  const block = session.blockId ? school.blocks.find((b) => b.id === session.blockId) : undefined;
  if (block) block.status = fields.outcome === 'done' ? 'done' : 'partial';

  school.activeSessionId = undefined;
  touch(school);
  return session;
}

/** The most recent finished session for an item — what RESUME reads. */
export function lastSession(school: SchoolData, itemId: string): StudySession | undefined {
  return school.sessions
    .filter((s) => s.itemId === itemId && s.endedAt)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}

// ── derived ──────────────────────────────────────────────────────────────────

/** Work still to do, from percentComplete — never negative. */
export function remainingMinutes(item: AcademicItem): number {
  if (item.status === 'done' || item.status === 'cancelled') return 0;
  return Math.max(0, Math.round(item.estimateMinutes * (1 - item.percentComplete / 100)));
}

/** The local day an item is due, or '' if it has no deadline. */
export function dueDay(item: AcademicItem): string {
  return item.due ? item.due.slice(0, 10) : '';
}

/** Items still needing work, soonest deadline first; undated ones last. */
export function openItems(school: SchoolData): AcademicItem[] {
  return school.items
    .filter((i) => i.status !== 'done' && i.status !== 'cancelled')
    .sort((a, b) => {
      const da = dueDay(a);
      const db = dueDay(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
}

/** Open items due within N days of `from` — including anything already overdue. */
export function itemsDueWithin(school: SchoolData, days: number, from = localDay()): AcademicItem[] {
  return openItems(school).filter((i) => {
    const d = dueDay(i);
    if (!d) return false;
    const delta = daysBetween(from, d);
    return delta <= days;
  });
}

/** Open items whose deadline has already passed. */
export function overdueItems(school: SchoolData, from = localDay()): AcademicItem[] {
  return openItems(school).filter((i) => {
    const d = dueDay(i);
    return !!d && daysBetween(from, d) < 0;
  });
}

/** True when every prerequisite is done — the scheduler must not place work
 *  that cannot actually be started yet. */
export function prerequisitesMet(school: SchoolData, item: AcademicItem): boolean {
  return item.prerequisiteIds.every(
    (id) => school.items.find((i) => i.id === id)?.status === 'done'
  );
}

export function courseOf(school: SchoolData, item: { courseId: string }): Course | undefined {
  return school.courses.find((c) => c.id === item.courseId);
}

/** Short label for a course, for dense rows: the code, falling back to the name. */
export function courseLabel(school: SchoolData, courseId: string): string {
  const course = school.courses.find((c) => c.id === courseId);
  return course?.code || course?.name || '—';
}

export function materialsOf(school: SchoolData, courseId: string): Material[] {
  return school.materials.filter((m) => m.courseId === courseId);
}
