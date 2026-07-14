// Today — StudioCRM's one-glance triage screen: "what follow-up needs me
// today?" Unlike StudioLog's Today (four cards spanning projects/tasks/
// notes), this app has exactly one thing worth checking daily — reminders
// due or overdue — so there is exactly one card, "Follow-ups due". All
// selection/sort logic is pure in lib/reminders.ts (dueRemindersToday); this
// screen only renders it. Three states, same rule as StudioLog's
// src/screens/Today.tsx: a first-run pointer when there are no clients at
// all, a calm all-clear when clients exist but nothing is due, and the
// populated list otherwise. Never a wall of zeros, never a fake alert.

import { useLiveQuery } from 'dexie-react-hooks';
import { TriangleAlert } from 'lucide-react';
import { db } from '../db';
import { useApp } from '../AppContext';
import { dueRemindersToday, reminderStatus, reminderStatusWords } from '../lib/reminders';
import { todayISO, todayHeadingLabel } from '../lib/dates';
import type { Reminder } from '../types';
import EmptyState from '../components/EmptyState';

/** One "Follow-ups due" row — client + (lead, if this reminder is tied to a
 *  specific opportunity) + the reminder's own label + its status words
 *  (never color alone). The whole row is the click target; it hands off to
 *  AppContext's openClient so Today never has to know how Clients renders. */
function FollowUpRow({
  reminder,
  clientName,
  leadTitle,
  today,
  onOpen,
}: {
  reminder: Reminder;
  clientName: string;
  leadTitle: string | undefined;
  today: string;
  onOpen: () => void;
}) {
  const status = reminderStatus(reminder.dueDate, reminder.reminderDays, today);
  const words = reminderStatusWords(status);
  const overdue = status.state === 'overdue';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${clientName}'s reminders`}
        className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left transition-colors duration-200 hover:bg-neutral-50"
      >
        <span className="min-w-0 flex-1">
          <span className="font-bold">{clientName}</span>
          {leadTitle && <span className="text-ink-soft"> · {leadTitle}</span>}
          <span className="block text-ink-soft">{reminder.label}</span>
        </span>
        <span
          className={`flex shrink-0 items-center gap-1.5 font-bold ${overdue ? 'text-alert' : 'text-warn'}`}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {words}
        </span>
      </button>
    </li>
  );
}

export default function Today() {
  const { setView, openClient } = useApp();
  const clients = useLiveQuery(() => db.clients.toArray(), []);
  const leads = useLiveQuery(() => db.leads.toArray(), []);
  const reminders = useLiveQuery(() => db.reminders.toArray(), []);

  if (clients === undefined || leads === undefined || reminders === undefined) return null; // still loading IndexedDB

  const today = todayISO();
  const due = dueRemindersToday(reminders, today);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const leadById = new Map(leads.map((l) => [l.id, l]));

  return (
    <div>
      <h1 className="text-2xl font-bold">Today</h1>
      <p className="mt-1 text-ink-soft">{todayHeadingLabel(today)}</p>

      {clients.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing to watch yet"
            hint="Add your first client on the Clients tab — follow-ups you set for them will show up here."
            action={
              <button
                type="button"
                onClick={() => setView('clients')}
                className="min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
              >
                Go to Clients
              </button>
            }
          />
        </div>
      ) : due.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing needs a follow-up today."
            hint="Reminders you set on a client's Reminders tab will show up here once they're due or overdue."
          />
        </div>
      ) : (
        <div className="mt-6">
          <section data-tour="followups-card" className="border border-line p-4">
            <h2 className="mb-1 flex items-center gap-2 font-bold">
              <TriangleAlert className="h-4 w-4" aria-hidden /> Follow-ups due
            </h2>
            <p className="mb-3 text-ink-soft">Worst first. Click one to open that client's Reminders tab.</p>
            <ul className="flex flex-col divide-y divide-line">
              {due.map((r) => (
                <FollowUpRow
                  key={r.id}
                  reminder={r}
                  clientName={clientById.get(r.clientId)?.name ?? 'Unknown client'}
                  leadTitle={r.leadId ? leadById.get(r.leadId)?.title : undefined}
                  today={today}
                  onOpen={() => openClient(r.clientId, 'reminders')}
                />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
