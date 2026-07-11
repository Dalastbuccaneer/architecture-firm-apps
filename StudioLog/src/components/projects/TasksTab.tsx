// Project -> Tasks: this project's to-dos. Fast inline add at the top (title +
// optional due date — no dialog, it must be quick on a phone), the open list
// under it, and done tasks folded into a native <details>. Overdue words come
// from lib/deadlines.ts (taskOverdueDays) so the future Today screen shares
// the exact same logic. tasks.done is a boolean, so we .filter() in memory —
// never .where('done') (booleans are not valid IndexedDB keys, see db.ts).

import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CalendarDays, Plus } from 'lucide-react';
import type { Project, Task } from '../../types';
import { SCHEMA_VERSION } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';
import { daysBetween, nowISO, todayISO } from '../../lib/dates';
import { duePhrase, taskOverdueDays, taskOverduePhrase } from '../../lib/deadlines';
import EmptyState from '../EmptyState';
import EditTaskDialog from './EditTaskDialog';

function TaskRow({ task, today }: { task: Task; today: string }) {
  const overdueDays = taskOverdueDays(task, today);

  const onToggle = (checked: boolean) => {
    void db.tasks.update(task.id, checked ? { done: true, doneAt: nowISO() } : { done: false, doneAt: undefined });
  };

  const onDelete = () => {
    if (!window.confirm(`Delete the task "${task.title}"?`)) return;
    void db.tasks.delete(task.id);
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line p-2">
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={task.done}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
        />
        <span className="min-w-0">
          <span className={task.done ? 'text-ink-soft line-through' : ''}>{task.title}</span>
          {task.notes && <span className="block text-ink-soft">{task.notes}</span>}
        </span>
      </label>

      {!task.done && task.due && (
        overdueDays !== null ? (
          <span className="flex items-center gap-1.5 font-bold text-alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {taskOverduePhrase(overdueDays)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-ink-soft">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            {duePhrase(daysBetween(today, task.due))}
          </span>
        )
      )}

      <div className="flex items-center gap-1">
        <EditTaskDialog task={task} />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete task ${task.title}`}
          className="min-h-11 cursor-pointer px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
        >
          Delete…
        </button>
      </div>
    </li>
  );
}

export default function TasksTab({ project }: { project: Project }) {
  const tasks = useLiveQuery(
    () => db.tasks.where('projectId').equals(project.projectId).toArray(),
    [project.projectId],
  );

  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  if (tasks === undefined) return null;

  const today = todayISO();
  // booleans can't be indexed — filter in memory (see db.ts).
  const openTasks = tasks
    .filter((t) => !t.done)
    .sort((a, b) => (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') || a.title.localeCompare(b.title));
  const doneTasks = tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const overdueCount = openTasks.filter((t) => taskOverdueDays(t, today) !== null).length;

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const titleTrim = title.trim();
    if (!titleTrim) return; // native `required` already blocks this
    const task: Task = {
      schemaVersion: SCHEMA_VERSION,
      id: uid(),
      projectId: project.projectId,
      title: titleTrim,
      due: due || undefined,
      done: false,
    };
    void db.tasks.add(task);
    setTitle('');
    setDue('');
  };

  return (
    <div>
      <p className="text-ink-soft">Small reminders tied to this project — jot them down before they slip.</p>

      <form onSubmit={onAdd} data-e2e="add-task-form" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-52 flex-1 flex-col gap-1">
          <span className="text-ink-soft">What needs doing?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Chase the client for the survey"
            className="h-12 w-full border border-line px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Due (optional)</span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-12 w-48 cursor-pointer border border-line px-2"
          />
        </label>
        <button
          type="submit"
          className="flex min-h-12 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add task
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No tasks yet — jot down what needs doing on this project." />
        </div>
      ) : (
        <>
          <p className="mt-4 text-ink-soft">
            {openTasks.length} to do
            {overdueCount > 0 && <span className="font-bold text-alert"> — {overdueCount} overdue</span>}
          </p>

          {openTasks.length === 0 ? (
            <p className="mt-2">Nothing left to do here — everything is ticked off.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {openTasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </ul>
          )}

          {doneTasks.length > 0 && (
            <details data-e2e="done-tasks" className="mt-4">
              <summary className="flex min-h-11 cursor-pointer items-center font-bold">
                Done ({doneTasks.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {doneTasks.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
