import { Fragment, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Download, Printer } from 'lucide-react';
import { db, kvGet, kvSet, kvLastExport } from '../db';
import { useApp } from '../AppContext';
import { addDaysISO, fromISODate, monthDayLabel, nowISO, todayISO, toISODate, weekStartISO } from '../lib/dates';
import { buildTimeExport, entriesToCsv, exportFilename } from '../lib/serialize';
import { downloadText } from '../lib/download';
import { Donut } from '../components/charts/Donut';
import '../print.css';

const round2 = (n: number): number => Math.round(n * 100) / 100;

type RangeMode = 'week' | 'lastWeek' | 'month' | 'custom';

function monthStart(iso: string): string {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function monthEnd(iso: string): string {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function rangeLabel(start: string, end: string): string {
  return `${monthDayLabel(start)} – ${monthDayLabel(end)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MyReports() {
  const { firm, me } = useApp();
  const thisWeekStart = weekStartISO(todayISO());
  const [start, setStart] = useState(thisWeekStart);
  const [end, setEnd] = useState(addDaysISO(thisWeekStart, 6));
  const [mode, setMode] = useState<RangeMode>('week');

  const personId = me?.personId ?? '';

  const allEntries = useLiveQuery(
    () => db.entries.where('personId').equals(personId).toArray(),
    [personId],
  );
  const lastExportedAt = useLiveQuery(
    () => kvGet<string>(kvLastExport(personId, start)),
    [personId, start],
  );

  if (!firm || !me) return null;

  const entriesInRange = (allEntries ?? [])
    .filter((e) => e.date >= start && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.projectName.localeCompare(b.projectName));

  const isExactWeek = weekStartISO(start) === start && addDaysISO(start, 6) === end;

  const setPreset = (m: 'week' | 'lastWeek' | 'month') => {
    const today = todayISO();
    if (m === 'week') {
      const s = weekStartISO(today);
      setStart(s);
      setEnd(addDaysISO(s, 6));
    } else if (m === 'lastWeek') {
      const s = addDaysISO(weekStartISO(today), -7);
      setStart(s);
      setEnd(addDaysISO(s, 6));
    } else {
      setStart(monthStart(today));
      setEnd(monthEnd(today));
    }
    setMode(m);
  };

  const totalHours = entriesInRange.reduce((s, e) => s + e.hours, 0);
  const billableHours = entriesInRange.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
  const nonBillableHours = totalHours - billableHours;
  const utilizationPct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : null;

  type PhaseAgg = { phaseId: string; phaseName: string; hours: number };
  type ProjectAgg = { projectId: string; projectName: string; hours: number; phases: PhaseAgg[] };
  const projectMap = new Map<string, ProjectAgg>();
  for (const e of entriesInRange) {
    let p = projectMap.get(e.projectId);
    if (!p) {
      p = { projectId: e.projectId, projectName: e.projectName, hours: 0, phases: [] };
      projectMap.set(e.projectId, p);
    }
    p.hours += e.hours;
    if (e.phaseId) {
      let ph = p.phases.find((x) => x.phaseId === e.phaseId);
      if (!ph) {
        ph = { phaseId: e.phaseId, phaseName: e.phaseName ?? '—', hours: 0 };
        p.phases.push(ph);
      }
      ph.hours += e.hours;
    }
  }
  const projectRows = [...projectMap.values()].sort(
    (a, b) => b.hours - a.hours || a.projectName.localeCompare(b.projectName),
  );

  type ActivityAgg = { key: string; activityName: string; hours: number };
  const activityMap = new Map<string, ActivityAgg>();
  for (const e of entriesInRange) {
    const key = e.activityId ?? '__none__';
    let a = activityMap.get(key);
    if (!a) {
      a = { key, activityName: e.activityName ?? 'No activity', hours: 0 };
      activityMap.set(key, a);
    }
    a.hours += e.hours;
  }
  const activityRows = [...activityMap.values()].sort(
    (a, b) => b.hours - a.hours || a.activityName.localeCompare(b.activityName),
  );

  const oosEntries = entriesInRange.filter((e) => e.outOfScope);

  const pct = (hours: number) => (totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0);

  const doExportJson = () => {
    const file = buildTimeExport(firm, me.personId, entriesInRange, start, end);
    downloadText(exportFilename(firm.firm.firmName, me.name, start, 'json'), JSON.stringify(file, null, 2));
    if (isExactWeek) void kvSet(kvLastExport(me.personId, start), nowISO());
  };

  const doExportCsv = () => {
    const content = entriesToCsv(entriesInRange, firm);
    downloadText(exportFilename(firm.firm.firmName, me.name, start, 'csv'), content, 'text/csv');
    if (isExactWeek) void kvSet(kvLastExport(me.personId, start), nowISO());
  };

  const presetBtn = (m: 'week' | 'lastWeek' | 'month', label: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => setPreset(m)}
      className={`min-h-11 cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
        mode === m ? 'border-ink bg-ink font-bold text-paper' : 'border-line hover:border-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="no-print">
        <h1 className="text-2xl font-bold">My reports</h1>
        <p className="mb-6 mt-1 text-ink-soft">
          Your logged hours for the chosen dates — send them to your manager, or print a copy.
        </p>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          {presetBtn('week', 'This week')}
          {presetBtn('lastWeek', 'Last week')}
          {presetBtn('month', 'This month')}
          <label className="flex items-center gap-1">
            <span className="text-ink-soft">From</span>
            <input
              type="date"
              aria-label="Custom range start date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setMode('custom');
              }}
              className="h-11 border border-line px-2"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-ink-soft">To</span>
            <input
              type="date"
              aria-label="Custom range end date"
              value={end}
              min={start}
              onChange={(e) => {
                setEnd(e.target.value);
                setMode('custom');
              }}
              className="h-11 border border-line px-2"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
        </div>

        {totalHours > 0 ? (
          <div className="mb-8 flex flex-wrap items-center gap-x-12 gap-y-6">
            <div>
              <p className="text-ink-soft">Total hours</p>
              <p className="text-2xl font-bold tabular-nums">{round2(totalHours)}</p>
            </div>
            <Donut
              segments={[
                { label: 'Billable', value: round2(billableHours), colorClass: 'text-ink' },
                { label: 'Non-billable', value: round2(nonBillableHours), colorClass: 'text-neutral-300' },
              ]}
              centerValue={`${utilizationPct ?? 0}%`}
              centerLabel="billable"
            />
          </div>
        ) : (
          <p className="mb-8 text-ink-soft">No hours logged in this range yet — fill in your Week grid first.</p>
        )}

        <div className="mb-8 overflow-x-auto">
          <h3 className="mb-3 font-bold">Where your time went</h3>
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="py-2 pr-4 font-bold">Project</th>
                <th className="py-2 pr-4 text-right font-bold">Hours</th>
                <th className="py-2 text-right font-bold">% of total</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-ink-soft">
                    No entries in this range.
                  </td>
                </tr>
              )}
              {projectRows.map((p) => (
                <Fragment key={p.projectId}>
                  <tr className="border-b border-line">
                    <td className="py-1.5 pr-4">{p.projectName}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{round2(p.hours)}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(p.hours)}%</td>
                  </tr>
                  {p.phases.map((ph) => (
                    <tr key={ph.phaseId} className="border-b border-line text-ink-soft">
                      <td className="py-1 pr-4 pl-4">{ph.phaseName}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{round2(ph.hours)}</td>
                      <td className="py-1 text-right tabular-nums">{pct(ph.hours)}%</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {activityRows.length > 0 && (
          <details className="group mb-8">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
              <ChevronRight
                className="h-4 w-4 text-ink-soft transition-transform duration-200 group-open:rotate-90"
                aria-hidden
              />
              Break down by activity
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <thead>
                  <tr className="border-b border-ink text-left">
                    <th className="py-2 pr-4 font-bold">Activity</th>
                    <th className="py-2 pr-4 text-right font-bold">Hours</th>
                    <th className="py-2 text-right font-bold">% of total</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((a) => (
                    <tr key={a.key} className="border-b border-line">
                      <td className="py-1.5 pr-4">{a.activityName}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{round2(a.hours)}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(a.hours)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {oosEntries.length > 0 && (
          <div className="mb-8 border border-line p-4">
            <p className="font-bold text-warn">Out-of-scope hours — your additional-services paper trail</p>
            <ul className="mt-2 flex flex-col gap-2">
              {oosEntries.map((e) => (
                <li key={e.id}>
                  <span className="font-bold">
                    {monthDayLabel(e.date)} · {e.projectName}
                    {e.phaseName ? ` — ${e.phaseName}` : ''} · {round2(e.hours)}h
                  </span>
                  {e.requestedBy && <span className="block text-ink-soft">Requested by: {e.requestedBy}</span>}
                  {e.notes && <span className="block text-ink-soft">{e.notes}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-8 border border-line p-4" data-tour="export">
          <p className="font-bold">Send your week</p>
          <p className="mb-3 text-ink-soft">
            Download your hours, then drop the file in your firm's shared folder or email it to your manager.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={doExportJson}
              className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
            >
              <Download className="h-4 w-4" aria-hidden /> Send to your manager
            </button>
            <button
              type="button"
              onClick={doExportCsv}
              className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
            >
              <Download className="h-4 w-4" aria-hidden /> Download spreadsheet
            </button>
          </div>
          {isExactWeek && (
            <p className="mt-3">{lastExportedAt ? `Last sent: ${formatDateTime(lastExportedAt)}` : 'Not sent yet.'}</p>
          )}
          <p className="mt-1 text-ink-soft">
            Edited a week you already sent? Send it again — your manager's copy won't update itself.
          </p>
        </div>
      </div>

      <div className="print-only">
        <div className="print-header">
          <p className="font-bold">{firm.firm.firmName}</p>
          <p>{me.name}</p>
          <p>{rangeLabel(start, end)}</p>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Phase</th>
              <th>Activity</th>
              <th>Hours</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entriesInRange.map((e) => (
              <tr key={e.id}>
                <td>{monthDayLabel(e.date)}</td>
                <td>{e.projectName}</td>
                <td>{e.phaseName ?? ''}</td>
                <td>{e.activityName ?? ''}</td>
                <td>{round2(e.hours)}</td>
                <td>{e.notes ?? ''}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4}>
                <strong>Total</strong>
              </td>
              <td>
                <strong>{round2(totalHours)}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
        <div className="print-signature">Employee signature: _______________________________ Date: _______________</div>
      </div>
    </div>
  );
}
