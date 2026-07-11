import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { FirmFile, TimeEntry } from '../../types';
import type { DateRange } from './RangePicker';
import { billableHours, fmtHours, groupHoursDesc, personUtilization, statusDot, statusLabel, totalHours, utilStatus } from './metrics';

function nonBillableLabel(firm: FirmFile, e: TimeEntry): string {
  const bucket = firm.nonProjectBuckets.find((b) => b.id === e.projectId);
  if (bucket) return bucket.name;
  return e.activityName ?? e.projectName;
}

export default function ByPersonTab({ firm, entries, range }: { firm: FirmFile; entries: TimeEntry[]; range: DateRange }) {
  const byPerson = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const list = m.get(e.personId) ?? [];
      list.push(e);
      m.set(e.personId, list);
    }
    return m;
  }, [entries]);

  const people = firm.people.filter((p) => p.active);
  if (people.length === 0) return <p className="text-ink-soft">No active people in the firm file.</p>;

  return (
    <div>
      <p className="mb-3 text-ink-soft">Share of time billed = billable hours ÷ available capacity.</p>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="flex items-center gap-4 border-b border-ink py-2 font-bold">
            <span className="flex-1">Person</span>
            <span className="w-20 text-right">Total</span>
            <span className="w-20 text-right">Billable</span>
            <span className="w-28 text-right">Time billed</span>
            <span className="w-36">Status</span>
          </div>

          {people.map((person) => {
            const es = byPerson.get(person.personId) ?? [];
            const total = totalHours(es);
            const billable = billableHours(es);
            const util = personUtilization(person, es, range.start, range.end);
            const status = utilStatus(util, person.targetUtilization);
            const nonBillable = groupHoursDesc(es.filter((e) => !e.billable), (e) => nonBillableLabel(firm, e));

            return (
              <details key={person.personId} className="group border-b border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-4 py-2">
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 group-open:rotate-90"
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{person.name}</span>
                  <span className="w-20 text-right tabular-nums">{fmtHours(total)} h</span>
                  <span className="w-20 text-right tabular-nums">{fmtHours(billable)} h</span>
                  <span className="w-28 text-right tabular-nums">{util === null ? '—' : `${Math.round(util)}%`}</span>
                  <span className="flex w-36 items-center gap-2">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot[status]}`} aria-hidden />
                    {statusLabel[status]}
                  </span>
                </summary>
                <div className="pb-3 pl-8 text-ink-soft">
                  <p className="mb-1">
                    Share of time billed is billable ÷ available capacity (leave excluded). Billable target{' '}
                    {person.targetUtilization.min}% – {person.targetUtilization.max}% · non-billable breakdown:
                  </p>
                  {nonBillable.length === 0 ? (
                    <p>All logged time was billable.</p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {nonBillable.map(([label, hours]) => (
                        <li key={label} className="flex justify-between gap-4">
                          <span>{label}</span>
                          <span className="tabular-nums">{fmtHours(hours)} h</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
