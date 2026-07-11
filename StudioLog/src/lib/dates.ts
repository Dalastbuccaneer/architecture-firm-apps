// Date helpers, ported from StudioHours. All persisted dates are local-date
// ISO strings (YYYY-MM-DD); datetimes (createdAt/updatedAt) are full ISO.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from `a` to `b` (positive when b is later). Local-date math, so
 *  DST shifts can't skew it by an hour. */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

const MD_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const FULL_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const TODAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export function monthDayLabel(iso: string): string {
  return MD_FMT.format(fromISODate(iso)); // "Jul 6"
}

export function fullDateLabel(iso: string): string {
  return FULL_FMT.format(fromISODate(iso)); // "Jul 6, 2026"
}

export function todayHeadingLabel(iso: string): string {
  return TODAY_FMT.format(fromISODate(iso)); // "Monday, July 6"
}

export function nowISO(): string {
  return new Date().toISOString();
}
