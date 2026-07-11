// Today — the Monday-morning triage screen. One glance answers "what needs
// me this week?" across ALL projects: stage deadlines (4 weeks out), open log
// items and tasks (2 weeks out), and open note follow-ups. All selection
// logic is pure in src/lib/deadlines.ts (todaySurface); this screen just
// renders it. Cards self-hide when empty — Today shows what matters, a calm
// all-clear when nothing does, and a first-run pointer when there are no
// projects at all. Never a wall of zeros, never a fake alert.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../AppContext';
import { todaySurface, isAllClear } from '../lib/deadlines';
import { todayISO, todayHeadingLabel } from '../lib/dates';
import EmptyState from '../components/EmptyState';
import StageDeadlines from '../components/today/StageDeadlines';
import OpenLogItems from '../components/today/OpenLogItems';
import TasksDueCard from '../components/today/TasksDueCard';
import OpenFollowUps from '../components/today/OpenFollowUps';

export default function Today() {
  const { setView, openProject } = useApp();
  const projects = useLiveQuery(() => db.projects.toArray(), []);
  const logItems = useLiveQuery(() => db.logItems.toArray(), []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const notes = useLiveQuery(() => db.notes.toArray(), []);

  if (projects === undefined || logItems === undefined || tasks === undefined || notes === undefined)
    return null;

  const today = todayISO();
  const surface = todaySurface(projects, logItems, tasks, notes, today);

  return (
    <div>
      <h1 className="text-2xl font-bold">Today</h1>
      <p className="mt-1 text-ink-soft">{todayHeadingLabel(today)}</p>

      {projects.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing to watch yet"
            hint="Add your first project on the Projects tab — its stage deadlines and open items will show up here."
            action={
              <button
                type="button"
                onClick={() => setView('projects')}
                className="min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
              >
                Go to Projects
              </button>
            }
          />
        </div>
      ) : isAllClear(surface) ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing needs attention this week."
            hint="Stage deadlines, open log items, tasks due soon, and note follow-ups will show up here when something needs you."
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <StageDeadlines deadlines={surface.stages} onOpenProject={(id) => openProject(id)} />
          <OpenLogItems items={surface.logItems} onOpenProject={(id) => openProject(id, 'log')} />
          <TasksDueCard
            dated={surface.datedTasks}
            undated={surface.undatedTasks}
            onOpenProject={(id) => openProject(id, 'tasks')}
          />
          <OpenFollowUps followUps={surface.followUps} onOpenProject={(id) => openProject(id, 'notes')} />
        </div>
      )}
    </div>
  );
}
