import { invoke as nativeInvoke, type InvokeArgs } from '@tauri-apps/api/core';
import { listen as nativeListen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const isBrowserPreview = () => typeof window !== 'undefined' && !isDesktop();
const STORAGE_KEY = 'fr13nd-public-preview-v1';

/** Browser preview has isolated session storage and cannot access desktop data or AI. */
export async function invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (!isBrowserPreview()) return nativeInvoke<T>(command, args);
  const params = (args ?? {}) as Record<string, unknown>;
  switch (command) {
    case 'read_data': return (sessionStorage.getItem(STORAGE_KEY) ?? '') as T;
    case 'write_data': {
      const data = JSON.parse(String(params.content));
      data.settings.anthropicApiKey = '';
      data.settings.localAiProvider = 'Off';
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return undefined as T;
    }
    case 'list_backups': return [] as T;
    case 'export_data': {
      const blob = new Blob([String(params.content)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = String(params.name);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return 'Browser download' as T;
    }
    case 'toggle_compact': case 'set_sidecar_mode': case 'set_sidecar_open':
    case 'set_always_on_top': case 'wake_repaint': case 'backup_data':
    case 'mirror_data': case 'append_conversation': case 'append_void':
      return undefined as T;
    default: throw new Error('This feature requires the desktop app.');
  }
}

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (isBrowserPreview()) return () => {};
  return nativeListen(event, handler);
}
