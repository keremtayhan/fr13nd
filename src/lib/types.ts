/**
 * How much the body trackers (VESSEL + FUEL) participate in the app.
 *   'on'    — panels shown; fr13nd sees the numbers and may bring them up.
 *   'quiet' — panels stay fully usable, but fr13nd never sees or mentions them.
 *   'off'   — panels hidden as well. Nothing is ever deleted; flip back any time.
 */
export type BodyTracking = 'on' | 'quiet' | 'off';

export interface Settings {
  companionName: string;
  companionTone: string;
  pinned: boolean;
  compact: boolean;
  localAiProvider: string;
  localAiUrl: string;
  localAiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  agentPersonality: string;
  // ── pressure controls: what the app is allowed to push at the operator ──
  bodyTracking?: BodyTracking;
  /** Full-window red alarm while dailies are open. Off by default: it was lit
   *  nearly all day, which made it ambient guilt rather than information. */
  alarmBorder?: boolean;
  /** The strip listing today's open gaps. Informational, not alarming. */
  showDailyGaps?: boolean;
  /** fr13nd's hourly desktop notification (08:00–22:00). */
  hourlyPings?: boolean;
}

export type QuestKind = 'Main' | 'Job' | 'School' | 'Side' | 'Ritual';
export type QuestCadence = 'Today' | 'Daily' | 'Weekly' | 'Monthly' | 'Long Arc';

export interface QuestStep {
  id: string;
  text: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  kind: QuestKind;
  cadence: QuestCadence;
  note: string;
  advice?: string;
  progress: number;
  target: number;
  completed: boolean;
  steps?: QuestStep[]; // optional breakdown — revealed in the quest's dropdown drawer
}

export interface Recipe {
  id: string;
  title: string;
  tags: string;
  ingredients: string;
  steps: string;
  lastCooked: string;
}

export interface Ritual {
  mood: string;
  energy: number;
  focus: string;
  lastCheckIn: string;
  notes: string[];
}

export interface ConversationTurn {
  at: string;
  user: string;
  agent: string;
}

export type AdviceAction =
  | { type: 'complete_quest'; id: string }
  | { type: 'progress_quest'; id: string }
  | { type: 'open_panel'; panel: string }
  | { type: 'custom'; prompt: string };

export interface AgentAdvice {
  text: string;
  action: AdviceAction;
  done?: boolean;
}

export interface OverseerEvent {
  at: string;
  source: string; // which AI subsystem reported: notify, zodiac, capture, nutrition, critique, …
  note: string;
}

export interface AgentMemory {
  profile: string[];
  preferences: string[];
  patterns: string[];
  notes: string[];
  recentConversations: ConversationTurn[];
  advice: AgentAdvice[];
  overseerLog?: OverseerEvent[]; // the shared ledger connecting every AI subsystem
  updated: string;
  lastBriefDate?: string;
  lastEveningDate?: string;
  lastReflectionDate?: string;
  lastProactiveAt?: number;
  lastHourlyNotifyAt?: number;
}

export interface AbodeTask {
  id: string;
  room: string;
  title: string;
  cadence: string;
  note: string;
  progress: number;
  target: number;
  completed: boolean;
}

export interface PetTask {
  id: string;
  title: string;
  kind: string;
  cadence: string;
  note: string;
  progress: number;
  target: number;
  completed: boolean;
}

export interface VesselLog {
  date: string;
  water: number;
  sleep: number;
  movement: number;
  meals: number;
  meds: boolean;
  note: string;
  weight?: number; // kg; 0/undefined = not weighed that day
}

export type CraftAreaId =
  | 'music'
  | 'game_dev'
  | 'modelling'
  | 'drawing'
  | 'animating'
  | 'coding'
  | 'gym'
  | 'reading';

export interface CraftSession {
  id: string;
  at: string;
  minutes: number;
  energy: number;
  mode?: string;
  note: string;
}

export interface CraftQuest {
  id: string;
  title: string;
  mode: string;
  requirements: string;
  note: string;
  completed: boolean;
  createdAt: string;
}

export interface CraftArea {
  id: CraftAreaId;
  title: string;
  project: string;
  nextAction: string;
  drill: string;
  reference: string;
  blocker: string;
  edge: string;
  targetMinutes: number;
  quests: CraftQuest[];
  sessions: CraftSession[];
}

export interface Craft {
  focus: CraftAreaId;
  areas: CraftArea[];
  updated: string;
  levelsSeen?: Record<string, number>; // area id / 'overall' -> last acknowledged level (for level-up detection)
}

export type SignalMetricId =
  | 'intrusiveThoughts'
  | 'executiveDysfunction'
  | 'obsessiveThoughts'
  | 'dissociation'
  | 'depression';

export interface MentalSignalDay {
  date: string;
  intrusiveThoughts: number;
  executiveDysfunction: number;
  obsessiveThoughts: number;
  dissociation: number;
  depression: number;
  note: string;
  sigil: string;
  checkedIn: boolean;
  at: string;
}

export interface VoidEntry {
  id: string;
  at: string;
  text: string;
}

export interface MentalSignals {
  today: MentalSignalDay;
  log: MentalSignalDay[];
  updated: string;
  voidLog?: VoidEntry[]; // diary entries "sent into the void" — released visually, kept here
}

export type FuelKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FuelEntry {
  id: string;
  at: string;
  name: string;
  kcal: number;
  kind: FuelKind;
  note: string;
  estimated?: boolean;
  protein?: number; // grams
  carbs?: number; // grams
  fat?: number; // grams
}

export interface FuelDay {
  date: string;
  entries: FuelEntry[];
}

export interface MealTime {
  id: FuelKind;
  time: string; // 'HH:MM' local — the designated time for this meal
}

export interface Fuel {
  today: FuelDay;
  log: FuelDay[];
  targetKcal: number; // 0 = no target, just a log
  targetProtein?: number; // grams/day, 0 = off
  targetCarbs?: number; // grams/day, 0 = off
  targetFat?: number; // grams/day, 0 = off
  mealTimes?: MealTime[];
  updated: string;
}

export interface WorkSession {
  id: string;
  start: number; // epoch ms (compared against the local clock)
  end: number;
  minutes: number;
}

export interface Work {
  clockedInAt: number; // epoch ms, 0 = clocked out
  log: WorkSession[];
  targetMinutes: number; // a 9–6 day = 540
  updated: string;
}

export type LyricKind = 'song' | 'fragment' | 'saved';

export interface LyricEntry {
  id: string;
  kind: LyricKind; // 'song' = your draft · 'fragment' = a loose line · 'saved' = lyrics you love
  title: string;
  body: string;
  artist?: string; // for 'saved' — whose lyrics these are
  tags: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lyrics {
  entries: LyricEntry[];
  updated: string;
}

export interface StarsRead {
  date: string; // YYYY-MM-DD this read is for
  western: string; // e.g. "♌ Leo"
  chinese: string; // e.g. "Wood Rat"
  body: string; // fr13nd's daily read (READ / DO / DON'T)
}

export interface Stars {
  birthDate: string; // 'YYYY-MM-DD' or '' if unset
  read?: StarsRead;
  updated: string;
}

export type QueueKind = 'watch' | 'read';
export type QueueStatus = 'queued' | 'active' | 'done';

export interface QueueItem {
  id: string;
  kind: QueueKind;
  title: string;
  status: QueueStatus;
  note: string; // where it's streaming, who recced it, a rating once done
  addedAt: string;
  finishedAt?: string;
}

export interface Queue {
  items: QueueItem[];
  updated: string;
}

export interface KanjiCard {
  id: string;
  char: string; // the kanji glyph, e.g. 水
  meaning: string; // english gloss, e.g. water
  reading: string; // freeform kun/on readings, e.g. みず・スイ
  note?: string; // optional mnemonic
  box: number; // 0..5 Leitner mastery level
  due: string; // YYYY-MM-DD next review ('' = brand new, due now)
  reps: number; // times recalled correctly
  lapses: number; // times missed
  added: string;
}

export interface KanjiDeck {
  cards: KanjiCard[];
  updated: string;
}

// ── SCHOOL ────────────────────────────────────────────────────────────────────
// The academic core. Collections are flat and id-keyed with foreign keys rather
// than nested, so rescheduling and lookups never require deep traversal, and a
// single item can be moved without rewriting a tree.

export interface Semester {
  id: string;
  title: string; // "Fall 2026"
  startDate: string; // localDay
  endDate: string;
  active: boolean;
}

export interface GradingWeight {
  label: string; // "Midterm"
  percent: number;
}

export interface Course {
  id: string;
  semesterId: string;
  code: string; // "CS101"
  name: string; // "Programming Languages"
  instructor: string;
  credits: number;
  location: string;
  color: string; // '' falls back to --kind-school
  gradingWeights: GradingWeight[];
  attendanceRequired: boolean;
  archived: boolean;
}

/** A recurring class slot. weekday: 0=Sunday .. 6=Saturday. */
export interface CourseMeeting {
  id: string;
  courseId: string;
  weekday: number;
  start: string; // "13:30"
  end: string; // "15:20"
  location: string;
}

export type ItemType = 'assignment' | 'exam' | 'quiz' | 'reading' | 'project';
export type ItemStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

/** A step of an academic item — the QuestStep shape, plus an optional estimate. */
export interface TaskStep extends QuestStep {
  estimateMinutes?: number;
}

/**
 * One table with a type discriminator rather than five near-identical ones: an
 * exam and an assignment differ in nothing the scheduler cares about, and five
 * tables would mean five code paths through it.
 */
export interface AcademicItem {
  id: string;
  courseId: string;
  type: ItemType;
  title: string;
  due?: string; // "2026-09-28T23:59" local
  earliestStart?: string; // don't schedule before this day
  estimateMinutes: number;
  spentMinutes: number; // summed from sessions
  percentComplete: number; // 0-100
  weight?: number; // share of the course grade
  status: ItemStatus;
  prerequisiteIds: string[];
  steps: TaskStep[];
  nextActionId?: string;
  resourceIds: string[];
  launchPlanId?: string;
  deferCount: number; // feeds urgency, and "you deferred this twice"
  cancelledReason?: string; // cancelling is explicit, never silent
  createdAt: string;
  updatedAt: string;
}

export type ResourceKind = 'file' | 'folder' | 'url' | 'vscode' | 'terminal' | 'app' | 'note';

/**
 * Something the launcher can open. `trusted` is the security seam: anything
 * inferred from a PDF or an email lands untrusted and cannot be executed until
 * the operator confirms it.
 */
export interface Resource {
  id: string;
  courseId?: string;
  itemId?: string;
  kind: ResourceKind;
  label: string;
  target: string;
  args: string[]; // argv array — never an interpolated shell string
  trusted: boolean;
  source: 'manual' | 'inferred' | 'imported';
}

export interface LaunchAction {
  id: string;
  resourceId: string;
  order: number;
  enabled: boolean;
  optional: boolean;
}

export interface LaunchPlan {
  id: string;
  label: string;
  actions: LaunchAction[];
}

export type BlockStatus =
  | 'queued' | 'next' | 'active' | 'done' | 'partial' | 'deferred' | 'missed';

export interface StudyBlock {
  id: string;
  itemId: string;
  courseId: string;
  day: string; // localDay
  start: string; // "13:30"
  plannedMinutes: number;
  mission: string; // a deliverable, never "study CS101"
  status: BlockStatus;
  /** Scheduler-made blocks may be moved automatically; hand-placed ones are the
   *  operator's and are left alone. */
  generated: boolean;
  deferredFrom?: string; // prior block id — the audit trail
}

export type SessionOutcome = 'done' | 'partial' | 'blocked' | 'wrong_estimate';

export interface ResumeContext {
  lastResourceId?: string;
  lastNote?: string;
  nextActionId?: string;
}

export interface StudySession {
  id: string;
  blockId?: string;
  itemId: string;
  courseId: string;
  startedAt: number; // epoch ms, like WorkSession
  endedAt?: number;
  plannedMinutes: number;
  actualMinutes: number;
  objective: string;
  outcome?: SessionOutcome;
  blockedReason?: string;
  resumeContext?: ResumeContext;
}

export type IngestState = 'none' | 'queued' | 'extracting' | 'ready' | 'failed' | 'needs_ocr';

/**
 * Tier-1 pointer plus tier-2 bookkeeping. No extracted text ever lives in this
 * record — the store is read whole and rewritten on every save, so a textbook
 * inside it would make logging a glass of water rewrite megabytes.
 */
export interface Material {
  id: string;
  courseId: string;
  itemId?: string;
  title: string;
  kind: 'textbook' | 'syllabus' | 'slides' | 'spec' | 'notes' | 'other';
  sourcePath: string; // left where it is, never copied
  bytes: number;
  sha256: string; // detects a replaced / re-saved file
  pageCount?: number;
  ingest: IngestState;
  textDir?: string; // tier 2 — sidecar dir of per-page text
  ingestedAt?: string;
  error?: string;
  topics: string[];
}

/** The retrieval unit. A 900-page book is ~900 addressable chunks, so a future
 *  answer can cite a page. Metadata only; the text lives in the tier-2 sidecar. */
export interface MaterialChunk {
  id: string;
  materialId: string;
  page: number;
  heading?: string;
  chars: number;
}

export interface SchoolData {
  semesters: Semester[];
  courses: Course[];
  meetings: CourseMeeting[];
  items: AcademicItem[];
  resources: Resource[];
  launchPlans: LaunchPlan[];
  blocks: StudyBlock[];
  sessions: StudySession[];
  materials: Material[];
  chunks: MaterialChunk[];
  /** The live study timer, mirroring work.clockedInAt: set on start, cleared on
   *  finish, so a running session survives a relaunch without writing per tick. */
  activeSessionId?: string;
  updated: string;
}

export interface AppData {
  settings: Settings;
  lastDailyReset?: string;
  quests: Quest[];
  recipes: Recipe[];
  ritual: Ritual;
  agentMemory: AgentMemory;
  abode: { tasks: AbodeTask[] };
  pet: { tasks: PetTask[] };
  vessel: { today: VesselLog; log: VesselLog[] };
  craft: Craft;
  signal: MentalSignals;
  fuel: Fuel;
  work: Work;
  lyrics: Lyrics;
  stars: Stars;
  queue: Queue;
  kanji: KanjiDeck;
  school: SchoolData;
}
