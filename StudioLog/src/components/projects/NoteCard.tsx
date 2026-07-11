// One note card: a native <details> whose summary shows kind (word + icon),
// date, title, a body snippet, and how many follow-ups are still open. Open it
// for the full body, attendees, photo links, the tick-off follow-up checklist,
// and Edit/Delete. Follow-up ticks persist immediately and stamp updatedAt.

import { CheckCircle2, CircleDot, ExternalLink, HardHat, Trash2, Users } from 'lucide-react';
import type { Note, NoteKind } from '../../types';
import { NOTE_KIND_LABEL } from '../../types';
import { db } from '../../db';
import { fullDateLabel, nowISO } from '../../lib/dates';
import NoteFormDialog from './NoteFormDialog';

const KIND_ICON: Record<NoteKind, typeof Users> = {
  meeting: Users,
  site_visit: HardHat,
};

/** Assertable plain-language count of follow-ups still open. */
export function openFollowUpsPhrase(openCount: number): string {
  return `${openCount} follow-up${openCount === 1 ? '' : 's'} open`;
}

function snippet(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

export default function NoteCard({ note }: { note: Note }) {
  const KindIcon = KIND_ICON[note.kind];
  const openActions = note.actions.filter((a) => !a.done).length;

  const toggleAction = (actionId: string, done: boolean) => {
    void db.notes.update(note.id, {
      actions: note.actions.map((a) => (a.id === actionId ? { ...a, done } : a)),
      updatedAt: nowISO(),
    });
  };

  const onDelete = () => {
    const first = window.confirm(
      `Delete the note "${note.title}"? Its follow-ups and photo links go with it.`,
    );
    if (!first) return;
    const second = window.confirm('Really delete? This cannot be undone — back up first if you are not sure.');
    if (!second) return;
    void db.notes.delete(note.id);
  };

  return (
    <li className="border border-line">
      <details>
        <summary className="flex min-h-11 cursor-pointer flex-col gap-1 p-3 transition-colors duration-200 hover:bg-line/40">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 border border-line px-2 py-0.5 font-bold">
              <KindIcon className="h-4 w-4 shrink-0" aria-hidden />
              {NOTE_KIND_LABEL[note.kind]}
            </span>
            <span className="text-ink-soft">{fullDateLabel(note.date)}</span>
            <span className="font-bold">{note.title}</span>
          </div>
          {note.body.trim() !== '' && <p className="text-ink-soft">{snippet(note.body)}</p>}
          {note.actions.length > 0 &&
            (openActions > 0 ? (
              <span className="flex items-center gap-1.5 font-bold text-warn">
                <CircleDot className="h-4 w-4 shrink-0" aria-hidden />
                {openFollowUpsPhrase(openActions)}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-ok">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                All follow-ups done
              </span>
            ))}
          <span className="text-ink-soft underline underline-offset-4">Open note</span>
        </summary>

        <div className="flex flex-col gap-3 border-t border-line p-3">
          {note.attendees && (
            <p>
              <span className="font-bold">Attendees: </span>
              {note.attendees}
            </p>
          )}

          {note.body.trim() !== '' && <p className="whitespace-pre-wrap">{note.body}</p>}

          {note.photoLinks && note.photoLinks.length > 0 && (
            <div>
              <p className="font-bold">Photos</p>
              <ul className="mt-1 flex flex-col gap-1">
                {note.photoLinks.map((url, i) => (
                  <li key={`${url}-${i}`}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center gap-1.5 underline underline-offset-4 transition-colors duration-200 hover:text-ink-soft"
                    >
                      <span className="truncate">Photo {i + 1} — {url}</span>
                      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {note.actions.length > 0 && (
            <div>
              <p className="font-bold">Follow-ups</p>
              <ul className="mt-1 flex flex-col">
                {note.actions.map((a) => (
                  <li key={a.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={a.done}
                        onChange={(e) => toggleAction(a.id, e.target.checked)}
                        className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
                      />
                      <span className={a.done ? 'text-ink-soft line-through' : ''}>{a.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <NoteFormDialog projectId={note.projectId} existing={note} />
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete note ${note.title}`}
              className="flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete…
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}
