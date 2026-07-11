// Shared, pure computation helpers for the manager dashboard. No React, no DB —
// everything here is a plain function over already-loaded entries + the firm file
// so each tab can compute its numbers the same way.

import type { FirmFile, Person, TimeEntry } from '../../types';
import { addDaysISO, fromISODate, monthDayLabel, weekStartISO } from '../../lib/dates';

export const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

export const totalHours = (es: TimeEntry[]): number => sum(es.map((e) => e.hours));
export const billableHours = (es: TimeEntry[]): number => sum(es.filter((e) => e.billable).map((e) => e.hours));
export const oosHours = (es: TimeEntry[]): number => sum(es.filter((e) => e.outOfScope).map((e) => e.hours));

/** Inclusive whole-day span between two ISO dates. */
export function daysBetween(start: string, end: string): number {
  return Math.round((fromISODate(end).getTime() - fromISODate(start).getTime()) / 86_400_000);
}

/** Mon–Fri days in an inclusive range. Capacity is denominated on these, not on
 *  calendarDays/7 — otherwise a weekend-free range (e.g. a Mon–Fri custom range)
 *  would shrink the denominator below the 40h a full-timer actually logs and read
 *  as >100% utilization. Whole-week presets are unaffected (a Mon–Sun week has 5
 *  business days → 40h). */
export function businessDaysBetween(start: string, end: string): number {
  if (end < start) return 0;
  let count = 0;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    const dow = fromISODate(d).getDay(); // 0=Sun … 6=Sat
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

/** Available billable capacity of the active roster across the range — the
 *  denominator for TRUE utilization (billable ÷ capacity), distinct from
 *  billable-share (billable ÷ logged). Weekly capacity is spread over a 5-day
 *  week and scaled by the range's business days. */
export function firmCapacityHours(firm: FirmFile, start: string, end: string): number {
  const businessDays = businessDaysBetween(start, end);
  return sum(firm.people.filter((p) => p.active).map((p) => (p.weeklyCapacityHours / 5) * businessDays));
}

export interface WeekBucket {
  label: string;
  billable: number;
  nonBillable: number;
}

/** Bucket entries into the Monday-anchored weeks spanning [start, end], each split
 *  billable vs non-billable — the shape the WeeklyBars chart consumes. Weeks with
 *  no hours are kept so the timeline never silently collapses gaps. */
export function weeklyBuckets(entries: TimeEntry[], start: string, end: string): WeekBucket[] {
  const weeks: string[] = [];
  for (let ws = weekStartISO(start); ws <= end; ws = addDaysISO(ws, 7)) weeks.push(ws);
  const acc = new Map<string, { b: number; n: number }>(weeks.map((w) => [w, { b: 0, n: 0 }]));
  for (const e of entries) {
    const slot = acc.get(weekStartISO(e.date));
    if (!slot) continue;
    if (e.billable) slot.b += e.hours;
    else slot.n += e.hours;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return weeks.map((ws) => ({ label: monthDayLabel(ws), billable: round(acc.get(ws)!.b), nonBillable: round(acc.get(ws)!.n) }));
}

/** Compact hours: trims trailing zeros ("12", "12.5", "12.25"). */
export function fmtHours(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export const inRange = (date: string, start: string, end: string): boolean => date >= start && date <= end;

/** Resolve a projectId (real project OR non-project bucket) to display labels. */
export function projectLabel(firm: FirmFile, projectId: string, fallback: string): { name: string; client: string } {
  const proj = firm.projects.find((p) => p.projectId === projectId);
  if (proj) return { name: proj.projectName, client: proj.clientName };
  const bucket = firm.nonProjectBuckets.find((b) => b.id === projectId);
  if (bucket) return { name: bucket.name, client: '' };
  return { name: fallback, client: '' };
}

/** Sum hours grouped by an arbitrary key, returned sorted by hours descending. */
export function groupHoursDesc(es: TimeEntry[], keyFn: (e: TimeEntry) => string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const e of es) m.set(keyFn(e), (m.get(keyFn(e)) ?? 0) + e.hours);
  // Stable order: hours desc, then key asc so equal-hours rows don't reshuffle.
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Phase burn bar color: ok < 70%, warn 70–90%, alert > 90%. */
export function burnColor(ratio: number): string {
  if (ratio > 0.9) return 'bg-alert';
  if (ratio >= 0.7) return 'bg-warn';
  return 'bg-ok';
}

/** The meter track under a burn fill: the lighter step of the SAME hue ramp
 *  (see the -soft tokens in index.css), so severity reads across the whole bar
 *  instead of a gray groove changing meaning at the fill edge. */
export function burnTrackColor(ratio: number): string {
  if (ratio > 0.9) return 'bg-alert-soft';
  if (ratio >= 0.7) return 'bg-warn-soft';
  return 'bg-ok-soft';
}

export interface BurnStatus {
  label: string;
  dotClass: string;
}

/** Plain-word severity for a burn ratio, paired with a dot in the burnColor
 *  palette. Same thresholds as burnColor, with the alert band split at 100% so
 *  the words never overstate: 91% is "Almost at budget", not "Over budget" —
 *  only a ratio truly past 1.0 gets the word "over". */
export function burnStatus(ratio: number): BurnStatus {
  if (ratio > 1) return { label: 'Over budget', dotClass: 'bg-alert' };
  if (ratio > 0.9) return { label: 'Almost at budget', dotClass: 'bg-alert' };
  if (ratio >= 0.7) return { label: 'Getting close', dotClass: 'bg-warn' };
  return { label: 'On track', dotClass: 'bg-ok' };
}

/** Hours booked to the PTO / vacation / sick / holiday bucket — genuine absence
 *  that shrinks available capacity (unlike admin/marketing overhead, which
 *  legitimately drags utilization down and so stays in the denominator). */
export function leaveHours(es: TimeEntry[]): number {
  return sum(es.filter((e) => e.projectId === 'pto').map((e) => e.hours));
}

/** TRUE per-person utilization: billable ÷ (capacity − leave), over a range. Null
 *  when there is no available capacity (e.g. a full week of PTO) so we never fire
 *  a "0% — below target" alert at someone who was on vacation. */
export function personUtilization(person: Person, es: TimeEntry[], start: string, end: string): number | null {
  const capacity = (person.weeklyCapacityHours / 5) * businessDaysBetween(start, end);
  const available = capacity - leaveHours(es);
  if (available <= 0) return null;
  return pct(billableHours(es), available);
}

export type UtilStatus = 'ok' | 'below' | 'above' | 'none';

/** Where a person's utilization sits against their personal target band. */
export function utilStatus(util: number | null, band: { min: number; max: number }): UtilStatus {
  if (util === null) return 'none';
  if (util < band.min) return 'below';
  if (util > band.max) return 'above';
  return 'ok';
}

/** Tailwind background token for a status dot. */
export const statusDot: Record<UtilStatus, string> = {
  ok: 'bg-ok',
  below: 'bg-warn',
  above: 'bg-alert',
  none: 'bg-neutral-300',
};

export const statusLabel: Record<UtilStatus, string> = {
  ok: 'On target',
  below: 'Below target',
  above: 'Overloaded',
  none: 'No hours',
};
