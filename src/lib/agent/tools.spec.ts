import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Tauri IPC boundary — these tests exercise the command-recognition
// pipeline (payload gating + claim stripping), not the Rust backend.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  Channel: class {},
}));

import { executeActions, executeTool, removeUnverifiedActionClaims } from './tools';
import { store } from '../store.svelte';
import type { Quest } from '../types';

function seedQuest(over: Partial<Quest> = {}): Quest {
  const q: Quest = {
    id: 'q1', title: 'ship the thesis', kind: 'Main', cadence: 'Weekly',
    note: '', progress: 0, target: 1, completed: false, ...over,
  };
  store.data.quests.push(q);
  return q;
}

beforeEach(() => {
  store.data.quests = [];
  store.data.agentMemory.advice = [];
  store.data.vessel.today.water = 0;
});

describe('executeActions — what counts as a command', () => {
  it('executes an explicit <actions> block (no gate on the opt-in wrapper)', () => {
    const { results } = executeActions(
      'On it.\n<actions>[{"name": "add_quest", "args": {"title": "drink water", "kind": "Ritual"}}]</actions>'
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toContain('drink water');
    expect(store.data.quests).toHaveLength(1);
  });

  it('executes a ```json fence that references a real tool', () => {
    const { results } = executeActions(
      'Logging it.\n```json\n[{"name": "log_vessel", "args": {"water": 2}}]\n```'
    );
    expect(results).toHaveLength(1);
    expect(store.data.vessel.today.water).toBe(2);
  });

  it('does NOT execute a JSON example that merely contains "title"/"text" keys', () => {
    const { results } = executeActions(
      'Here is the shape for a saved lyric:\n\n{"title": "Neon Grave", "artist": "fr13nd", "text": "verse one..."}'
    );
    expect(results).toHaveLength(0);
    expect(store.data.quests).toHaveLength(0);
  });

  it('does NOT execute a code-fence example without a real tool name', () => {
    const { results } = executeActions(
      'A queue item looks like this:\n```json\n{"id": "abc", "title": "Blade Runner", "status": "queued"}\n```'
    );
    expect(results).toHaveLength(0);
    expect(store.data.quests).toHaveLength(0);
  });

  it('still accepts a bare advice-item array (the set_advice fallback)', () => {
    const { results } = executeActions(
      'Your moves:\n[{"text": "finish the mix", "action": {"type": "open_panel", "panel": "craft"}}]'
    );
    expect(results).toHaveLength(1);
    expect(store.data.agentMemory.advice).toHaveLength(1);
  });
});

describe('set_quest_steps — fr13nd breaks a quest into a checklist', () => {
  it('sets ordered steps on a quest found by id, all undone', () => {
    seedQuest();
    const out = executeTool('set_quest_steps', { id: 'q1', steps: ['outline', 'draft', 'revise'] });
    expect(out).toContain('3');
    const q = store.data.quests.find((x) => x.id === 'q1')!;
    expect(q.steps).toHaveLength(3);
    expect(q.steps!.map((s) => s.text)).toEqual(['outline', 'draft', 'revise']);
    expect(q.steps!.every((s) => s.done === false)).toBe(true);
    expect(q.steps!.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true);
  });

  it('replaces existing steps by default, appends when replace:false', () => {
    seedQuest({ steps: [{ id: 's0', text: 'old', done: true }] });
    executeTool('set_quest_steps', { title: 'ship the thesis', steps: ['new one'] });
    let q = store.data.quests.find((x) => x.id === 'q1')!;
    expect(q.steps!.map((s) => s.text)).toEqual(['new one']);

    executeTool('set_quest_steps', { id: 'q1', steps: ['appended'], replace: false });
    q = store.data.quests.find((x) => x.id === 'q1')!;
    expect(q.steps!.map((s) => s.text)).toEqual(['new one', 'appended']);
  });

  it('accepts step objects ({text}) as well as bare strings', () => {
    seedQuest();
    executeTool('set_quest_steps', { id: 'q1', steps: [{ text: 'a' }, { title: 'b' }, 'c', '  '] });
    const q = store.data.quests.find((x) => x.id === 'q1')!;
    expect(q.steps!.map((s) => s.text)).toEqual(['a', 'b', 'c']); // blank dropped
  });

  it('reports not-found for an unknown quest and sets nothing', () => {
    const out = executeTool('set_quest_steps', { id: 'nope', steps: ['x'] });
    expect(out).toContain('not found');
  });

  it('is reachable through executeActions via the set_quest_steps gate + alias', () => {
    seedQuest();
    const { results } = executeActions(
      'Broke it down.\n<actions>[{"tool": "queststeps", "args": {"id": "q1", "steps": ["one", "two"]}}]</actions>'
    );
    expect(results).toHaveLength(1);
    expect(store.data.quests[0].steps).toHaveLength(2);
  });
});

describe('removeUnverifiedActionClaims — replies must survive normal English', () => {
  it('keeps imperative sentences that start with "Set"', () => {
    const text = 'Set a 25-minute timer and hit the coding quest.';
    expect(removeUnverifiedActionClaims(text)).toBe(text);
  });

  it('keeps descriptive sentences like "Marked improvement..."', () => {
    const text = 'Marked improvement in your signal this week, operator.';
    expect(removeUnverifiedActionClaims(text)).toBe(text);
  });

  it('keeps fr13nd-isms like "Cleared for takeoff"', () => {
    const text = 'Cleared for takeoff. One move: open the DAW.';
    expect(removeUnverifiedActionClaims(text)).toBe(text);
  });

  it('still strips first-person fabricated claims ("I\'ve logged...")', () => {
    const out = removeUnverifiedActionClaims("I've logged your water, operator. Keep going.");
    expect(out).toContain('NO APP ACTION EXECUTED');
    expect(out).not.toContain("I've logged your water");
  });

  it('still strips bare past-tense status lines ("Logged: ...")', () => {
    const out = removeUnverifiedActionClaims('Logged: 3 glasses of water.');
    expect(out).toContain('NO APP ACTION EXECUTED');
  });
});
