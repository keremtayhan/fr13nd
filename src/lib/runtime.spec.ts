import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
import { invoke as nativeInvoke } from '@tauri-apps/api/core';
import { invoke } from './runtime';

describe('browser preview isolation', () => {
  beforeEach(() => {
    vi.mocked(nativeInvoke).mockReset();
    const data = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps edits across reads without persisting credentials or enabling AI', async () => {
    expect(await invoke('read_data')).toBe('');
    await invoke('write_data', { content: JSON.stringify({ settings: { anthropicApiKey: 'test-only-secret', localAiProvider: 'Claude' }, quests: [{ title: 'Fictional task' }] }) });
    const saved = JSON.parse(await invoke<string>('read_data'));
    expect(saved.settings).toEqual({ anthropicApiKey: '', localAiProvider: 'Off' });
    expect(saved.quests[0].title).toBe('Fictional task');
    expect(nativeInvoke).not.toHaveBeenCalled();
  });

  it('rejects native commands instead of forwarding them from the preview', async () => {
    await expect(invoke('read_backup', { file: 'anything.json' })).rejects.toThrow('requires the desktop app');
    await expect(invoke('claude_chat')).rejects.toThrow('requires the desktop app');
    expect(nativeInvoke).not.toHaveBeenCalled();
  });
});
