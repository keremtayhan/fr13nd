// The frontend half of the launcher: turns a launch plan into an ordered series
// of calls into the audited Rust surface.
//
// Note what is deliberately absent — there is no way from here to name an
// executable. `vscode` and `terminal` are intents; Rust resolves the binary.
// Everything untrusted a later phase might infer from a PDF or an email ends up
// as a path or a URL, and both of those are validated on the Rust side.

import { invoke } from '@tauri-apps/api/core';

export type LaunchKind = 'file' | 'folder' | 'url' | 'vscode' | 'terminal';

export interface LaunchStep {
  kind: LaunchKind;
  target: string;
  label?: string;
  /** A step the plan can proceed without — a missing one is reported, not fatal. */
  optional?: boolean;
}

export interface StepResult {
  step: LaunchStep;
  ok: boolean;
  error?: string;
}

export interface LaunchResult {
  ok: boolean;
  ran: StepResult[];
  failed: StepResult[];
}

/** Run one step. Never throws — a launch plan reports, it doesn't explode. */
export async function runStep(step: LaunchStep): Promise<StepResult> {
  const target = step.target?.trim();
  if (!target) return { step, ok: false, error: 'no target set' };
  try {
    switch (step.kind) {
      case 'file':
      case 'folder':
        await invoke('open_path', { path: target });
        break;
      case 'url':
        await invoke('open_url', { url: target });
        break;
      case 'vscode':
        await invoke('open_in_vscode', { path: target });
        break;
      case 'terminal':
        await invoke('open_terminal', { path: target });
        break;
      default:
        return { step, ok: false, error: `unknown step kind: ${step.kind}` };
    }
    return { step, ok: true };
  } catch (e) {
    return { step, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Run a whole plan in order.
 *
 * Sequential on purpose: opening six things at once makes the window that ends
 * up focused a race, and the operator should land on the first thing the plan
 * names. A failed non-optional step does not abort the rest — getting three of
 * four windows open is still better than getting none, and the caller is told
 * exactly what didn't make it.
 */
export async function runPlan(steps: LaunchStep[]): Promise<LaunchResult> {
  const ran: StepResult[] = [];
  for (const step of steps) {
    ran.push(await runStep(step));
  }
  const failed = ran.filter((r) => !r.ok && !r.step.optional);
  return { ok: failed.length === 0, ran, failed };
}

export interface TargetProbe {
  target: string;
  exists: boolean;
  kind: 'url' | 'folder' | 'file' | 'missing';
  blocked: boolean;
}

/** Check a plan's targets without opening anything — for rendering plan health. */
export async function probe(targets: string[]): Promise<TargetProbe[]> {
  if (!targets.length) return [];
  try {
    return await invoke<TargetProbe[]>('probe_targets', { paths: targets });
  } catch {
    return targets.map((target) => ({ target, exists: false, kind: 'missing' as const, blocked: false }));
  }
}

export interface LauncherCapabilities {
  vscode: string | null;
  terminal: string | null;
}

/** What this machine can actually launch — so the UI never offers a dead button. */
export async function capabilities(): Promise<LauncherCapabilities> {
  try {
    return await invoke<LauncherCapabilities>('launcher_capabilities');
  } catch {
    return { vscode: null, terminal: null };
  }
}
