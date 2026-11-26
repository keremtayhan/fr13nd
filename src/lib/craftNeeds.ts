import type { CraftAreaId } from './types';

export type CraftQuestSeed = {
  title: string;
  mode: string;
  requirements: string;
};

const NEED_WORDS =
  /\b(notebook|sketchbook|pencil|pen|paper|timer|reference|laptop|repo|terminal|editor|engine|daw|headphones|instrument|mic|microphone|audio|blender|unity|godot|unreal|procreate|krita|photoshop|tablet|stylus|eraser|shoes|water|bottle|clothes|mat|weights|barbell|dumbbell|project|file|scene|timeline|clip|pose|photo|camera|metronome|brush|palette|docs|test|keyboard|mouse|book|ereader|e-reader|kindle|bookmark|highlighter)\b/i;

const DONE_WORDS =
  /\b(counts as done|visible progress|leave a short session note|finish|complete|minimum|no finished|no polishing|save the bounce|run the relevant check|write what changed|what broke)\b/i;

export function valueText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(valueText).filter(Boolean).join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(valueText).filter(Boolean).join(', ');
  }

  return String(value ?? '').trim();
}

export function looksLikeNeedList(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (DONE_WORDS.test(clean) && !NEED_WORDS.test(clean)) return false;
  return NEED_WORDS.test(clean);
}

export function craftNeedKit(areaId: CraftAreaId, title = ''): string {
  const key = title.toLowerCase();

  if (areaId === 'drawing') {
    if (/\bgesture|pose|figure\b/.test(key)) {
      return 'notebook or sketchbook, 0.5 mechanical pencil, timer, pose reference';
    }
    if (/\bthumbnail|composition|comp\b/.test(key)) {
      return 'sketchbook, pencil or pen, small boxes on the page, one reference image';
    }
    if (/\bvalue|light|shadow\b/.test(key)) {
      return 'sketchbook or tablet, pencil or brush, value reference, eraser';
    }
    return 'sketchbook or tablet, pencil or pen, eraser, reference image';
  }

  if (areaId === 'music') {
    if (/\brecord|take|vocal|riff\b/.test(key)) {
      return 'instrument or mic, headphones, recorder or DAW open, timer';
    }
    if (/\bloop|beat|drum|four bar|4 bar\b/.test(key)) {
      return 'DAW or instrument, headphones, metronome, project file';
    }
    return 'instrument or DAW, headphones, reference track, notes app or notebook';
  }

  if (areaId === 'game_dev') {
    if (/\bbug|fix|friction\b/.test(key)) {
      return 'laptop, project open, engine or editor, bug note, test scene';
    }
    if (/\bplayable|interaction|prototype|mechanic\b/.test(key)) {
      return 'laptop, project open, engine/editor, test scene, input device';
    }
    return 'laptop, project open, engine/editor, notes, quick test build';
  }

  if (areaId === 'modelling') {
    if (/\btopology|retopo|edge\b/.test(key)) {
      return 'Blender, model file, topology reference, viewport screenshots';
    }
    if (/\bsilhouette|block|shape|form\b/.test(key)) {
      return 'Blender, reference board, primitive mesh, viewport camera';
    }
    return 'Blender, model file, reference board, save slot';
  }

  if (areaId === 'animating') {
    if (/\bkey|pose\b/.test(key)) {
      return 'animation file, reference clip, timeline, pose notes';
    }
    if (/\btiming|spacing|hold\b/.test(key)) {
      return 'animation file, playback loop, timeline/dope sheet, reference clip';
    }
    return 'animation file, reference clip, timeline, playback loop';
  }

  if (areaId === 'coding') {
    if (/\bbug|fix|patch\b/.test(key)) {
      return 'laptop, repo open, terminal, relevant file, failing screen or test';
    }
    if (/\btest|check\b/.test(key)) {
      return 'laptop, repo open, terminal, relevant test command, notes';
    }
    return 'laptop, repo open, editor, terminal, relevant docs or notes';
  }

  if (areaId === 'gym') {
    if (/\blift|squat|press|deadlift|movement\b/.test(key)) {
      return 'water bottle, shoes, workout clothes, warmup space, lifting log';
    }
    if (/\bconditioning|walk|bike|cardio\b/.test(key)) {
      return 'water bottle, shoes, timer, route or machine, log';
    }
    return 'water bottle, shoes, workout clothes, timer, log';
  }

  if (areaId === 'reading') {
    if (/\bnote|highlight|summary|recall|idea\b/.test(key)) {
      return 'the book, notebook or notes app, pen or highlighter, timer';
    }
    if (/\bchapter|pages?|section\b/.test(key)) {
      return 'the book or e-reader, bookmark, quiet spot, timer';
    }
    return 'the book or e-reader, bookmark, notebook, timer';
  }

  return 'notebook, timer, the project open, one clear reference';
}

const DEFAULT_CRAFT_QUEST_TITLES: Record<CraftAreaId, { title: string; mode: string }[]> = {
  music: [
    { title: 'Record one raw take', mode: 'make' },
    { title: 'Build one four bar loop', mode: 'make' },
    { title: 'Study one reference track', mode: 'study' },
  ],
  game_dev: [
    { title: 'Make one thing playable', mode: 'make' },
    { title: 'Fix one friction point', mode: 'polish' },
    { title: 'Capture one build note', mode: 'study' },
  ],
  modelling: [
    { title: 'Block one silhouette', mode: 'make' },
    { title: 'Clean one topology problem', mode: 'polish' },
    { title: 'Study one reference object', mode: 'study' },
  ],
  drawing: [
    { title: 'Gesture drawing warmup', mode: 'practice' },
    { title: 'Make three tiny thumbnails', mode: 'make' },
    { title: 'Study one reference page', mode: 'study' },
  ],
  animating: [
    { title: 'Set three key poses', mode: 'make' },
    { title: 'Do one timing pass', mode: 'polish' },
    { title: 'Study one reference beat', mode: 'study' },
  ],
  coding: [
    { title: 'Ship one small patch', mode: 'make' },
    { title: 'Write one failing note', mode: 'study' },
    { title: 'Clean one rough edge', mode: 'polish' },
  ],
  gym: [
    { title: 'Complete the main movement', mode: 'body' },
    { title: 'Do the minimum conditioning', mode: 'body' },
    { title: 'Record one body signal', mode: 'study' },
  ],
  reading: [
    { title: 'Read one chapter', mode: 'study' },
    { title: 'Read 20 pages of anything', mode: 'study' },
    { title: 'Write one note on what stuck', mode: 'study' },
  ],
};

export function defaultCraftQuests(areaId: CraftAreaId): CraftQuestSeed[] {
  return DEFAULT_CRAFT_QUEST_TITLES[areaId].map((quest) => ({
    ...quest,
    requirements: craftNeedKit(areaId, quest.title),
  }));
}

export function isNonsenseCraftQuestTitle(title: string): boolean {
  const clean = title.trim();
  const lower = clean.toLowerCase();
  if (!clean) return true;
  if (/^(set|create|generate|give|make)\s+craft\s+quests?\b/.test(lower)) return true;
  if (/\b(static|hums|oracle|operator|tonight|that.?s it for now|dislocated)\b/.test(lower)) return true;
  if (clean.length > 80 && !/\b(draw|sketch|record|build|fix|study|model|animate|code|lift|walk|read)\b/i.test(clean)) return true;
  return false;
}
