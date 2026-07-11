// Add/Edit one project contact. `existing` absent = Add, present = Edit —
// same one-dialog-two-jobs pattern as DeliverableFormDialog. Role is a native
// <select> of plain words (client / consultant / contractor / authority).

import { useId, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { Contact, ContactRole } from '../../types';
import { SCHEMA_VERSION, CONTACT_ROLE_LABEL } from '../../types';
import { db } from '../../db';
import { uid } from '../../lib/ids';

const ALL_ROLES = Object.keys(CONTACT_ROLE_LABEL) as ContactRole[];

export default function ContactFormDialog({ projectId, existing }: { projectId: string; existing?: Contact }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isEdit = !!existing;

  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState<ContactRole>('client');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const openDialog = () => {
    setName(existing?.name ?? '');
    setOrg(existing?.org ?? '');
    setRole(existing?.role ?? 'client');
    setEmail(existing?.email ?? '');
    setPhone(existing?.phone ?? '');
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
        org: org.trim() || undefined,
        role,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (isEdit && existing) {
        await db.contacts.update(existing.id, patch);
      } else {
        const created: Contact = {
          schemaVersion: SCHEMA_VERSION,
          id: uid(),
          projectId,
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
            <span className="text-ink-soft">Company or office (optional)</span>
            <input
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="e.g. Chen Structural Engineers"
              className="h-12 w-full border border-line px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Role on this project</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ContactRole)}
              className="h-12 w-full cursor-pointer border border-line px-2"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CONTACT_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
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

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Prefers calls before noon"
              className="h-12 w-full border border-line px-2"
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
