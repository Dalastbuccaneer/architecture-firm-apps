// "Prefill stages…" — appends a standard set of stages to one project in one
// click. Append-only by design: existing stages are never touched, and the
// dialog warns in plain language before adding on top of a project that
// already has stages. Ported from StudioHours, retargeted: StudioLog stages
// carry no fees, so there is no fee input and no split math — codes + names
// land as pending stages with no dates.

import { useId, useRef, useState, type FormEvent } from 'react';
import { LayoutTemplate } from 'lucide-react';
import type { Project, Stage } from '../../types';
import { patchProject } from '../../db';
import { STAGE_TEMPLATES } from '../../lib/stageTemplates';

export default function PrefillStagesDialog({ project }: { project: Project }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [templateId, setTemplateId] = useState(STAGE_TEMPLATES[0].id);
  const [busy, setBusy] = useState(false);

  const template = STAGE_TEMPLATES.find((t) => t.id === templateId) ?? STAGE_TEMPLATES[0];
  const existingCount = project.stages.length;

  const openDialog = () => {
    setTemplateId(STAGE_TEMPLATES[0].id);
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (existingCount > 0) {
      const sure = window.confirm(
        `This project already has ${existingCount} stage${existingCount === 1 ? '' : 's'} — this adds ${template.stages.length} more. Add them anyway?`,
      );
      if (!sure) return;
    }

    setBusy(true);
    try {
      // stageIndex is a stable per-project sequence — always continue from the
      // highest ever used, never reuse a removed stage's number (see types.ts).
      const start = project.stages.reduce((max, s) => Math.max(max, s.stageIndex), -1) + 1;
      const added: Stage[] = template.stages.map((ts, i) => ({
        stageIndex: start + i,
        code: ts.code,
        name: ts.name,
        status: 'pending',
      }));
      await patchProject(project.projectId, { stages: [...project.stages, ...added] });
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
        <LayoutTemplate className="h-4 w-4" aria-hidden /> Prefill stages…
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
              Prefill stages{project.projectName ? ` for ${project.projectName}` : ''}
            </h2>
            <p className="mt-1 text-ink-soft">
              Pick a stage set — every stage lands as a plain, editable row with no dates yet.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-ink-soft">Template</legend>
            {STAGE_TEMPLATES.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer flex-col gap-1 border p-3 ${templateId === t.id ? 'border-ink' : 'border-line'}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="stage-template"
                    value={t.id}
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                    className="h-4 w-4 cursor-pointer accent-ink"
                  />
                  <span className="font-bold">{t.label}</span>
                  <span className="text-ink-soft">({t.stages.length} stages)</span>
                </span>
                <span className="pl-6 text-ink-soft">{t.description}</span>
              </label>
            ))}
          </fieldset>

          {existingCount > 0 && (
            <p className="border border-warn bg-neutral-50 p-3">
              This project already has {existingCount} stage{existingCount === 1 ? '' : 's'} — this adds{' '}
              {template.stages.length} more. Nothing existing is changed or removed.
            </p>
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
              Add stages
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
