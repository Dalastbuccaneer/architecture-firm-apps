import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';
import { db } from '../db';
import { useApp } from '../AppContext';
import { entriesToCsv } from '../lib/serialize';
import { downloadText } from '../lib/download';
import ImportZone from '../components/dashboard/ImportZone';
import ImportLog from '../components/dashboard/ImportLog';
import RangePicker, { presetRange, type DateRange, type RangePreset } from '../components/dashboard/RangePicker';
import OverviewTab from '../components/dashboard/OverviewTab';
import FeeBurnTab from '../components/dashboard/FeeBurnTab';
import ByPersonTab from '../components/dashboard/ByPersonTab';
import AlertsTab from '../components/dashboard/AlertsTab';
import { inRange } from '../components/dashboard/metrics';

// The 'project' id predates the Fee Burn rename — keeping it means every
// existing selector (e2e, tab wiring) and mental model stays valid; only the
// user-facing label changed.
type Tab = 'overview' | 'project' | 'person' | 'alerts';
const TABS: Array<{ id: Tab; label: string; tour?: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'project', label: 'Fee Burn' },
  { id: 'person', label: 'By person' },
  { id: 'alerts', label: 'Alerts', tour: 'alerts-tab' },
];

function firmSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'firm';
}

export default function Dashboard() {
  const { firm, feeBurnProjectId, clearFeeBurnRequest } = useApp();
  const allEntries = useLiveQuery(() => db.entries.toArray(), []) ?? [];

  // A pending "View burn" cross-link (from Setup) opens straight onto Fee Burn
  // with that project selected; the request is consumed below so the next plain
  // Dashboard visit opens on Overview as usual.
  const [tab, setTab] = useState<Tab>(() => (feeBurnProjectId ? 'project' : 'overview'));
  // null = auto (the most recently worked-on project); survives tab switches.
  const [burnSelection, setBurnSelection] = useState<string | null>(feeBurnProjectId);
  useEffect(() => {
    if (feeBurnProjectId) clearFeeBurnRequest();
  }, [feeBurnProjectId, clearFeeBurnRequest]);

  const [preset, setPreset] = useState<RangePreset>('4weeks');
  const [range, setRange] = useState<DateRange>(() => presetRange('4weeks'));
  // Import panel: follows the data until the user overrides it — open when there's
  // nothing yet (so a new manager is guided to import), tucked away once data exists.
  const [importOpen, setImportOpen] = useState<boolean | null>(null);

  const rangeEntries = useMemo(
    () => allEntries.filter((e) => inRange(e.date, range.start, range.end)),
    [allEntries, range.start, range.end],
  );

  if (!firm) return null;

  const importExpanded = importOpen ?? allEntries.length === 0;

  const exportRollup = () => {
    const sorted = [...rangeEntries].sort((a, b) => a.date.localeCompare(b.date));
    const csv = entriesToCsv(sorted, firm);
    downloadText(`${firmSlug(firm.firm.firmName)}_rollup_${range.start}_${range.end}.csv`, csv, 'text/csv');
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-ink-soft">Your firm's hours at a glance. Import your team's timesheets each week to keep it current.</p>
      </div>

      {/* Import: collapsed once you have data so the dashboard opens on your numbers,
          not a big empty drop box. Children stay mounted (hidden) so a drop still works. */}
      <section className="border border-line">
        <button
          type="button"
          data-tour="import"
          onClick={() => setImportOpen(!importExpanded)}
          aria-expanded={importExpanded}
          className="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors duration-200 hover:bg-neutral-50"
        >
          <Upload className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          <span className="font-bold">Import timesheets</span>
          <span className="hidden text-ink-soft sm:inline">Drop your team's weekly files to update the numbers below</span>
          {importExpanded ? (
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          ) : (
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          )}
        </button>
        <div className={importExpanded ? 'flex flex-col gap-4 border-t border-line p-4' : 'hidden'}>
          <ImportZone onActivity={() => setImportOpen(true)} />
          <ImportLog />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <RangePicker
          preset={preset}
          range={range}
          onPreset={(p) => {
            setPreset(p);
            setRange(presetRange(p));
          }}
          onCustom={(r) => {
            setPreset('custom');
            setRange(r);
          }}
        />
        <div className="flex flex-col items-end gap-1" data-tour="rollup">
          <button
            type="button"
            onClick={exportRollup}
            disabled={rangeEntries.length === 0}
            className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:border-line disabled:text-ink-soft"
          >
            <Download className="h-4 w-4" aria-hidden /> Export for bookkeeper
          </button>
          <span className="text-ink-soft">
            {rangeEntries.length === 0
              ? 'No hours in this range yet.'
              : 'A spreadsheet of these hours for QuickBooks.'}
          </span>
        </div>
      </div>

      {rangeEntries.length === 0 && allEntries.length > 0 && (
        <p role="status" className="border border-warn bg-neutral-50 p-3">
          You have {allEntries.length} logged {allEntries.length === 1 ? 'entry' : 'entries'}, but none fall in this date
          range — widen the range above to see them.
        </p>
      )}

      <div>
        <div className="flex flex-wrap gap-6 border-b border-line" role="tablist" aria-label="Dashboard views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="dashboard-panel"
              data-tour={t.tour}
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-11 cursor-pointer items-center border-b-2 pb-2 transition-colors duration-200 ${
                tab === t.id ? 'border-ink font-bold' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-6" id="dashboard-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'overview' && <OverviewTab firm={firm} entries={rangeEntries} range={range} />}
          {tab === 'project' && (
            <FeeBurnTab firm={firm} allEntries={allEntries} selectedId={burnSelection} onSelect={setBurnSelection} />
          )}
          {tab === 'person' && <ByPersonTab firm={firm} entries={rangeEntries} range={range} />}
          {tab === 'alerts' && <AlertsTab firm={firm} allEntries={allEntries} rangeEntries={rangeEntries} range={range} />}
        </div>
      </div>
    </div>
  );
}
