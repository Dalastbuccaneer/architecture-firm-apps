// Edit one task's title, due date, and notes. Adding stays inline on the
// Tasks tab (fast, no dialog) — this small dialog only exists for the rarer
// "fix the wording / move the date / add a detail" case.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import type { Task } from '../../types';
import { db } from '../../db';

export default function EditTaskDialog({ task }: { task: Task }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setTitle(task.title);
    setDue(task.due ?? '');
    setNotes(task.notes ?? '');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const titleTrim = title.trim();
    if (!titleTrim) return; // native `required` already blocks this
    setBusy(true);
    try {
      await db.tasks.update(task.id, {
        title: titleTrim,
        due: due || undefined,
        notes: notes.trim() || undefined,
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
        aria-label={`Edit task ${task.title}`}
        className="flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        <Pencil className="h-4 w-4" aria-hidden /> Edit…
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
            Edit task
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">What needs doing?</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Due (optional)</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any detail worth keeping with the task."
              className="h-12 w-full border border-line px-2"
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
