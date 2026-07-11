// Project -> Log: correspondence and decisions. Newest dateRaised first,
// filters by type/status above the list, a plain count line, and the
// Add-to-log dialog. Overdue is computed per row via lib/deadlines.ts.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LogItemStatus, LogItemType, Project } from '../../types';
import { LOG_ITEM_STATUS_LABEL, LOG_ITEM_TYPE_LABEL } from '../../types';
import { db } from '../../db';
import { todayISO } from '../../lib/dates';
import { logItemOverdueDays } from '../../lib/deadlines';
import EmptyState from '../EmptyState';
import AddLogItemDialog from './AddLogItemDialog';
import LogItemRow from './LogItemRow';

const ALL_TYPES = Object.keys(LOG_ITEM_TYPE_LABEL) as LogItemType[];
const ALL_STATUSES = Object.keys(LOG_ITEM_STATUS_LABEL) as LogItemStatus[];

export default function LogTab({ project }: { project: Project }) {
  const logItems = useLiveQuery(
    () => db.logItems.where('projectId').equals(project.projectId).toArray(),
    [project.projectId],
  );

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  if (logItems === undefined) return null;

  const today = todayISO();
  const all = [...logItems].sort((a, b) => b.dateRaised.localeCompare(a.dateRaised) || b.createdAt.localeCompare(a.createdAt));

  const filtered = all.filter((item) => {
    if (typeFilter !== '' && item.type !== typeFilter) return false;
    if (statusFilter !== '' && item.status !== statusFilter) return false;
    return true;
  });

  const openCount = filtered.filter((i) => i.status === 'open').length;
  const overdueCount = filtered.filter((i) => logItemOverdueDays(i, today) !== null).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">
          RFIs, submittals, approvals, and decisions — who is waiting on whom, and what was answered.
        </p>
        <AddLogItemDialog projectId={project.projectId} />
      </div>

      {all.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing in the log yet"
            hint="RFIs, approvals, and decisions you record here become the project's paper trail."
          />
        </div>
      ) : (
        <>
          <div data-e2e="log-filters" className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-11 w-48 cursor-pointer border border-line px-2"
              >
                <option value="">All types</option>
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LOG_ITEM_TYPE_LABEL[t]}
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
                    {LOG_ITEM_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-3 text-ink-soft">
            {openCount} open{overdueCount > 0 && <span className="font-bold text-alert"> — {overdueCount} overdue</span>}
          </p>

          {filtered.length === 0 ? (
            <p className="mt-4 text-ink-soft">No log items match these filters.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {filtered.map((item) => (
                <LogItemRow key={item.id} item={item} today={today} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
