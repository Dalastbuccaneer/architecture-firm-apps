// Today → "Tasks due" card: open tasks due within 2 weeks or overdue, plus a
// quieter "No date set" group for open tasks without one. The one-tap Done
// checkbox here is the ONLY write action on the whole Today screen (it stamps
// doneAt, same as the project Tasks tab); the task TITLE deep-links to the
// project's Tasks tab (firm-level tasks with no project stay plain text).
// Selection lives in lib/deadlines.ts (tasksDue). Parent renders this card
// only when it has rows.

import { AlertTriangle, CalendarDays, ListChecks } from 'lucide-react';
import type { OpenTask, TaskDue } from '../../lib/deadlines';
import { capList, duePhrase, taskOverduePhrase } from '../../lib/deadlines';
import { db } from '../../db';
import { nowISO } from '../../lib/dates';

function markDone(taskId: string) {
  void db.tasks.update(taskId, { done: true, doneAt: nowISO() });
}

function TaskLine({
  entry,
  onOpenProject,
}: {
  entry: TaskDue | OpenTask;
  onOpenProject: (projectId: string) => void;
}) {
  const { task, projectName } = entry;
  const daysLeft = 'daysLeft' in entry ? entry.daysLeft : undefined;
  const label = (
    <span className="min-w-0">
      {task.title}
      {projectName && <span className="text-ink-soft"> · {projectName}</span>}
    </span>
  );

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={false}
            onChange={() => markDone(task.id)}
            aria-label={`Mark "${task.title}" done`}
            className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
          />
        </label>
        {task.projectId ? (
          <button
            type="button"
            onClick={() => onOpenProject(task.projectId!)}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center text-left underline-offset-4 transition-colors duration-200 hover:underline"
          >
            {label}
          </button>
        ) : (
          <span className="flex min-h-11 min-w-0 flex-1 items-center">{label}</span>
        )}
      </div>
      {daysLeft !== undefined &&
        (daysLeft < 0 ? (
          <span className="flex items-center gap-1.5 font-bold text-alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {taskOverduePhrase(-daysLeft)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-ink-soft">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            {duePhrase(daysLeft)}
          </span>
        ))}
    </li>
  );
}

export default function TasksDueCard({
  dated,
  undated,
  onOpenProject,
}: {
  dated: TaskDue[];
  undated: OpenTask[];
  onOpenProject: (projectId: string) => void;
}) {
  if (dated.length === 0 && undated.length === 0) return null;
  const datedCap = capList(dated);
  const undatedCap = capList(undated);

  return (
    <section data-e2e="today-tasks" className="border border-line p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <ListChecks className="h-4 w-4" aria-hidden /> Tasks due
      </h2>
      <p className="mb-3 text-ink-soft">
        To-dos due in the next 2 weeks, plus anything overdue. Tick one off and it leaves this list.
      </p>

      {dated.length > 0 && (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {datedCap.shown.map((entry) => (
              <TaskLine key={entry.task.id} entry={entry} onOpenProject={onOpenProject} />
            ))}
          </ul>
          {datedCap.hiddenCount > 0 && (
            <p className="mt-2 text-ink-soft">…and {datedCap.hiddenCount} more — see each project's Tasks tab.</p>
          )}
        </>
      )}

      {undated.length > 0 && (
        <div className={dated.length > 0 ? 'mt-4' : ''}>
          <p className="font-bold text-ink-soft">No date set</p>
          <ul className="flex flex-col divide-y divide-line">
            {undatedCap.shown.map((entry) => (
              <TaskLine key={entry.task.id} entry={entry} onOpenProject={onOpenProject} />
            ))}
          </ul>
          {undatedCap.hiddenCount > 0 && (
            <p className="mt-2 text-ink-soft">…and {undatedCap.hiddenCount} more — see each project's Tasks tab.</p>
          )}
        </div>
      )}
    </section>
  );
}
