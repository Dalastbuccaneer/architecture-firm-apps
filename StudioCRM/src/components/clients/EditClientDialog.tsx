// Edit a client's directory fields. Delete lives on the Client Detail page
// itself, not here (a single confirm() over deleteClientCascade — see
// ClientDetail.tsx) — this dialog only edits. Same shape/Tailwind classes as
// AddClientDialog.tsx / ContactFormDialog.tsx (StudioLog).

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import type { Client } from '../../types';
import { CLIENT_TYPE_SUGGESTIONS, CLIENT_SOURCE_SUGGESTIONS } from '../../types';
import { patchClient } from '../../db';

export default function EditClientDialog({ client }: { client: Client }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const typeListId = useId();
  const sourceListId = useId();

  const [name, setName] = useState(client.name);
  const [type, setType] = useState(client.type ?? '');
  const [website, setWebsite] = useState(client.website ?? '');
  const [address, setAddress] = useState(client.address ?? '');
  const [source, setSource] = useState(client.source ?? '');
  const [tags, setTags] = useState(client.tags.join(', '));
  const [notes, setNotes] = useState(client.notes ?? '');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setName(client.name);
    setType(client.type ?? '');
    setWebsite(client.website ?? '');
    setAddress(client.address ?? '');
    setSource(client.source ?? '');
    setTags(client.tags.join(', '));
    setNotes(client.notes ?? '');
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
      await patchClient(client.id, {
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
      });
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
        className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
      >
        <Pencil className="h-4 w-4" aria-hidden /> Edit client…
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
            Edit client
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
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
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
