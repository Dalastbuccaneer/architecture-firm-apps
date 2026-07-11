import { useMemo, type ComponentType } from 'react';
import { CalendarX, CircleAlert, TriangleAlert, UserX } from 'lucide-react';
import type { FirmFile, TimeEntry } from '../../types';
import type { DateRange } from './RangePicker';
import { addDaysISO, dayLabel, monthDayLabel, todayISO, weekDates, weekRangeLabel, weekStartISO } from '../../lib/dates';
import { fmtHours, personUtilization, sum } from './metrics';

type Tone = 'alert' | 'warn';
interface Alert {
  id: string;
  tone: Tone;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  detail: string;
}

export default function AlertsTab({
  firm,
  allEntries,
  rangeEntries,
  range,
}: {
  firm: FirmFile;
  allEntries: TimeEntry[];
  rangeEntries: TimeEntry[];
  range: DateRange;
}) {
  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    const activePeople = firm.people.filter((p) => p.active);

    // (a) phase burn > 85% of contracted budget, phase still open (all people, all
    // time). Out-of-scope hours are additional services beyond the contract, so
    // they are excluded here — they must not push a within-budget phase "over".
    for (const project of firm.projects) {
      for (const ph of project.phases) {
        if (ph.status !== 'open' || ph.budgetedHours == null || ph.budgetedHours <= 0) continue;
        const actual = sum(
          allEntries
            .filter((e) => e.projectId === project.projectId && e.phaseId === ph.phaseId && !e.outOfScope)
            .map((e) => e.hours),
        );
        const ratio = actual / ph.budgetedHours;
        if (ratio > 0.85) {
          out.push({
            id: `burn-${ph.phaseId}`,
            tone: ratio > 1 ? 'alert' : 'warn',
            Icon: TriangleAlert,
            title: `${project.projectName} · ${ph.aiaCode} — ${ph.name} at ${Math.round(ratio * 100)}% of budget`,
            detail: `${fmtHours(actual)} of ${fmtHours(ph.budgetedHours)} budgeted hours used${ratio > 1 ? ' — over budget' : ''}.`,
          });
        }
      }
    }

    // (b) person utilization outside their band, over the selected range. Uses
    // billable ÷ available capacity (leave excluded); rounded once so the alert and
    // the By-person table can never disagree at a band boundary.
    for (const person of activePeople) {
      const es = rangeEntries.filter((e) => e.personId === person.personId);
      const util = personUtilization(person, es, range.start, range.end);
      if (util === null) continue; // no available capacity (e.g. full-period leave)
      const u = Math.round(util);
      const { min, max } = person.targetUtilization;
      if (u < min) {
        out.push({
          id: `util-lo-${person.personId}`,
          tone: 'warn',
          Icon: CircleAlert,
          title: `${person.name} below billable target (${u}% of time billed)`,
          detail: `Billable target ${min}% – ${max}% over the selected range.`,
        });
      } else if (u > max) {
        out.push({
          id: `util-hi-${person.personId}`,
          tone: 'alert',
          Icon: CircleAlert,
          title: `${person.name} overloaded (${u}% of time billed)`,
          detail: `Above their ${min}% – ${max}% billable target over the selected range.`,
        });
      }
    }

    // (c) missing submissions: active person with no entries in the last 7 days.
    // Suppressed on a firm with no history at all, so a freshly-created firm's first
    // look at Alerts isn't flooded with "missing" warnings for everyone.
    const today = todayISO();
    const weekAgo = addDaysISO(today, -6);
    if (allEntries.length > 0) {
      for (const person of activePeople) {
        const recent = allEntries.some(
          (e) => e.personId === person.personId && e.date >= weekAgo && e.date <= today,
        );
        if (!recent) {
          out.push({
            id: `missing-${person.personId}`,
            tone: 'warn',
            Icon: UserX,
            title: `${person.name} — no time logged in the last 7 days`,
            detail: 'Their timesheet for this week may not be imported yet.',
          });
        }
      }
    }

    // (d) gap day: a Mon–Fri in the last full week with 0 hours, while active that
    // week. Skipped for part-timers (capacity < 40) — a Mon–Wed schedule is not a
    // chronic "gap", it's their week.
    const lastWeekStart = addDaysISO(weekStartISO(today), -7);
    const weekAllDays = weekDates(lastWeekStart);
    const weekdays = weekAllDays.slice(0, 5); // Mon–Fri
    for (const person of activePeople) {
      if (person.weeklyCapacityHours < 40) continue;
      const weekEntries = allEntries.filter(
        (e) => e.personId === person.personId && weekAllDays.includes(e.date),
      );
      if (sum(weekEntries.map((e) => e.hours)) <= 0) continue; // wasn't active that week
      const gaps = weekdays.filter((d) => !weekEntries.some((e) => e.date === d && e.hours > 0));
      if (gaps.length) {
        out.push({
          id: `gap-${person.personId}`,
          tone: 'warn',
          Icon: CalendarX,
          title: `${person.name} has ${gaps.length} gap ${gaps.length === 1 ? 'day' : 'days'} in the week of ${weekRangeLabel(lastWeekStart)}`,
          detail: `No hours on ${gaps.map((d) => `${dayLabel(d)} ${monthDayLabel(d)}`).join(', ')}, though they logged time elsewhere that week.`,
        });
      }
    }

    const order: Record<Tone, number> = { alert: 0, warn: 1 };
    return out.sort((a, b) => order[a.tone] - order[b.tone]);
  }, [firm, allEntries, rangeEntries, range.start, range.end]);

  if (alerts.length === 0) {
    return <p className="text-ink-soft">No alerts — quiet is good.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-3 border border-line p-3">
          <a.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${a.tone === 'alert' ? 'text-alert' : 'text-warn'}`} aria-hidden />
          <div>
            <p className="font-bold">{a.title}</p>
            <p className="text-ink-soft">{a.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
