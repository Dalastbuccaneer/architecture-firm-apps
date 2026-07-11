// Expanded phase editor for one project inside ProjectsPanel. No delete
// button by design — phases are archived by flipping status to "closed",
// never removed (billing history may reference them).
import { Plus } from 'lucide-react';
import type { Phase, Project } from '../../types';
import { uid } from '../../lib/seeds';
import type { FirmUpdater } from './types';
import { numOrNull } from './numUtils';
import PrefillStagesDialog from './PrefillStagesDialog';

export default function PhaseTable({ project, update }: { project: Project; update: FirmUpdater }) {
  const patchPhase = (phaseId: string, patch: Partial<Phase>) =>
    update((draft) => {
      const p = draft.projects.find((x) => x.projectId === project.projectId);
      const ph = p?.phases.find((x) => x.phaseId === phaseId);
      if (ph) Object.assign(ph, patch);
    });

  const addPhase = () =>
    update((draft) => {
      const p = draft.projects.find((x) => x.projectId === project.projectId);
      if (!p) return;
      p.phases.push({
        phaseId: uid(),
        name: 'New phase',
        aiaCode: '',
        sequence: p.phases.length + 1,
        budgetedHours: null,
        budgetedFee: null,
        billableDefault: true,
        status: 'open',
      });
    });

  return (
    <div className="border-t border-line p-3">
      {project.phases.length === 0 ? (
        <p className="text-ink-soft">
          No stages yet — use <span className="font-bold text-ink">Prefill stages…</span> below to lay out a standard
          set, or <span className="font-bold text-ink">Add custom phase</span> to build your own one at a time.
        </p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th className="py-1.5 pr-3">Phase</th>
              <th className="w-20 py-1.5 pr-3">AIA</th>
              <th className="w-28 py-1.5 pr-3">Budget hrs</th>
              <th className="w-28 py-1.5 pr-3">Budget fee</th>
              <th className="w-24 py-1.5 pr-3">Billable</th>
              <th className="w-28 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {project.phases.map((phase) => (
              <tr key={phase.phaseId} className="border-b border-line">
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={phase.name}
                      onBlur={(e) => void patchPhase(phase.phaseId, { name: e.target.value })}
                      className="h-11 w-full border border-line px-2"
                      aria-label={`Phase name (${phase.aiaCode || 'custom'})`}
                    />
                    {phase.imported && <span className="text-ink-soft">imported</span>}
                  </div>
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    defaultValue={phase.aiaCode}
                    onBlur={(e) => void patchPhase(phase.phaseId, { aiaCode: e.target.value })}
                    className="h-11 w-20 border border-line px-2"
                    aria-label={`AIA code for ${phase.name}`}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={phase.budgetedHours ?? ''}
                    onBlur={(e) => void patchPhase(phase.phaseId, { budgetedHours: numOrNull(e.target.value, phase.budgetedHours) })}
                    className="h-11 w-24 border border-line px-2"
                    aria-label={`Budgeted hours for ${phase.name}`}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={phase.budgetedFee ?? ''}
                    onBlur={(e) => void patchPhase(phase.phaseId, { budgetedFee: numOrNull(e.target.value, phase.budgetedFee) })}
                    className="h-11 w-24 border border-line px-2"
                    aria-label={`Budgeted fee for ${phase.name}`}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    checked={phase.billableDefault}
                    onChange={(e) => void patchPhase(phase.phaseId, { billableDefault: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-ink"
                    aria-label={`Billable by default for ${phase.name}`}
                  />
                </td>
                <td className="py-1.5">
                  <select
                    value={phase.status}
                    onChange={(e) => void patchPhase(phase.phaseId, { status: e.target.value as Phase['status'] })}
                    className="h-11 cursor-pointer border border-line px-2"
                    aria-label={`Status for ${phase.name}`}
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void addPhase()}
          className="flex min-h-11 cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add custom phase
        </button>
        <PrefillStagesDialog project={project} update={update} />
      </div>
    </div>
  );
}
