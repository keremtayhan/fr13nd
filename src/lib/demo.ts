import type { AppData } from './types';
import { localDay } from './day';

/** Hand-authored fictional examples. Never derived from an exported user profile. */
export function populateDemo(data: AppData, now = new Date()): AppData {
  const today = localDay(now);
  const at = `${today} 09:00`;
  data.lastDailyReset = today;
  data.quests = [
    { id: 'demo-quest-1', title: 'Build a tiny constellation game', kind: 'Main', cadence: 'Long Arc', note: 'Fictional project: connect stars with a single mechanic.', progress: 2, target: 5, completed: false,
      steps: [{ id: 'demo-step-1', text: 'Sketch the core interaction', done: true }, { id: 'demo-step-2', text: 'Prototype the star connections', done: false }] },
    { id: 'demo-quest-2', title: 'Practice a new sketch technique', kind: 'Side', cadence: 'Daily', note: 'Demo routine: ten minutes of shape studies.', progress: 0, target: 1, completed: false },
    { id: 'demo-quest-3', title: 'Review the week and choose one priority', kind: 'Ritual', cadence: 'Weekly', note: 'Fictional planning example.', progress: 1, target: 1, completed: true },
  ];
  data.ritual = { mood: 'Curious', energy: 3, focus: 'Explore the constellation prototype', lastCheckIn: at, notes: ['Fictional demo profile — all starter entries are examples.'] };
  data.recipes = [{ id: 'demo-recipe-1', title: 'Garden rice bowl', tags: 'demo, quick', ingredients: 'Cooked rice, roasted vegetables, chickpeas, lemon', steps: 'Warm the rice. Add vegetables and chickpeas. Finish with lemon.', lastCooked: '' }];
  data.abode.tasks = [{ id: 'demo-home-1', room: 'Workspace', title: 'Clear the sketching desk', cadence: 'Weekly', note: 'Fictional home routine.', progress: 0, target: 1, completed: false }];
  data.pet.tasks = [
    { id: 'demo-pet-1', title: 'Refresh the water bowl', kind: 'Care', cadence: 'Daily', note: 'Fictional pet-care example.', progress: 1, target: 1, completed: true },
    { id: 'demo-pet-2', title: 'Set aside play time', kind: 'Care', cadence: 'Daily', note: 'Fictional pet-care example.', progress: 0, target: 1, completed: false },
  ];
  data.vessel.today = { date: today, water: 3, sleep: 7.5, movement: 20, meals: 1, meds: false, note: 'Fictional values for interface demonstration.', weight: 0 };
  data.signal.today.date = today;
  data.fuel.today.date = today;
  data.craft.focus = 'game_dev';
  const game = data.craft.areas.find((area) => area.id === 'game_dev')!;
  game.project = 'Constellation Garden';
  game.nextAction = 'Draw three star patterns';
  game.quests = [{ id: 'demo-craft-1', title: 'Make the first playable scene', mode: 'make', requirements: 'Three stars, one connection, one win state.', note: 'Fictional project.', completed: false, createdAt: at }];
  game.sessions = [{ id: 'demo-session-1', at, minutes: 25, energy: 3, mode: 'make', note: 'Fictional session: explored a single interaction.' }];
  data.queue.items = [{ id: 'demo-queue-1', kind: 'read', title: 'The Imaginary Atlas', status: 'queued', note: 'Invented title for this demo.', addedAt: at }];
  data.lyrics.entries = [{ id: 'demo-lyric-1', kind: 'fragment', title: 'Paper satellites', body: 'Paper satellites drift through a painted sky.\nWe draw tomorrow one small line at a time.', tags: 'fictional, demo', createdAt: at, updatedAt: at }];
  data.agentMemory.recentConversations = [{ at, user: '[Fictional example] What should I try first?', agent: '[Scripted demo — not a live AI response] Open QUESTS and tick a step, or use the capture bar to add an idea. AI connections are off until you configure a desktop backend.' }];
  return data;
}
