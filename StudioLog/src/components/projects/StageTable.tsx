// Editable stage list for one project (Overview tab): code, name, start/end
// dates via native date inputs, status via native <select>, plus Add stage and
// the Prefill dialog. Text inputs use defaultValue+onBlur (StudioHours
// convention) so live-query re-renders never clobber typing; dates and status
// commit on change.

import { Plus } from 'lucide-react';
import type { Project, Stage, StageStatus } from '../../types';
import { patchProject } from '../../db';
import PrefillStagesDialog from './PrefillStagesDialog';

export default function StageTable({ project }: { project: Project }) {
  const saveStages = (stages: Stage[]) => void patchProject(project.projectId, { stages });

  const patchStage = (stageIndex: number, patch: Partial<Stage>) =>
    saveStages(project.stages.map((s) => (s.stageIndex === stageIndex ? { ...s, ...patch } : s)));

  const addStage = () => {
    // Continue the stable sequence — removed stages' numbers are never reused
    // (deliverables may reference them later; see types.ts).
    const next = project.stages.reduce((max, s) => Math.max(max, s.stageIndex), -1) + 1;
    saveStages([...project.stages, { stageIndex: next, code: '', name: 'New stage', status: 'pending' }]);
  };

  const removeStage = (s: Stage) => {
    const label = s.code ? `${s.code} — ${s.name}` : s.name;
    if (!window.confirm(`Remove the stage "${label}"? Its dates and status go with it.`)) return;
    saveStages(project.stages.filter((x) => x.stageIndex !== s.stageIndex));
  };

  const ordered = [...project.stages].sort((a, b) => a.stageIndex - b.stageIndex);

  return (
    <div>
      {ordered.length === 0 ? (
        <p className="text-ink-soft">
          No stages yet — use <span className="font-bold text-ink">Prefill stages…</span> below to lay out a
          standard set (RIBA, AIA, or a short interiors set), or <span className="font-bold text-ink">Add stage</span>{' '}
          to build your own one at a time.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="w-24 py-1.5 pr-3 font-normal">Code</th>
                <th className="py-1.5 pr-3 font-normal">Stage</th>
                <th className="w-40 py-1.5 pr-3 font-normal">Starts</th>
                <th className="w-40 py-1.5 pr-3 font-normal">Ends (deadline)</th>
                <th className="w-36 py-1.5 pr-3 font-normal">Status</th>
                <th className="w-24 py-1.5 font-normal">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => (
                <tr key={s.stageIndex} className="border-b border-line">
                  <td className="py-1.5 pr-3">
                    <input
                      defaultValue={s.code}
                      onBlur={(e) => patchStage(s.stageIndex, { code: e.target.value.trim() })}
                      className="h-11 w-20 border border-line px-2"
                      aria-label={`Stage code for ${s.name}`}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      defaultValue={s.name}
                      onBlur={(e) => patchStage(s.stageIndex, { name: e.target.value })}
                      className="h-11 w-full min-w-40 border border-line px-2"
                      aria-label={`Stage name (${s.code || 'custom'})`}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="date"
                      value={s.startDate ?? ''}
                      onChange={(e) => patchStage(s.stageIndex, { startDate: e.target.value || undefined })}
                      className="h-11 w-full cursor-pointer border border-line px-2"
                      aria-label={`Start date for ${s.name}`}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="date"
                      value={s.endDate ?? ''}
                      onChange={(e) => patchStage(s.stageIndex, { endDate: e.target.value || undefined })}
                      className="h-11 w-full cursor-pointer border border-line px-2"
                      aria-label={`End date for ${s.name}`}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <select
                      value={s.status}
                      onChange={(e) => patchStage(s.stageIndex, { status: e.target.value as StageStatus })}
                      className="h-11 w-full cursor-pointer border border-line px-2"
                      aria-label={`Status for ${s.name}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => removeStage(s)}
                      aria-label={`Remove stage ${s.name}`}
                      className="min-h-11 cursor-pointer px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ordered.length > 0 && <p className="mt-3 text-ink-soft">Changes here are saved automatically.</p>}

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addStage}
          className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add stage
        </button>
        <PrefillStagesDialog project={project} />
      </div>
    </div>
  );
}
