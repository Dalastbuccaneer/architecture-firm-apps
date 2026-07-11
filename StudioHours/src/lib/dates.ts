// Date helpers. All persisted dates are local-date ISO strings (YYYY-MM-DD);
// weeks start on Monday.

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

/** Monday of the week containing `iso`. */
export function weekStartISO(iso: string): string {
  const d = fromISODate(iso);
  const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** The 7 dates (Mon..Sun) of the week starting at `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}

/** ISO-8601 week label, e.g. "2026-W27" — used in export filenames. */
export function isoWeekLabel(iso: string): string {
  const d = fromISODate(iso);
  // ISO week: Thursday of the current week decides the year.
  const thu = new Date(d);
  thu.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  const week = Math.round(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7 + 0.5);
  return `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const DAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const MD_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const RANGE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function dayLabel(iso: string): string {
  return DAY_FMT.format(fromISODate(iso)); // "Mon"
}
export function monthDayLabel(iso: string): string {
  return MD_FMT.format(fromISODate(iso)); // "Jul 6"
}
export function weekRangeLabel(weekStart: string): string {
  return `${MD_FMT.format(fromISODate(weekStart))} – ${RANGE_FMT.format(fromISODate(addDaysISO(weekStart, 6)))}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
