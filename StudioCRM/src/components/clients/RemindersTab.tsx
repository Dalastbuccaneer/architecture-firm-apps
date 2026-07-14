// Client -> Reminders: this client's follow-ups. Status (icon + color +
// words, color never alone) comes from reminderStatus/reminderStatusWords in
// lib/reminders.ts — adapted from StudioHours' renewals register
// (hr.ts ~207-317: dueDate+reminderDays instead of expiryDate) — so this tab
// and the future Today screen share one source of truth. List/checkbox/done-
// collapse layout is StudioLog's TasksTab.tsx pattern exactly: open reminders
// above, done ones folded into a "Done (N)" <details>. reminders.done is a
// boolean, so we .filter() in memory — never .where('done') (booleans aren't
// valid IndexedDB keys, see db.ts).

import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { Client, Reminder } from '../../types';
import { db } from '../../db';
import { fullDateLabel, nowISO, todayISO } from '../../lib/dates';
// NOTE: lib/reminders.ts is written in a later ("Pipeline") phase — it's
// guaranteed to export reminderStatus/reminderStatusWords with this shape by
// the time this tab ships.
import { reminderStatus, reminderStatusWords } from '../../lib/reminders';
import EmptyState from '../EmptyState';
import ReminderFormDialog from './ReminderFormDialog';

function StatusBadge({ status }: { status: ReturnType<typeof reminderStatus> }) {
  const words = reminderStatusWords(status);
  if (status.state === 'overdue') {
    return (
      <span className="flex items-center gap-1.5 font-bold text-alert">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {words}
      </span>
    );
  }
  if (status.state === 'due') {
    return (
      <span className="flex items-center gap-1.5 font-bold text-warn">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {words}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-ok">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {words}
    </span>
  );
}

function ReminderRow({ reminder, today }: { reminder: Reminder; today: string }) {
  const status = reminderStatus(reminder.dueDate, reminder.reminderDays, today);

  const onToggle = (checked: boolean) => {
    void db.reminders.update(
      reminder.id,
      checked
        ? { done: true, doneAt: nowISO(), updatedAt: nowISO() }
        : { done: false, doneAt: undefined, updatedAt: nowISO() },
    );
  };

  const onDelete = () => {
    if (!window.confirm(`Delete the reminder "${reminder.label}"?`)) return;
    void db.reminders.delete(reminder.id);
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line p-2">
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={reminder.done}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={reminder.done ? `Mark "${reminder.label}" not done` : `Mark "${reminder.label}" done`}
          className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
        />
        <span className="min-w-0">
          <span className={reminder.done ? 'text-ink-soft line-through' : ''}>{reminder.label}</span>
          <span className="block text-ink-soft">{fullDateLabel(reminder.dueDate)}</span>
        </span>
      </label>

      {!reminder.done && <StatusBadge status={status} />}

      <div className="flex items-center gap-1">
        <ReminderFormDialog clientId={reminder.clientId} existing={reminder} />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete reminder ${reminder.label}`}
          className="min-h-11 cursor-pointer px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
        >
          Delete…
        </button>
      </div>
    </li>
  );
}

export default function RemindersTab({ client }: { client: Client }) {
  const reminders = useLiveQuery(
    () => db.reminders.where('clientId').equals(client.id).toArray(),
    [client.id],
  );

  if (reminders === undefined) return null;

  const today = todayISO();
  // booleans can't be indexed — filter in memory (see db.ts).
  const openReminders = reminders
    .filter((r) => !r.done)
    .sort((a, b) => {
      const aDays = reminderStatus(a.dueDate, a.reminderDays, today).days;
      const bDays = reminderStatus(b.dueDate, b.reminderDays, today).days;
      return aDays - bDays;
    });
  const doneReminders = reminders
    .filter((r) => r.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">Follow-ups tied to this client — nudge yourself before a next step slips.</p>
        <ReminderFormDialog clientId={client.id} />
      </div>

      {reminders.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No reminders yet"
            hint="Add a follow-up so the next step with this client never gets lost."
          />
        </div>
      ) : (
        <>
          {openReminders.length === 0 ? (
            <p className="mt-4">Nothing due here — every follow-up is ticked off.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {openReminders.map((r) => (
                <ReminderRow key={r.id} reminder={r} today={today} />
              ))}
            </ul>
          )}

          {doneReminders.length > 0 && (
            <details data-e2e="done-reminders" className="mt-4">
              <summary className="flex min-h-11 cursor-pointer items-center font-bold">
                Done ({doneReminders.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {doneReminders.map((r) => (
                  <ReminderRow key={r.id} reminder={r} today={today} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
