// Today → "Note follow-ups" card: every follow-up still open across the
// meeting/site-visit notes of active projects, one glanceable row each,
// oldest note first. Rows deep-link to the project's Notes tab (ticking off
// happens there, on the note itself — Today's only write action is the task
// Done checkbox). Long lists fold into "and N more". Parent renders this
// card only when it has rows.

import { CircleDot } from 'lucide-react';
import type { OpenFollowUp } from '../../lib/deadlines';
import { capList } from '../../lib/deadlines';
import { fullDateLabel } from '../../lib/dates';

export default function OpenFollowUps({
  followUps,
  onOpenProject,
}: {
  followUps: OpenFollowUp[];
  onOpenProject: (projectId: string) => void;
}) {
  if (followUps.length === 0) return null;
  const { shown, hiddenCount } = capList(followUps);

  return (
    <section data-e2e="today-followups" className="border border-line p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <CircleDot className="h-4 w-4" aria-hidden /> Note follow-ups
      </h2>
      <p className="mb-3 text-ink-soft">
        Still open from meeting and site-visit notes. Click one to open its note.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((f) => (
          <li key={`${f.noteId}:${f.actionId}`}>
            <button
              type="button"
              onClick={() => onOpenProject(f.projectId)}
              className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left transition-colors duration-200 hover:bg-neutral-50"
            >
              <span className="min-w-0 flex-1">
                {f.text}{' '}
                <span className="text-ink-soft">
                  · {f.noteTitle} ({fullDateLabel(f.noteDate)}) · {f.projectName}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <p className="mt-2 text-ink-soft">…and {hiddenCount} more — see each project's Notes tab.</p>
      )}
    </section>
  );
}
