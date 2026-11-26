import { describe, it, expect, afterEach, vi } from 'vitest';
import { localDay, localStamp, dayOf, dayOfEpoch, shiftDay, daysBetween } from './day';

afterEach(() => {
  vi.useRealTimers();
});

describe('localDay / localStamp — the local basis', () => {
  it('reads the local calendar fields, not UTC ones', () => {
    const d = new Date(2026, 8, 14, 1, 5); // 14 Sep 2026, 01:05 local
    expect(localDay(d)).toBe('2026-09-14');
    expect(localStamp(d)).toBe('2026-09-14 01:05');
  });

  it('zero-pads month, day, hour and minute', () => {
    const d = new Date(2026, 0, 3, 7, 9);
    expect(localDay(d)).toBe('2026-01-03');
    expect(localStamp(d)).toBe('2026-01-03 07:09');
  });

  /**
   * The bug this module exists to kill. East of Greenwich, just after midnight,
   * a UTC-basis date is still yesterday while the local one has rolled over.
   * Simulated rather than waited for, so it's checked on every run and not only
   * between 00:00 and 03:00.
   */
  it('rolls over at local midnight, where the old UTC basis lagged', () => {
    vi.useFakeTimers();
    // 01:00 local on 14 Sep. At UTC+3 that instant is 22:00 UTC on 13 Sep.
    vi.setSystemTime(new Date(2026, 8, 14, 1, 0));
    const now = new Date();

    expect(localDay(now)).toBe('2026-09-14'); // what the operator calls today

    // the discarded basis — only actually behind when the host runs east of UTC
    const utcBasis = now.toISOString().slice(0, 10);
    if (now.getTimezoneOffset() < 0) {
      expect(utcBasis).toBe('2026-09-13');
      expect(utcBasis).not.toBe(localDay(now));
    }
  });

  it('agrees with itself across the whole day (no basis can drift mid-run)', () => {
    for (let hour = 0; hour < 24; hour++) {
      const d = new Date(2026, 8, 14, hour, 30);
      expect(localDay(d)).toBe('2026-09-14');
    }
  });
});

describe('day arithmetic', () => {
  it('dayOf slices a stored stamp, and tolerates an empty one', () => {
    expect(dayOf('2026-09-14 16:20')).toBe('2026-09-14');
    expect(dayOf('')).toBe('');
  });

  it('dayOfEpoch maps an instant onto its local day', () => {
    const d = new Date(2026, 8, 14, 23, 45);
    expect(dayOfEpoch(d.getTime())).toBe('2026-09-14');
  });

  it('shiftDay crosses month and year boundaries', () => {
    expect(shiftDay('2026-09-14', 1)).toBe('2026-09-15');
    expect(shiftDay('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2026-09-14', 0)).toBe('2026-09-14');
  });

  it('shiftDay handles a leap day', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDay('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('daysBetween is signed and symmetric', () => {
    expect(daysBetween('2026-09-14', '2026-09-17')).toBe(3);
    expect(daysBetween('2026-09-17', '2026-09-14')).toBe(-3);
    expect(daysBetween('2026-09-14', '2026-09-14')).toBe(0);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('round-trips: shifting by N then measuring gives N back', () => {
    for (const n of [1, 7, 30, 365, -1, -14]) {
      expect(daysBetween('2026-09-14', shiftDay('2026-09-14', n))).toBe(n);
    }
  });
});
