// Add/Edit one client contact. `existing` absent = Add, present = Edit — same
// one-dialog-two-jobs pattern as EditClientDialog/AddClientDialog. Ported from
// StudioLog's ContactFormDialog.tsx, dropping the fixed ContactRole enum (role
// is free text here) and `org` (redundant — the client IS the org), adding
// `isPrimary` and `introducedBy` (a <select> of this client's OTHER contacts,
// or "External / unknown").

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { Contact } from '../../types';
import { SCHEMA_VERSION } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';
import { nowISO } from '../../lib/dates';

/** Sentinel <option> value for "External / unknown" — Contact.introducedBy
 *  stays undefined when this is selected. */
const EXTERNAL_UNKNOWN = '';

export default function ContactFormDialog({
  clientId,
  contacts,
  existing,
}: {
  clientId: string;
  /** ALL of this client's contacts (as queried by ContactsTab) — the dialog
   *  excludes `existing` itself so a contact can never be its own referrer. */
  contacts: Contact[];
  existing?: Contact;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isEdit = !!existing;

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [introducedBy, setIntroducedBy] = useState(EXTERNAL_UNKNOWN);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const otherContacts = contacts
    .filter((c) => c.id !== existing?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const openDialog = () => {
    setName(existing?.name ?? '');
    setRole(existing?.role ?? '');
    setEmail(existing?.email ?? '');
    setPhone(existing?.phone ?? '');
    setIsPrimary(existing?.isPrimary ?? false);
    setIntroducedBy(existing?.introducedBy ?? EXTERNAL_UNKNOWN);
    setNotes(existing?.notes ?? '');
    setBusy(false);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nameTrim = name.trim();
    if (!nameTrim) return; // native `required` already blocks this
    setBusy(true);
    try {
      const patch = {
        name: nameTrim,
        role: role.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        isPrimary: isPrimary || undefined,
        introducedBy: introducedBy || undefined,
        notes: notes.trim() || undefined,
      };
      if (isEdit && existing) {
        await db.contacts.update(existing.id, { ...patch, updatedAt: nowISO() });
      } else {
        const now = nowISO();
        const created: Contact = {
          schemaVersion: SCHEMA_VERSION,
          id: uid(),
          clientId,
          createdAt: now,
          updatedAt: now,
          ...patch,
        };
        await db.contacts.add(created);
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
        aria-label={isEdit ? `Edit contact ${existing?.name}` : 'Add contact'}
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
            <Plus className="h-4 w-4" aria-hidden /> Add contact
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
            {isEdit ? 'Edit contact' : 'Add contact'}
          </h2>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Sara Chen"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Role (optional)</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Development Director"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Phone (optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +1 555 010 1234"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
            />
            <span>Primary contact for this client</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Introduced by (optional)</span>
            <select
              value={introducedBy}
              onChange={(e) => setIntroducedBy(e.target.value)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              <option value={EXTERNAL_UNKNOWN}>External / unknown</option>
              {otherContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` (${c.role})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything worth remembering about this person"
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
              {isEdit ? 'Save' : 'Save contact'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
