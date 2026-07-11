// "Prefill stages…" — appends a standard set of phases to one project in one
// click, so a project won in ArchOS can be typed into Studio Hours in a few
// minutes instead of hand-adding each phase. Append-only by design: existing
// phases are never touched, and the dialog warns in plain language before
// adding on top of a project that already has phases. See lib/stageTemplates
// for the presets and the fee-split math.
import { useRef, useState, type FormEvent } from 'react';
import { LayoutTemplate } from 'lucide-react';
import type { Phase, Project } from '../../types';
import type { FirmUpdater } from './types';
import { STAGE_TEMPLATES, splitFeeByWeight } from '../../lib/stageTemplates';
import { uid } from '../../lib/seeds';
import { numOrNull } from './numUtils';

export default function PrefillStagesDialog({ project, update }: { project: Project; update: FirmUpdater }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [templateId, setTemplateId] = useState(STAGE_TEMPLATES[0].id);
  const [feeText, setFeeText] = useState('');
  const [busy, setBusy] = useState(false);

  const template = STAGE_TEMPLATES.find((t) => t.id === templateId) ?? STAGE_TEMPLATES[0];
  const existingCount = project.phases.length;

  const openDialog = () => {
    setTemplateId(STAGE_TEMPLATES[0].id);
    setFeeText('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (existingCount > 0) {
      const sure = window.confirm(
        `This project already has ${existingCount} stage${existingCount === 1 ? '' : 's'} — this adds ${template.phases.length} more. Add them anyway?`,
      );
      if (!sure) return;
    }

    // The input's min={0} only blocks the spinner — a typed "-100" still
    // parses, and negative stage fees are never meaningful here.
    const parsedFee = numOrNull(feeText, null);
    const totalFee = parsedFee !== null && parsedFee < 0 ? null : parsedFee;
    const fees = totalFee !== null ? splitFeeByWeight(totalFee, template.phases.map((p) => p.weightPct)) : null;

    setBusy(true);
    try {
      await update((draft) => {
        const p = draft.projects.find((x) => x.projectId === project.projectId);
        if (!p) return;
        const startSeq = p.phases.reduce((max, ph) => Math.max(max, ph.sequence), 0);
        template.phases.forEach((tp, i) => {
          const phase: Phase = {
            phaseId: uid(),
            name: tp.name,
            aiaCode: tp.code,
            sequence: startSeq + i + 1,
            budgetedHours: null,
            budgetedFee: fees ? fees[i] : null,
            billableDefault: true,
            status: 'open',
          };
          p.phases.push(phase);
        });
        // Fill the project's own fee only if it doesn't have one yet — never overwrite a typed-in value.
        if (totalFee !== null && p.fee === null) p.fee = totalFee;
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
        className="flex min-h-11 cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <LayoutTemplate className="h-4 w-4" aria-hidden /> Prefill stages…
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`prefill-title-${project.projectId}`}
        className="w-full max-w-lg border border-line bg-paper p-6 text-ink backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div>
            <h2 id={`prefill-title-${project.projectId}`} className="font-bold">
              Prefill stages{project.projectName ? ` for ${project.projectName}` : ''}
            </h2>
            <p className="mt-1 text-ink-soft">Pick a stage template — every stage lands as a plain, editable phase.</p>
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
                  <span className="text-ink-soft">({t.phases.length} stages)</span>
                </span>
                <span className="pl-6 text-ink-soft">{t.description}</span>
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Total project fee (optional)</span>
            <input
              type="number"
              min={0}
              value={feeText}
              onChange={(e) => setFeeText(e.target.value)}
              placeholder="Leave blank to set stage fees later"
              aria-label="Total project fee (optional)"
              className="h-11 w-48 border border-line px-2"
            />
            <span className="text-ink-soft">
              If filled in, each stage gets its share of the fee by the weights above — every amount stays editable after.
            </span>
          </label>

          {existingCount > 0 && (
            <p className="border border-warn bg-neutral-50 p-3">
              This project already has {existingCount} stage{existingCount === 1 ? '' : 's'} — this adds {template.phases.length} more.
              Nothing existing is changed or removed.
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
              Create
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
