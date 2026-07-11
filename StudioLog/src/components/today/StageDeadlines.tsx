// Today → "Stage deadlines" card: every not-done stage of an active project
// whose end date is overdue or within the next 4 weeks. Rows are buttons that
// jump straight to the project's page. Long lists fold into "and N more" so
// Monday morning stays one glance. The parent renders this card only when
// there is something to show (Today never shows a wall of empty boxes).

import { CalendarClock } from 'lucide-react';
import type { StageDeadline } from '../../lib/deadlines';
import { capList, duePhrase } from '../../lib/deadlines';
import { fullDateLabel } from '../../lib/dates';

export default function StageDeadlines({
  deadlines,
  onOpenProject,
}: {
  deadlines: StageDeadline[];
  onOpenProject: (projectId: string) => void;
}) {
  if (deadlines.length === 0) return null;
  const { shown, hiddenCount } = capList(deadlines);

  return (
    <section data-e2e="today-stages" className="border border-line p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <CalendarClock className="h-4 w-4" aria-hidden /> Stage deadlines
      </h2>
      <p className="mb-3 text-ink-soft">Stages due in the next 4 weeks, plus anything overdue.</p>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((d) => {
          const overdue = d.daysLeft < 0;
          return (
            <li key={`${d.projectId}:${d.stage.stageIndex}`}>
              <button
                type="button"
                onClick={() => onOpenProject(d.projectId)}
                className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left transition-colors duration-200 hover:bg-neutral-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-bold">
                    {d.stage.code ? `${d.stage.code} — ` : ''}
                    {d.stage.name}
                  </span>{' '}
                  <span className="text-ink-soft">
                    · {d.projectNumber ? `${d.projectNumber} ` : ''}
                    {d.projectName}
                  </span>
                </span>
                <span className={overdue ? 'font-bold text-alert' : 'text-ink-soft'}>
                  {duePhrase(d.daysLeft)}
                  {d.stage.endDate ? ` (${fullDateLabel(d.stage.endDate)})` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <p className="mt-2 text-ink-soft">
          …and {hiddenCount} more within 4 weeks — see each project's page.
        </p>
      )}
    </section>
  );
}
