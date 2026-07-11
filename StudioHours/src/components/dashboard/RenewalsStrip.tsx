// "Coming up for renewal" — the Dashboard Overview's expiry-date strip, the
// same job the receivables strip does for unpaid invoices: what needs a call
// this month, at a glance. Shows only items inside their remind-ahead window
// (or overdue), most urgent first, capped at five with an "and N more" link
// into People → Renewals. Renders NOTHING when nothing is due — Overview stays
// about the numbers. Gated by the app-wide manager rule (lib/access.ts): staff
// opening the Dashboard never see it, matching the People sub-tab gate.

import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { db } from '../../db';
import { useApp } from '../../AppContext';
import { managerAccess } from '../../lib/access';
import { dueRenewalRows, renewalRows, renewalStatusWords } from '../../lib/hr';
import { todayISO } from '../../lib/dates';

const MAX_SHOWN = 5;

export default function RenewalsStrip() {
  const { firm, me, openPeopleRenewals } = useApp();
  const renewals = useLiveQuery(() => db.renewals.toArray(), []) ?? [];
  const hrRecords = useLiveQuery(() => db.hr.toArray(), []) ?? [];

  if (!firm || !managerAccess(firm, me)) return null;

  const peopleById = new Map(firm.people.map((p) => [p.personId, p.name]));
  const due = dueRenewalRows(renewalRows(renewals, hrRecords, peopleById, todayISO()));
  if (due.length === 0) return null;

  const shown = due.slice(0, MAX_SHOWN);
  const more = due.length - shown.length;

  return (
    <section aria-label="Coming up for renewal" className="border border-line">
      <p className="flex items-center gap-2 border-b border-line p-3">
        <CalendarClock className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
        <span className="font-bold">Coming up for renewal</span>
      </p>
      <ul className="flex flex-col">
        {shown.map((row) => {
          const overdue = row.status.state === 'overdue';
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-0 border-b border-line px-3 py-2 last:border-b-0">
              <TriangleAlert className={`h-4 w-4 shrink-0 ${overdue ? 'text-alert' : 'text-warn'}`} aria-hidden />
              <span className="font-bold">{row.label || '(unnamed)'}</span>
              <span className="text-ink-soft">— {row.whoLabel} —</span>
              <span className={`font-bold ${overdue ? 'text-alert' : 'text-warn'}`}>{renewalStatusWords(row.status)}</span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={openPeopleRenewals}
        className="flex min-h-11 w-full cursor-pointer items-center px-3 py-2 text-left underline-offset-4 transition-colors duration-200 hover:bg-neutral-50 hover:underline"
      >
        {more > 0 ? `and ${more} more — open People → Renewals` : 'Open People → Renewals'}
      </button>
    </section>
  );
}
