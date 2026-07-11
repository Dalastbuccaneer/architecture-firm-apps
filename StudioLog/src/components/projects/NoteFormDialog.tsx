// Add/Edit a meeting or site-visit note. One dialog handles both: `existing`
// absent = Add (date defaults to today), present = Edit (fields prefilled,
// existing follow-up done-flags preserved). Single column and large inputs on
// purpose — this is the form an architect fills standing on site with a phone.
// Photo links are URLs only (StudioLog stores no files, and Note.photoLinks is
// a plain string[] — no labels).

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import type { Note, NoteAction, NoteKind } from '../../types';
import { SCHEMA_VERSION, NOTE_KIND_LABEL } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';
import { nowISO, todayISO } from '../../lib/dates';
import { normalizeUrl } from '../../lib/url';

const ALL_KINDS = Object.keys(NOTE_KIND_LABEL) as NoteKind[];

/** A follow-up row while it's being edited — keeps the saved id/done so
 *  ticked-off follow-ups survive an edit of the note. */
interface ActionDraft {
  id: string;
  text: string;
  done: boolean;
}

export default function NoteFormDialog({ projectId, existing }: { projectId: string; existing?: Note }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isEdit = !!existing;

  const [kind, setKind] = useState<NoteKind>('meeting');
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [attendees, setAttendees] = useState('');
  const [body, setBody] = useState('');
  const [photoLinks, setPhotoLinks] = useState<string[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setKind(existing?.kind ?? 'meeting');
    setDate(existing?.date ?? todayISO());
    setTitle(existing?.title ?? '');
    setAttendees(existing?.attendees ?? '');
    setBody(existing?.body ?? '');
    setPhotoLinks(existing?.photoLinks ? [...existing.photoLinks] : []);
    setActions(existing ? existing.actions.map((a) => ({ ...a })) : []);
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const titleTrim = title.trim();
    if (!titleTrim || !date) return; // native `required` already blocks this
    setBusy(true);
    try {
      const now = nowISO();
      const cleanLinks = photoLinks.map((u) => u.trim()).filter(Boolean).map(normalizeUrl);
      const cleanActions: NoteAction[] = actions
        .filter((a) => a.text.trim() !== '')
        .map((a) => ({ id: a.id, text: a.text.trim(), done: a.done }));
      const patch = {
        kind,
        date,
        title: titleTrim,
        attendees: attendees.trim() || undefined,
        body: body.trim(),
        photoLinks: cleanLinks.length ? cleanLinks : undefined,
        actions: cleanActions,
      };
      if (isEdit && existing) {
        await db.notes.update(existing.id, { ...patch, updatedAt: now });
      } else {
        const created: Note = {
          schemaVersion: SCHEMA_VERSION,
          id: uid(),
          projectId,
          ...patch,
          createdAt: now,
          updatedAt: now,
        };
        await db.notes.add(created);
      }
    } finally {
      setBusy(false);
    }
    closeDialog();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={isEdit ? `Edit note ${existing?.title}` : 'Add note'}
        className={
          isEdit
            ? 'flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink'
            : 'flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft'
        }
      >
        {isEdit ? (
          <>
            <Pencil className="h-4 w-4" aria-hidden /> Edit…
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden /> Add note
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-lg border border-line bg-paper p-6 text-ink backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <h2 id={titleId} className="font-bold">
            {isEdit ? 'Edit note' : 'Add note'}
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">What kind of note?</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as NoteKind)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {NOTE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-12 w-full cursor-pointer border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Site visit — slab pour"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Attendees (optional)</span>
            <input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Who was there?"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">What happened? (optional)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="What was discussed, decided, or seen on site."
              className="w-full border border-line p-2"
            />
          </label>

          {/* Photo links — URLs into the user's own photo storage */}
          <fieldset className="flex flex-col gap-2 border border-line p-3">
            <legend className="px-1 text-ink-soft">Photo links (optional)</legend>
            <p className="text-ink-soft">
              Photos stay in your own folders or phone gallery — paste links to them here.
            </p>
            {photoLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={link}
                  onChange={(e) => setPhotoLinks(photoLinks.map((l, j) => (j === i ? e.target.value : l)))}
                  aria-label={`Photo link ${i + 1}`}
                  placeholder="https://…"
                  className="h-12 min-w-0 flex-1 border border-line px-2"
                />
                <button
                  type="button"
                  onClick={() => setPhotoLinks(photoLinks.filter((_, j) => j !== i))}
                  aria-label={`Remove photo link ${i + 1}`}
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-line text-ink-soft transition-colors duration-200 hover:border-alert hover:text-alert"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPhotoLinks([...photoLinks, ''])}
              className="flex min-h-11 cursor-pointer items-center gap-2 self-start border border-line px-3 transition-colors duration-200 hover:border-ink"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add a photo link
            </button>
          </fieldset>

          {/* Follow-ups — each becomes a NoteAction with a checkbox on the card */}
          <fieldset className="flex flex-col gap-2 border border-line p-3">
            <legend className="px-1 text-ink-soft">Follow-ups (optional)</legend>
            <p className="text-ink-soft">Things someone must do after this meeting or visit — tick them off on the note later.</p>
            {actions.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2">
                <input
                  value={a.text}
                  onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  aria-label={`Follow-up ${i + 1}`}
                  placeholder="e.g. Chase the engineer for the beam size"
                  className="h-12 min-w-0 flex-1 border border-line px-2"
                />
                <button
                  type="button"
                  onClick={() => setActions(actions.filter((_, j) => j !== i))}
                  aria-label={`Remove follow-up ${i + 1}`}
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-line text-ink-soft transition-colors duration-200 hover:border-alert hover:text-alert"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setActions([...actions, { id: uid(), text: '', done: false }])}
              className="flex min-h-11 cursor-pointer items-center gap-2 self-start border border-line px-3 transition-colors duration-200 hover:border-ink"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add a follow-up
            </button>
          </fieldset>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="min-h-11 cursor-pointer border border-line px-4 transition-colors duration-200 hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 cursor-pointer bg-ink px-4 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isEdit ? 'Save' : 'Save note'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
