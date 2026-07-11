// One drawing-register row: the visible line (number, title, stage,
// discipline, scale/size, rev, status, actions) plus an always-present
// <details> history line underneath — newest issue first. Superseded rows
// stay in the table, just visually muted (word "Superseded" is still there,
// never hidden by color alone).

import { Ban, CheckCircle2, Circle, Clock } from 'lucide-react';
import type { Deliverable, DeliverableStatus, Project } from '../../types';
import { DELIVERABLE_STATUS_LABEL, ISSUE_PURPOSE_LABEL } from '../../types';
import { fullDateLabel } from '../../lib/dates';
import DeliverableFormDialog from './DeliverableFormDialog';
import IssueDialog from './IssueDialog';

const STATUS_ICON: Record<DeliverableStatus, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  issued: CheckCircle2,
  superseded: Ban,
};

const STATUS_CLASS: Record<DeliverableStatus, string> = {
  not_started: 'text-ink-soft',
  in_progress: 'text-warn',
  issued: 'text-ok',
  superseded: 'text-ink-soft',
};

export function stageLabel(project: Project, stageIndex: number | undefined): string {
  if (stageIndex === undefined) return '';
  const stage = project.stages.find((s) => s.stageIndex === stageIndex);
  if (!stage) return '';
  return stage.code || stage.name;
}

export default function DeliverableRow({
  project,
  deliverable,
  deliverables,
}: {
  project: Project;
  deliverable: Deliverable;
  deliverables: Deliverable[];
}) {
  const superseded = deliverable.status === 'superseded';
  const Icon = STATUS_ICON[deliverable.status];
  const scaleSize = [deliverable.scale, deliverable.size].filter(Boolean).join(' / ');
  // Newest issue first, by DATE (not array order) — a backdated entry recorded
  // after a later one still sorts to its true chronological place.
  const history = [...deliverable.issues].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <tr className={`border-b border-line align-top ${superseded ? 'text-ink-soft' : ''}`}>
        <td className="py-2 pr-3 font-bold">{deliverable.number}</td>
        <td className="py-2 pr-3">{deliverable.title}</td>
        <td className="py-2 pr-3">{stageLabel(project, deliverable.stageIndex) || '—'}</td>
        <td className="py-2 pr-3">{deliverable.discipline || '—'}</td>
        <td className="py-2 pr-3">{scaleSize || '—'}</td>
        <td className="py-2 pr-3">{deliverable.currentRev || '—'}</td>
        <td className="py-2 pr-3">
          <span className={`flex items-center gap-1.5 ${STATUS_CLASS[deliverable.status]}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {DELIVERABLE_STATUS_LABEL[deliverable.status]}
          </span>
        </td>
        <td className="py-2">
          <div className="flex flex-wrap gap-2">
            <IssueDialog deliverable={deliverable} />
            <DeliverableFormDialog project={project} existing={deliverable} deliverables={deliverables} />
          </div>
        </td>
      </tr>
      <tr className="border-b border-line">
        <td colSpan={8} className="pb-2">
          <details>
            <summary className="min-h-11 cursor-pointer select-none py-1 text-ink-soft">
              History ({history.length})
            </summary>
            {history.length === 0 ? (
              <p className="pb-2 pl-1 text-ink-soft">Not issued yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 pb-2 pl-1">
                {history.map((issue, i) => (
                  <li key={i}>
                    Rev {issue.rev} — issued {fullDateLabel(issue.date)} — {ISSUE_PURPOSE_LABEL[issue.purpose]}
                    {issue.notes ? ` — ${issue.notes}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </td>
      </tr>
    </>
  );
}
