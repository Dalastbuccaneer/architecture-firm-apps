// Add/Edit a drawing-register row. One dialog handles both: `existing` absent
// = Add (status starts not_started, sortKey = max+1), `existing` present =
// Edit (status included, so this is also how a row gets marked Superseded —
// see DeliverablesTab). Rev is free text, no scheme enforced.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { Deliverable, DeliverableStatus, Project } from '../../types';
import { SCHEMA_VERSION, DELIVERABLE_STATUS_LABEL } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';
import { nowISO } from '../../lib/dates';

export default function DeliverableFormDialog({
  project,
  existing,
  deliverables,
}: {
  project: Project;
  existing?: Deliverable;
  /** all deliverables currently loaded for this project — used to compute the
   *  next sortKey on Add; irrelevant on Edit. */
  deliverables: Deliverable[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isEdit = !!existing;

  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [stageIndex, setStageIndex] = useState<string>('');
  const [discipline, setDiscipline] = useState('');
  const [scale, setScale] = useState('');
  const [size, setSize] = useState('');
  const [currentRev, setCurrentRev] = useState('P01');
  const [status, setStatus] = useState<DeliverableStatus>('not_started');
  const [busy, setBusy] = useState(false);

  const orderedStages = [...project.stages].sort((a, b) => a.stageIndex - b.stageIndex);

  const openDialog = () => {
    setNumber(existing?.number ?? '');
    setTitle(existing?.title ?? '');
    setStageIndex(existing?.stageIndex !== undefined ? String(existing.stageIndex) : '');
    setDiscipline(existing?.discipline ?? '');
    setScale(existing?.scale ?? '');
    setSize(existing?.size ?? '');
    setCurrentRev(existing?.currentRev ?? 'P01');
    setStatus(existing?.status ?? 'not_started');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const numberTrim = number.trim();
    const titleTrim = title.trim();
    if (!numberTrim || !titleTrim) return; // native `required` already blocks this
    setBusy(true);
    try {
      const patch = {
        number: numberTrim,
        title: titleTrim,
        stageIndex: stageIndex === '' ? undefined : Number(stageIndex),
        discipline: discipline.trim() || undefined,
        scale: scale.trim() || undefined,
        size: size.trim() || undefined,
        currentRev: currentRev.trim() || 'P01',
      };
      if (isEdit && existing) {
        await db.deliverables.update(existing.id, { ...patch, status, updatedAt: nowISO() });
      } else {
        const nextSortKey = deliverables.reduce((max, d) => Math.max(max, d.sortKey), -1) + 1;
        const now = nowISO();
        const created: Deliverable = {
          schemaVersion: SCHEMA_VERSION,
          id: uid(),
          projectId: project.projectId,
          ...patch,
          status: 'not_started',
          issues: [],
          sortKey: nextSortKey,
          createdAt: now,
          updatedAt: now,
        };
        await db.deliverables.add(created);
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
        aria-label={isEdit ? `Edit ${existing?.number} ${existing?.title}` : 'Add drawing'}
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
            <Plus className="h-4 w-4" aria-hidden /> Add drawing
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
            {isEdit ? 'Edit drawing' : 'Add drawing'}
          </h2>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Number</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
                placeholder="e.g. A-101"
                className="h-11 w-36 border border-line px-2"
              />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-ink-soft">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Ground Floor Plan"
                className="h-11 w-full border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Stage (optional)</span>
            <select
              value={stageIndex}
              onChange={(e) => setStageIndex(e.target.value)}
              className="h-11 w-full cursor-pointer border border-line px-2"
            >
              <option value="">No stage</option>
              {orderedStages.map((s) => (
                <option key={s.stageIndex} value={s.stageIndex}>
                  {s.code ? `${s.code} — ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Discipline (optional)</span>
              <input
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                placeholder="e.g. A, S, MEP"
                className="h-11 w-32 border border-line px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Scale (optional)</span>
              <input
                value={scale}
                onChange={(e) => setScale(e.target.value)}
                placeholder="e.g. 1:100"
                className="h-11 w-28 border border-line px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Sheet size (optional)</span>
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. A1"
                className="h-11 w-28 border border-line px-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Current revision</span>
            <input
              value={currentRev}
              onChange={(e) => setCurrentRev(e.target.value)}
              placeholder="e.g. P01"
              className="h-11 w-32 border border-line px-2"
            />
            <span className="text-ink-soft">Free text — use whatever revision scheme this project follows.</span>
          </label>

          {isEdit && (
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DeliverableStatus)}
                className="h-11 w-full cursor-pointer border border-line px-2"
              >
                {(Object.keys(DELIVERABLE_STATUS_LABEL) as DeliverableStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {DELIVERABLE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          )}

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
              {isEdit ? 'Save' : 'Create drawing'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
