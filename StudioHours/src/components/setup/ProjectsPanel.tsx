// Projects section of Setup: list + inline edit + expandable phase table.
// Archiving a project means setting status to "closed" via the select below
// — there is deliberately no delete button (billing history references
// projects by id).
import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { FirmFile, Project } from '../../types';
import { uid } from '../../lib/seeds';
import { useApp } from '../../AppContext';
import type { FirmUpdater } from './types';
import { numOrNull } from './numUtils';
import PhaseTable from './PhaseTable';

export default function ProjectsPanel({ firm, update }: { firm: FirmFile; update: FirmUpdater }) {
  const { openFeeBurn } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Starts with no phases — expand the new row and use "Prefill stages…" (a
  // stage-template picker) or "Add custom phase" to lay them out. Previously
  // this auto-seeded the AIA template on every project, which fought with a
  // deliberate template choice; append-only editing means nothing is lost
  // either way, but starting empty avoids the "already has phases" warning
  // firing on every brand-new project.
  const addProject = () => {
    const projectId = uid();
    setExpanded(projectId); // jump straight to the phase table — it's empty, so Prefill/Add-phase are the next step
    return update((draft) => {
      const project: Project = {
        projectId,
        clientName: '',
        projectNumber: '',
        projectName: 'New project',
        status: 'active',
        billingMethod: 'fixed_fee',
        fee: null,
        phases: [],
      };
      draft.projects.push(project);
    });
  };

  const patchProject = (projectId: string, patch: Partial<Project>) =>
    update((draft) => {
      const p = draft.projects.find((x) => x.projectId === projectId);
      if (p) Object.assign(p, patch);
    });

  return (
    <section>
      <h2 className="mb-4 font-bold">Projects</h2>
      <div className="flex flex-col gap-2">
        {firm.projects.map((project) => {
          const isOpen = expanded === project.projectId;
          return (
            <div key={project.projectId} className="border border-line">
              <div className="flex flex-wrap items-end gap-3 p-3">
                <button
                  type="button"
                  aria-label={isOpen ? `Collapse ${project.projectName}` : `Expand ${project.projectName} phases`}
                  onClick={() => setExpanded(isOpen ? null : project.projectId)}
                  className="flex h-11 cursor-pointer items-center text-ink-soft transition-colors duration-200 hover:text-ink"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                </button>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">Number</span>
                  <input
                    defaultValue={project.projectNumber}
                    onBlur={(e) => void patchProject(project.projectId, { projectNumber: e.target.value })}
                    className="h-11 w-24 border border-line px-2"
                    aria-label={`${project.projectName || 'project'} number`}
                  />
                </label>
                <label className="flex min-w-40 flex-1 flex-col gap-1">
                  <span className="text-ink-soft">Project</span>
                  <input
                    defaultValue={project.projectName}
                    onBlur={(e) => void patchProject(project.projectId, { projectName: e.target.value })}
                    className="h-11 w-full border border-line px-2"
                    aria-label="Project name"
                  />
                </label>
                <label className="flex min-w-40 flex-1 flex-col gap-1">
                  <span className="text-ink-soft">Client</span>
                  <input
                    defaultValue={project.clientName}
                    onBlur={(e) => void patchProject(project.projectId, { clientName: e.target.value })}
                    className="h-11 w-full border border-line px-2"
                    aria-label="Client name"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">Status</span>
                  <select
                    value={project.status}
                    onChange={(e) => void patchProject(project.projectId, { status: e.target.value as Project['status'] })}
                    className="h-11 cursor-pointer border border-line px-2"
                    aria-label="Project status"
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">Billing</span>
                  <select
                    value={project.billingMethod}
                    onChange={(e) => void patchProject(project.projectId, { billingMethod: e.target.value as Project['billingMethod'] })}
                    className="h-11 cursor-pointer border border-line px-2"
                    aria-label="Billing method"
                  >
                    <option value="fixed_fee">Fixed fee</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </label>
                {project.billingMethod === 'fixed_fee' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-ink-soft">Fee</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={project.fee ?? ''}
                      onBlur={(e) => void patchProject(project.projectId, { fee: numOrNull(e.target.value, project.fee) })}
                      className="h-11 w-28 border border-line px-2"
                      aria-label="Fixed fee amount"
                    />
                  </label>
                )}
                {/* Straight to this project's hours-vs-budget view (Dashboard → Fee Burn). */}
                <button
                  type="button"
                  onClick={() => openFeeBurn(project.projectId)}
                  aria-label={`View burn for ${project.projectName || 'project'}`}
                  className="flex h-11 cursor-pointer items-center text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink"
                >
                  View burn
                </button>
              </div>
              {isOpen && <PhaseTable project={project} update={update} />}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void addProject()}
        className="mt-3 flex min-h-11 cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add project
      </button>
    </section>
  );
}
