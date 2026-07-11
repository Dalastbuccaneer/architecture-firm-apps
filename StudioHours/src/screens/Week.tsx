// Week — the staff home. Two sub-tabs, mirroring the Dashboard's tab pattern:
// "This week" (the timesheet grid, always the default) and "My reports" (the
// date-range summaries + the Friday send-to-manager export). Landing on Week
// shows the grid immediately, so logging hours costs zero extra clicks.
import { useState } from 'react';
import WeekGrid from './WeekGrid';
import MyReports from './MyReports';

type Tab = 'grid' | 'reports';
const TABS: Array<{ id: Tab; label: string; tour?: string }> = [
  { id: 'grid', label: 'This week' },
  { id: 'reports', label: 'My reports', tour: 'week-tab-reports' },
];

export default function Week() {
  const [tab, setTab] = useState<Tab>('grid');

  return (
    <div>
      {/* print:hidden — My reports has its own print layout; the tab row must not print */}
      <div className="flex flex-wrap gap-6 border-b border-line print:hidden" role="tablist" aria-label="Week views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-week-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="week-panel"
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
      <div className="pt-6" id="week-panel" role="tabpanel" aria-labelledby={`tab-week-${tab}`} tabIndex={0}>
        {tab === 'grid' ? <WeekGrid /> : <MyReports />}
      </div>
    </div>
  );
}
