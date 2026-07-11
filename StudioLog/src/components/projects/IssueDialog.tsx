// "Issue…" — the core drawing-register workflow: record that a revision went
// out. Prefills the new-rev field with a GENTLE suggestion (bump a trailing
// number by one, e.g. "P01" -> "P02") but never invents a scheme — a rev with
// no trailing digits prefills unchanged, and the user can always type
// whatever they want. On confirm: currentRev updates, a DeliverableIssue is
// appended to history (newest shown first), and status becomes 'issued'.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import type { Deliverable, DeliverableIssue, IssuePurpose } from '../../types';
import { ISSUE_PURPOSE_LABEL } from '../../types';
import { db } from '../../db';
import { nowISO, todayISO } from '../../lib/dates';

/** Bump a trailing run of digits by one, preserving zero-padding — "P01" ->
 *  "P02", "Rev9" -> "Rev10". Leaves the string alone if it has no trailing
 *  digits, so it never guesses a scheme it can't see. */
export function suggestNextRev(rev: string): string {
  const m = rev.match(/^(.*?)(\d+)$/);
  if (!m) return rev;
  const [, prefix, digits] = m;
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${next}`;
}

export default function IssueDialog({ deliverable }: { deliverable: Deliverable }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [rev, setRev] = useState('');
  const [date, setDate] = useState('');
  const [purpose, setPurpose] = useState<IssuePurpose>('information');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setRev(suggestNextRev(deliverable.currentRev));
    setDate(todayISO());
    setPurpose('information');
    setNotes('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const revTrim = rev.trim();
    if (!revTrim || !date) return; // native `required` already blocks this
    setBusy(true);
    try {
      const issue: DeliverableIssue = { rev: revTrim, date, purpose, notes: notes.trim() || undefined };
      await db.deliverables.update(deliverable.id, {
        currentRev: revTrim,
        status: 'issued',
        issues: [...deliverable.issues, issue],
        updatedAt: nowISO(),
      });
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
        aria-label={`Issue ${deliverable.number} ${deliverable.title}`}
        className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-3 py-1 transition-colors duration-200 hover:border-ink"
      >
        <Send className="h-4 w-4" aria-hidden /> Issue…
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
          <div>
            <h2 id={titleId} className="font-bold">
              Issue {deliverable.number}
            </h2>
            <p className="mt-1 text-ink-soft">
              Current revision {deliverable.currentRev || '—'}. Recording a new issue updates the revision and adds
              to this drawing's history.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">New revision</span>
              <input
                value={rev}
                onChange={(e) => setRev(e.target.value)}
                required
                className="h-11 w-32 border border-line px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Issue date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="h-11 w-48 cursor-pointer border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Purpose</span>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as IssuePurpose)}
              className="h-11 w-full cursor-pointer border border-line px-2"
            >
              {(Object.keys(ISSUE_PURPOSE_LABEL) as IssuePurpose[]).map((p) => (
                <option key={p} value={p}>
                  {ISSUE_PURPOSE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Issued to structural engineer for coordination"
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
              Record issue
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
