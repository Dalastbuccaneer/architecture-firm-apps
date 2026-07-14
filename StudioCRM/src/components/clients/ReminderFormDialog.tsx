// Add/edit one client reminder — label, due date, reminderDays lead-time
// (default 0, StudioHours' renewal convention — "surface this many days
// before dueDate"), and an optional link to one of this client's leads.
// Same one-dialog-two-jobs shape as StudioLog's ContactFormDialog.tsx
// (existing absent = Add, present = Edit) and the same Tailwind conventions
// as AddClientDialog.tsx/EditClientDialog.tsx.

import { useId, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus } from 'lucide-react';
import type { Reminder } from '../../types';
import { SCHEMA_VERSION } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';
import { nowISO, todayISO } from '../../lib/dates';

export default function ReminderFormDialog({
  clientId,
  existing,
}: {
  clientId: string;
  /** absent = Add, present = Edit */
  existing?: Reminder;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isEdit = !!existing;

  // This client's leads, for the optional "linked lead" select — queried live
  // so a lead added elsewhere while this dialog is open still shows up.
  const leads = useLiveQuery(() => db.leads.where('clientId').equals(clientId).toArray(), [clientId]);

  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderDays, setReminderDays] = useState(0);
  const [leadId, setLeadId] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setLabel(existing?.label ?? '');
    setDueDate(existing?.dueDate ?? todayISO());
    setReminderDays(existing?.reminderDays ?? 0);
    setLeadId(existing?.leadId ?? '');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const labelTrim = label.trim();
    if (!labelTrim || !dueDate) return; // native `required` already blocks this
    setBusy(true);
    try {
      const now = nowISO();
      if (isEdit && existing) {
        await db.reminders.update(existing.id, {
          label: labelTrim,
          dueDate,
          reminderDays,
          leadId: leadId || undefined,
          updatedAt: now,
        });
      } else {
        const reminder: Reminder = {
          schemaVersion: SCHEMA_VERSION,
          id: uid(),
          clientId,
          leadId: leadId || undefined,
          label: labelTrim,
          dueDate,
          reminderDays,
          done: false,
          createdAt: now,
          updatedAt: now,
        };
        await db.reminders.add(reminder);
      }
    } finally {
      setBusy(false);
    }
    closeDialog();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={isEdit ? `Edit reminder ${existing?.label}` : 'Add reminder'}
        className={
          isEdit
            ? 'flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink'
            : 'flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft'
        }
      >
        {isEdit ? (
          <>
            <Pencil className="h-4 w-4" aria-hidden /> Edit…
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden /> Add reminder
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-lg border border-line bg-paper p-6 text-ink backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <h2 id={titleId} className="font-bold">
            {isEdit ? 'Edit reminder' : 'Add reminder'}
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              placeholder="e.g. Chase for the signed fee proposal"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="h-12 w-48 cursor-pointer border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Remind me this many days before (optional)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={reminderDays}
              onChange={(e) => setReminderDays(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="h-12 w-28 border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Linked lead (optional)</span>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              <option value="">None</option>
              {(leads ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="min-h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isEdit ? 'Save' : 'Save reminder'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
