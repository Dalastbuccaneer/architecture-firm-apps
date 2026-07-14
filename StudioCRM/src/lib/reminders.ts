// Pure logic behind follow-up reminders — no Dexie, no React, so it is
// unit-testable straight from Node (see test-reminders.mjs at the repo root).
// Ported from StudioHours' renewals math (src/lib/hr.ts, renewals section):
// renewalStatus/renewalStatusWords renamed onto Reminder objects — `dueDate`
// instead of `expiryDate`, same `reminderDays` meaning (start surfacing this
// many days before the date). The firm/person-scope register machinery
// (RenewalRow, whoLabel, surfaced person documents) is dropped entirely:
// every StudioCRM reminder already belongs to a client.
//
// The './dates.ts' import carries its extension on purpose: Node's native
// type-stripping (which runs the unit test) resolves relative .ts imports only
// when they are explicit. Vite and tsc both accept it (allowImportingTsExtensions).

import type { Reminder } from '../types';
import { daysBetween } from './dates.ts';

export type ReminderState = 'ok' | 'due' | 'overdue';

export interface ReminderStatus {
  state: ReminderState;
  /** whole days until the due date — negative once past */
  days: number;
}

/** Where one reminder stands today. Same boundary math as StudioHours'
 *  renewalStatus: strictly past the due date is overdue; on the due date or
 *  within the `reminderDays` lead-time window is due; anything further out is
 *  ok. `reminderDays` of 0 means "surface on the day itself". */
export function reminderStatus(dueDate: string, reminderDays: number, today: string): ReminderStatus {
  const days = daysBetween(today, dueDate);
  if (days < 0) return { state: 'overdue', days };
  if (days <= reminderDays) return { state: 'due', days };
  return { state: 'ok', days };
}

/** The row's words — always present beside the icon and color, never color
 *  alone: "OK" / "Due today" / "Due in N days" / "OVERDUE by N days". */
export function reminderStatusWords(status: ReminderStatus): string {
  if (status.state === 'overdue') {
    const n = -status.days;
    return `OVERDUE by ${n} ${n === 1 ? 'day' : 'days'}`;
  }
  if (status.state === 'due') {
    if (status.days === 0) return 'Due today';
    return `Due in ${status.days} ${status.days === 1 ? 'day' : 'days'}`;
  }
  return 'OK';
}

/** The reminders worth interrupting someone for — not done, and overdue or
 *  inside their reminder window — most overdue first (`status.days` ascending;
 *  ties, i.e. same due date, by label then id so the order is stable). Feeds
 *  the Today screen's "Follow-ups due" card. */
export function dueRemindersToday(reminders: Reminder[], today: string): Reminder[] {
  return reminders
    .filter((r) => !r.done && reminderStatus(r.dueDate, r.reminderDays, today).state !== 'ok')
    .sort(
      (a, b) =>
        reminderStatus(a.dueDate, a.reminderDays, today).days -
          reminderStatus(b.dueDate, b.reminderDays, today).days ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
}
