// Add a client — the org's name is the only required field; everything else
// (type, website, address, source, tags, notes) can be filled in later from
// the client's own page. Type and source are free text with a <datalist> of
// common values — suggest, don't force, same convention as StudioLog's
// discipline/code fields (see CLIENT_TYPE_SUGGESTIONS / CLIENT_SOURCE_SUGGESTIONS
// in types.ts). Dialog shape/Tailwind classes match ContactFormDialog.tsx
// (StudioLog) exactly.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { db } from '../../db';
import { SCHEMA_VERSION, CLIENT_TYPE_SUGGESTIONS, CLIENT_SOURCE_SUGGESTIONS, type Client } from '../../types';
import { uid } from '../../lib/ids';
import { nowISO } from '../../lib/dates';

export default function AddClientDialog({
  onCreated,
  variant = 'primary',
  dataTour,
}: {
  /** called with the new client's id right after it's saved — callers usually
   *  jump straight to the new client's page (see Clients.tsx). */
  onCreated?: (clientId: string) => void;
  variant?: 'primary' | 'plain';
  /** driver.js tour anchor — only pass this on the ONE instance a tour should
   *  target (this dialog is reused in both the header and an empty-state
   *  action, and duplicate data-tour attributes would confuse the selector). */
  dataTour?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const typeListId = useId();
  const sourceListId = useId();

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setName('');
    setType('');
    setWebsite('');
    setAddress('');
    setSource('');
    setTags('');
    setNotes('');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return; // native `required` already blocks this
    setBusy(true);
    try {
      const now = nowISO();
      const client: Client = {
        schemaVersion: SCHEMA_VERSION,
        id: uid(),
        name: trimmed,
        type: type.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        source: source.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db.clients.add(client);
      closeDialog();
      onCreated?.(client.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        data-tour={dataTour}
        className={
          variant === 'primary'
            ? 'flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft'
            : 'flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink'
        }
      >
        <Plus className="h-4 w-4" aria-hidden /> Add client
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
          <div>
            <h2 id={titleId} className="font-bold">
              Add client
            </h2>
            <p className="mt-1 text-ink-soft">Only the name is required — everything else can be filled in later.</p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Chen Development Group"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Type (optional)</span>
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              list={typeListId}
              placeholder="e.g. Developer"
              className="h-12 w-full border border-line px-2"
            />
            <datalist id={typeListId}>
              {CLIENT_TYPE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Website (optional)</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Address (optional)</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 200 Main St, Springfield"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Source (optional)</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              list={sourceListId}
              placeholder="How this org first came in"
              className="h-12 w-full border border-line px-2"
            />
            <datalist id={sourceListId}>
              {CLIENT_SOURCE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Tags (optional, comma-separated)</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. repeat, high-value"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything worth remembering about this org"
              className="w-full border border-line p-2"
            />
          </label>

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
              Save client
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
