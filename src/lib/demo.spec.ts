import { describe, it, expect, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { WidgetStore } from './store.svelte';

describe('public-edition first launch', () => {
  it('loads fictional content without credentials or AI calls when no save exists', async () => {
    vi.mocked(invoke).mockResolvedValue('');
    const store = new WidgetStore();
    vi.spyOn(store, 'save').mockImplementation(() => {});
    await store.load();
    expect(store.data.quests.length).toBeGreaterThan(0);
    expect(store.data.quests.every((q) => q.id.startsWith('demo-'))).toBe(true);
    expect(store.data.settings.anthropicApiKey).toBe('');
    expect(store.data.settings.localAiProvider).toBe('Off');
    expect(store.data.settings.hourlyPings).toBe(false);
    expect(store.data.stars.birthDate).toBe('');
    expect(store.data.agentMemory.profile).toEqual([]);
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => /chat|stream|ollama/.test(cmd))).toBe(false);
  });

  it('preserves intentionally empty saved collections instead of re-seeding them', async () => {
    const store = new WidgetStore();
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ quests: [], pet: { tasks: [] }, recipes: [] }));
    await store.load();
    expect(store.data.quests).toEqual([]);
    expect(store.data.pet.tasks).toEqual([]);
    expect(store.data.recipes).toEqual([]);
  });
});
