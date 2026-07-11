import { useMemo } from 'react';
import type { FirmFile, TimeEntry } from '../../types';
import type { DateRange } from './RangePicker';
import RenewalsStrip from './RenewalsStrip';
import { HBar } from './Bar';
import { Donut } from '../charts/Donut';
import { WeeklyBars } from '../charts/WeeklyBars';
import {
  billableHours,
  fmtHours,
  groupHoursDesc,
  oosHours,
  pct,
  projectLabel,
  totalHours,
  weeklyBuckets,
} from './metrics';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="border border-line px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      <div className="text-ink-soft">{label}</div>
    </div>
  );
}

export default function OverviewTab({ firm, entries, range }: { firm: FirmFile; entries: TimeEntry[]; range: DateRange }) {
  const total = totalHours(entries);
  const billable = billableHours(entries);
  const nonBillable = Math.round((total - billable) * 100) / 100;
  const oos = oosHours(entries);
  const billablePct = Math.round(pct(billable, total));

  const weeks = useMemo(() => weeklyBuckets(entries, range.start, range.end), [entries, range.start, range.end]);

  const byProject = useMemo(() => {
    const grouped = groupHoursDesc(entries, (e) => e.projectId);
    const max = grouped[0]?.[1] ?? 0;
    return grouped.map(([projectId, hours]) => {
      const { name, client } = projectLabel(
        firm,
        projectId,
        entries.find((e) => e.projectId === projectId)?.projectName ?? 'Unknown',
      );
      return { projectId, name, client, hours, ratio: max > 0 ? hours / max : 0 };
    });
  }, [entries, firm]);

  return (
    <div className="flex flex-col gap-8">
      {/* Expiry-date reminders (self-gated to managers; renders nothing when nothing is due). */}
      <RenewalsStrip />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total hours" value={fmtHours(total)} />
        <Stat label="Billable" value={total > 0 ? `${billablePct}%` : '—'} />
        <Stat label="Out-of-scope hours" value={fmtHours(oos)} tone={oos > 0 ? 'warn' : undefined} />
      </div>

      {total > 0 && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-4 font-bold">Billable vs non-billable</h3>
            <Donut
              segments={[
                { label: 'Billable', value: fmtNum(billable), colorClass: 'text-ink' },
                { label: 'Non-billable', value: fmtNum(nonBillable), colorClass: 'text-neutral-300' },
              ]}
              centerValue={`${billablePct}%`}
              centerLabel="billable"
            />
          </div>
          <div>
            <h3 className="mb-4 font-bold">Hours by week</h3>
            <WeeklyBars weeks={weeks} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 font-bold">Hours by project</h3>
        {byProject.length === 0 ? (
          <p className="text-ink-soft">No hours logged in this range.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {byProject.map((p) => (
              <HBar
                key={p.projectId}
                label={p.name}
                sub={p.client || undefined}
                valueLabel={`${fmtHours(p.hours)} h`}
                ratio={p.ratio}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Donut legend values read best as plain rounded numbers. */
function fmtNum(n: number): number {
  return Math.round(n * 100) / 100;
}
