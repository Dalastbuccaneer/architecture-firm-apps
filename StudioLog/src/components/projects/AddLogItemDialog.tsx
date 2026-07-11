// "Add to log" — one native dialog covering every log-item field. Every new
// item starts status 'open'; dateRaised defaults to today.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { LogItem, LogItemType } from '../../types';
import { SCHEMA_VERSION, LOG_ITEM_TYPE_LABEL } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';
import { nowISO, todayISO } from '../../lib/dates';

const ALL_TYPES = Object.keys(LOG_ITEM_TYPE_LABEL) as LogItemType[];

export default function AddLogItemDialog({ projectId }: { projectId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [type, setType] = useState<LogItemType>('rfi');
  const [ref, setRef] = useState('');
  const [party, setParty] = useState('');
  const [subject, setSubject] = useState('');
  const [dateRaised, setDateRaised] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setType('rfi');
    setRef('');
    setParty('');
    setSubject('');
    setDateRaised(todayISO());
    setDueDate('');
    setNotes('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const partyTrim = party.trim();
    const subjectTrim = subject.trim();
    if (!partyTrim || !subjectTrim || !dateRaised) return; // native `required` already blocks this
    setBusy(true);
    try {
      const now = nowISO();
      const item: LogItem = {
        schemaVersion: SCHEMA_VERSION,
        id: uid(),
        projectId,
        type,
        ref: ref.trim() || undefined,
        party: partyTrim,
        subject: subjectTrim,
        dateRaised,
        dueDate: dueDate || undefined,
        status: 'open',
        notes: notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db.logItems.add(item);
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
        className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add to log
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
            Add to log
          </h2>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LogItemType)}
                className="h-11 w-44 cursor-pointer border border-line px-2"
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LOG_ITEM_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Reference (optional)</span>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="e.g. RFI-03"
                className="h-11 w-36 border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Who is it with?</span>
            <input
              value={party}
              onChange={(e) => setParty(e.target.value)}
              required
              placeholder="e.g. Structural engineer, City planning, The client"
              className="h-11 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="What is this about?"
              className="h-11 w-full border border-line px-2"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Date raised</span>
              <input
                type="date"
                value={dateRaised}
                onChange={(e) => setDateRaised(e.target.value)}
                required
                className="h-11 w-48 cursor-pointer border border-line px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Due date (optional)</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 w-48 cursor-pointer border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 w-full border border-line px-2"
            />
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
              Save to log
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
