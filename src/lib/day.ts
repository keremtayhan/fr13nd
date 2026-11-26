// The one place this app decides what day it is.
//
// It used to decide twice. 27 sites asked `new Date().toISOString().slice(0,10)`
// (a UTC calendar day) and 18 asked `toLocaleDateString('en-CA')` (a local one),
// mixed inside the same files. East of Greenwich those two disagree for the first
// hours after midnight — at UTC+3, every night from 00:00 to 03:00 local, half the
// app still thought it was yesterday. Worse, `nowString()` stamped every record
// with `toISOString()`, so stored timestamps read like local time while carrying
// UTC values: a session logged at 01:00 was filed under the previous day.
//
// Everything here is built from the Date object's local getters rather than a
// locale string, so the result can't shift with the host's ICU data or locale —
// the WebView and the test runner must agree, or day-keyed data silently splits.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day, `YYYY-MM-DD`. The canonical day key for everything stored. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local timestamp, `YYYY-MM-DD HH:MM` — the format every record is stamped with. */
export function localStamp(d: Date = new Date()): string {
  return `${localDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The day key of a stored stamp (`localStamp`, or a legacy ISO string). */
export function dayOf(stamp: string): string {
  return (stamp || '').slice(0, 10);
}

/** The day key an epoch-ms instant falls on, locally. */
export function dayOfEpoch(ms: number): string {
  return localDay(new Date(ms));
}

/** Shift a `YYYY-MM-DD` key by whole days, staying on local calendar days. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, (m || 1) - 1, (d || 1) + delta));
}

/** Whole days from `day` until `other` (negative when `other` is in the past). */
export function daysBetween(day: string, other: string): number {
  const at = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getTime();
  };
  return Math.round((at(other) - at(day)) / 86_400_000);
}
