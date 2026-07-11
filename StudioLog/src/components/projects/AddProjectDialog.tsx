// "Add project" — a native <dialog> with four plain fields. On create the
// caller usually jumps straight to the new project's page so "Prefill stages…"
// is the natural next step. (Dialog conventions ported from StudioHours.)

import { useId, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { db } from '../../db';
import { SCHEMA_VERSION, type Project } from '../../types';
import { uid } from '../../lib/ids';
import { nowISO } from '../../lib/dates';

export default function AddProjectDialog({
  onCreated,
  variant = 'primary',
}: {
  onCreated: (projectId: string) => void;
  variant?: 'primary' | 'plain';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [client, setClient] = useState('');
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setName('');
    setNumber('');
    setClient('');
    setStartDate('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return; // native `required` already blocks this
    setBusy(true);
    try {
      const project: Project = {
        schemaVersion: SCHEMA_VERSION,
        projectId: uid(),
        projectName: trimmed,
        projectNumber: number.trim() || undefined,
        clientName: client.trim() || undefined,
        status: 'active',
        startDate: startDate || undefined,
        stages: [],
        links: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      await db.projects.add(project);
      closeDialog();
      onCreated(project.projectId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={
          variant === 'primary'
            ? 'flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft'
            : 'flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink'
        }
      >
        <Plus className="h-4 w-4" aria-hidden /> Add project
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
            <h2 id={titleId} className="font-bold">Add project</h2>
            <p className="mt-1 text-ink-soft">Only the name is required — everything can be changed later.</p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Project name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Maple House"
              className="h-11 w-full border border-line px-2"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Number (optional)</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g. 2601"
                className="h-11 w-32 border border-line px-2"
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-ink-soft">Client (optional)</span>
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="h-11 w-full border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Start date (optional)</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-48 cursor-pointer border border-line px-2"
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
              Create project
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
