// "Edit project…" — rename, number, client, start date, and status. Status
// options spell out what each one means in plain words; closing or holding a
// project never deletes anything, it just moves the row to that group.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import type { Project, ProjectStatus } from '../../types';
import { patchProject } from '../../db';

export default function EditProjectDialog({ project }: { project: Project }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(project.projectName);
  const [number, setNumber] = useState(project.projectNumber ?? '');
  const [client, setClient] = useState(project.clientName ?? '');
  const [startDate, setStartDate] = useState(project.startDate ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setName(project.projectName);
    setNumber(project.projectNumber ?? '');
    setClient(project.clientName ?? '');
    setStartDate(project.startDate ?? '');
    setStatus(project.status);
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
      await patchProject(project.projectId, {
        projectName: trimmed,
        projectNumber: number.trim() || undefined,
        clientName: client.trim() || undefined,
        startDate: startDate || undefined,
        status,
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
        className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
      >
        <Pencil className="h-4 w-4" aria-hidden /> Edit project…
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
          <h2 id={titleId} className="font-bold">Edit project</h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Project name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 w-full border border-line px-2"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Number</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="h-11 w-32 border border-line px-2"
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-ink-soft">Client</span>
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="h-11 w-full border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-48 cursor-pointer border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="h-11 w-full cursor-pointer border border-line px-2"
            >
              <option value="active">Active — being worked on</option>
              <option value="on_hold">On hold — paused for now, stays in your list</option>
              <option value="closed">Closed — finished or archived, kept for the record</option>
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
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
