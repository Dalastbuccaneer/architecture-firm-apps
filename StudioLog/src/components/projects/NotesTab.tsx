// Project -> Notes: meeting and site-visit notes, newest date first. This is
// the on-site, phone-in-hand screen — a single column of cards, one big Add
// button, and everything else behind a tap. Cards expand in place (native
// <details>, see NoteCard) so nothing navigates away mid-visit.

import { useLiveQuery } from 'dexie-react-hooks';
import type { Project } from '../../types';
import { db } from '../../db';
import EmptyState from '../EmptyState';
import NoteFormDialog from './NoteFormDialog';
import NoteCard from './NoteCard';

export default function NotesTab({ project }: { project: Project }) {
  const notes = useLiveQuery(
    () => db.notes.where('projectId').equals(project.projectId).toArray(),
    [project.projectId],
  );

  if (notes === undefined) return null;

  const sorted = [...notes].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">What was said and seen — meetings and site visits, with their follow-ups.</p>
        <NoteFormDialog projectId={project.projectId} />
      </div>

      {sorted.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No notes yet — capture what happened on site or in a meeting."
            hint="Notes work offline, so you can write them on your phone during a visit."
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {sorted.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </ul>
      )}
    </div>
  );
}
