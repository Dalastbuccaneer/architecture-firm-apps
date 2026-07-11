// Project → Overview: the stage timeline strip, the editable stage list, file
// links, a contacts count (the people themselves live on the Contacts tab),
// and the delete-project section.

import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import type { Project } from '../../types';
import { db, deleteProjectCascade } from '../../db';
import StageStrip from './StageStrip';
import StageTable from './StageTable';
import LinksSection from './LinksSection';

export default function OverviewTab({ project, onDeleted }: { project: Project; onDeleted: () => void }) {
  const contactCount = useLiveQuery(
    () => db.contacts.where('projectId').equals(project.projectId).count(),
    [project.projectId],
  );

  const onDelete = async () => {
    const first = window.confirm(
      `Delete "${project.projectName}"? Its stages, links, and everything logged under it on this device go too.`,
    );
    if (!first) return;
    const second = window.confirm('Really delete? This cannot be undone — back up first if you are not sure.');
    if (!second) return;
    await deleteProjectCascade(project.projectId);
    onDeleted();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Stages */}
      <section className="border border-line p-4">
        <h2 className="mb-1 font-bold">Stages</h2>
        <p className="mb-3 text-ink-soft">
          The project's timeline. Give a stage an end date and the Today screen will watch it for you.
        </p>
        {project.stages.length > 0 && (
          <div className="mb-4">
            <StageStrip stages={project.stages} detailed />
          </div>
        )}
        <StageTable project={project} />
      </section>

      {/* File links */}
      <section className="border border-line p-4">
        <h2 className="mb-1 font-bold">Files &amp; links</h2>
        <LinksSection project={project} />
      </section>

      {/* Contacts summary */}
      <section className="border border-line p-4">
        <h2 className="mb-1 font-bold">Contacts</h2>
        <p>
          {contactCount === undefined
            ? '…'
            : contactCount === 0
              ? 'No contacts saved for this project yet.'
              : `${contactCount} contact${contactCount === 1 ? '' : 's'} — see the Contacts tab.`}
        </p>
        <p className="mt-1 text-ink-soft">
          The client, consultants, contractor, and authorities for this project are managed on the Contacts tab.
        </p>
      </section>

      {/* Delete */}
      <section className="border border-alert p-4">
        <h2 className="mb-1 font-bold">Delete this project</h2>
        <p className="text-ink-soft">
          Removes {project.projectName} from this device — stages, links, and anything logged under it. A backup
          made before deleting keeps its copy.
        </p>
        <button
          type="button"
          onClick={() => void onDelete()}
          className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 border border-alert px-4 py-2 text-alert transition-colors duration-200 hover:bg-alert hover:text-paper"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete project…
        </button>
      </section>
    </div>
  );
}
