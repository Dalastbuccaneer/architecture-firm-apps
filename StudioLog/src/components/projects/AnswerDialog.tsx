// "Mark answered" — one small dialog: an optional answer text, then status
// flips to 'answered' (which also clears the overdue highlight, since only
// OPEN items can be overdue — see lib/deadlines.ts).

import { useId, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { LogItem } from '../../types';
import { db } from '../../db';
import { nowISO } from '../../lib/dates';

export default function AnswerDialog({ item }: { item: LogItem }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setAnswer(item.answer ?? '');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await db.logItems.update(item.id, {
        status: 'answered',
        answer: answer.trim() || undefined,
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
        className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-3 py-1 transition-colors duration-200 hover:border-ink"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark answered
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
            Mark answered
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">What was the answer? (optional)</span>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus
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
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
