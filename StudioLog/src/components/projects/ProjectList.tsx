// The project registry: status-grouped list (Active / On hold / Closed), each
// row showing number + name + client + a compact stage-progress strip. Rows
// are one big button — click anywhere to open the project.

import type { Project, ProjectStatus } from '../../types';
import { PROJECT_STATUS_LABEL } from '../../types';
import EmptyState from '../EmptyState';
import StageStrip from './StageStrip';
import AddProjectDialog from './AddProjectDialog';

const GROUPS: ProjectStatus[] = ['active', 'on_hold', 'closed'];

function byNumberThenName(a: Project, b: Project): number {
  return (
    (a.projectNumber ?? '').localeCompare(b.projectNumber ?? '', undefined, { numeric: true }) ||
    a.projectName.localeCompare(b.projectName)
  );
}

export default function ProjectList({
  projects,
  onOpen,
}: {
  projects: Project[];
  onOpen: (projectId: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Projects</h1>
        <AddProjectDialog onCreated={onOpen} />
      </div>

      {projects.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No projects yet"
            hint="Add your first project — it keeps that job's stage deadlines, drawings, and site log in one place. Nothing leaves this computer."
            action={<AddProjectDialog onCreated={onOpen} variant="plain" />}
          />
        </div>
      ) : (
        GROUPS.map((status) => {
          const group = projects.filter((p) => p.status === status).sort(byNumberThenName);
          if (group.length === 0) return null;
          return (
            <section key={status} className="mt-8">
              <h2 className="mb-3 font-bold">
                {PROJECT_STATUS_LABEL[status]} <span className="font-normal text-ink-soft">({group.length})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {group.map((p) => (
                  <li key={p.projectId}>
                    <button
                      type="button"
                      onClick={() => onOpen(p.projectId)}
                      aria-label={`Open ${p.projectName}`}
                      className="flex w-full cursor-pointer flex-col gap-2 border border-line p-4 text-left transition-colors duration-200 hover:border-ink"
                    >
                      <span className="flex min-h-6 w-full flex-wrap items-baseline gap-x-4 gap-y-1">
                        {p.projectNumber && <span className="text-ink-soft">{p.projectNumber}</span>}
                        <span className="font-bold">{p.projectName}</span>
                        {p.clientName && <span className="text-ink-soft">{p.clientName}</span>}
                      </span>
                      {p.stages.length > 0 ? (
                        <StageStrip stages={p.stages} />
                      ) : (
                        <span className="text-ink-soft">No stages yet — open the project to add them.</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
