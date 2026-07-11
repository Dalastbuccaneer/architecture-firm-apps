// Project -> Deliverables: the drawing register. A table ordered by sortKey,
// filters by stage/status above it, a CSV export (also serves as a
// transmittal record), and the Issue.../Edit... workflow per row (see
// IssueDialog / DeliverableFormDialog / DeliverableRow).

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download } from 'lucide-react';
import type { Project } from '../../types';
import { DELIVERABLE_STATUS_LABEL, ISSUE_PURPOSE_LABEL, type DeliverableStatus } from '../../types';
import { db } from '../../db';
import { todayISO } from '../../lib/dates';
import { csvCell } from '../../lib/csv';
import { downloadText } from '../../lib/download';
import { getLatestIssue } from '../../lib/deliverables';
import EmptyState from '../EmptyState';
import DeliverableFormDialog from './DeliverableFormDialog';
import DeliverableRow, { stageLabel } from './DeliverableRow';
import RegisterStrip from './RegisterStrip';

const ALL_STATUSES = Object.keys(DELIVERABLE_STATUS_LABEL) as DeliverableStatus[];

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
}

export default function DeliverablesTab({ project }: { project: Project }) {
  const deliverables = useLiveQuery(
    () => db.deliverables.where('projectId').equals(project.projectId).toArray(),
    [project.projectId],
  );

  const [stageFilter, setStageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  if (deliverables === undefined) return null;

  const orderedStages = [...project.stages].sort((a, b) => a.stageIndex - b.stageIndex);
  const all = [...deliverables].sort((a, b) => a.sortKey - b.sortKey);

  const filtered = all.filter((d) => {
    if (stageFilter !== '' && String(d.stageIndex ?? '') !== stageFilter) return false;
    if (statusFilter !== '' && d.status !== statusFilter) return false;
    return true;
  });

  const issuedCount = filtered.filter((d) => d.status === 'issued').length;

  const onExportCsv = () => {
    const header = [
      'Number',
      'Title',
      'Stage',
      'Discipline',
      'Scale',
      'Size',
      'Current rev',
      'Status',
      'Last issue date',
      'Last issue purpose',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const d of all) {
      const lastIssue = getLatestIssue(d.issues);
      lines.push(
        [
          d.number,
          d.title,
          stageLabel(project, d.stageIndex),
          d.discipline ?? '',
          d.scale ?? '',
          d.size ?? '',
          d.currentRev,
          DELIVERABLE_STATUS_LABEL[d.status],
          lastIssue?.date ?? '',
          lastIssue ? ISSUE_PURPOSE_LABEL[lastIssue.purpose] : '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    downloadText(`drawing-register-${slugify(project.projectName)}-${todayISO()}.csv`, lines.join('\r\n'), 'text/csv');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">
          Every sheet and document this project issues, with the revision history behind each one.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={all.length === 0}
            className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:text-ink-soft disabled:hover:border-line"
          >
            <Download className="h-4 w-4" aria-hidden /> Download register (CSV)
          </button>
          <DeliverableFormDialog project={project} deliverables={all} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No drawings yet — add the first one."
            hint="This register tracks every drawing's revision and what you issued it for."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Stage</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-11 w-48 cursor-pointer border border-line px-2"
              >
                <option value="">All stages</option>
                {orderedStages.map((s) => (
                  <option key={s.stageIndex} value={s.stageIndex}>
                    {s.code ? `${s.code} — ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 w-48 cursor-pointer border border-line px-2"
              >
                <option value="">All statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DELIVERABLE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-3 text-ink-soft">
            {filtered.length} drawing{filtered.length === 1 ? '' : 's'} — {issuedCount} issued
          </p>

          <div className="mt-3">
            <RegisterStrip deliverables={all} />
          </div>

          {filtered.length === 0 ? (
            <p className="mt-4 text-ink-soft">No drawings match these filters.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="border-b border-line text-left text-ink-soft">
                    <th className="py-1.5 pr-3 font-normal">Number</th>
                    <th className="py-1.5 pr-3 font-normal">Title</th>
                    <th className="py-1.5 pr-3 font-normal">Stage</th>
                    <th className="py-1.5 pr-3 font-normal">Discipline</th>
                    <th className="py-1.5 pr-3 font-normal">Scale / size</th>
                    <th className="py-1.5 pr-3 font-normal">Rev</th>
                    <th className="py-1.5 pr-3 font-normal">Status</th>
                    <th className="py-1.5 font-normal">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <DeliverableRow key={d.id} project={project} deliverable={d} deliverables={all} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
