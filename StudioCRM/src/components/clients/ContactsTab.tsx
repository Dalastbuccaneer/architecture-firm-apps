// Client -> Contacts: this client's directory. Role is free text (no fixed
// enum to group by — see types.ts), so contacts render as a flat list,
// primary contacts starred and sorted first. Each person is one tap from an
// email or call — mailto:/tel: links, no copy-paste. "Introduced by" resolves
// Contact.introducedBy against this client's OTHER contacts to build the
// referral graph, reading "External / unknown" when unset or when the
// referrer no longer exists. Ported from StudioLog's
// ContactsTab.tsx/ContactFormDialog.tsx pattern (see the plan's "Screens"
// section, Clients bullet).

import { useLiveQuery } from 'dexie-react-hooks';
import { Mail, Phone, Star, Trash2 } from 'lucide-react';
import type { Client, Contact } from '../../types';
import { db } from '../../db';
import EmptyState from '../EmptyState';
import ContactFormDialog from './ContactFormDialog';

function introducedByLabel(contact: Contact, allContacts: Contact[]): string {
  if (!contact.introducedBy) return 'External / unknown';
  const referrer = allContacts.find((c) => c.id === contact.introducedBy);
  return referrer ? referrer.name : 'External / unknown';
}

function ContactCard({ contact, allContacts }: { contact: Contact; allContacts: Contact[] }) {
  const onDelete = () => {
    if (!window.confirm(`Remove "${contact.name}" from this client's contacts?`)) return;
    void db.contacts.delete(contact.id);
  };

  return (
    <li className="flex flex-col gap-1 border border-line p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {contact.isPrimary && (
          <span aria-label="Primary contact" title="Primary contact">
            <Star className="h-4 w-4 shrink-0 fill-ink text-ink" aria-hidden />
          </span>
        )}
        <span className="font-bold">{contact.name}</span>
        {contact.role && <span className="border border-line px-2 py-0.5">{contact.role}</span>}
      </div>

      {(contact.email || contact.phone) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex min-h-11 items-center gap-1.5 underline underline-offset-4 transition-colors duration-200 hover:text-ink-soft"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
              className="flex min-h-11 items-center gap-1.5 underline underline-offset-4 transition-colors duration-200 hover:text-ink-soft"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              {contact.phone}
            </a>
          )}
        </div>
      )}

      <p className="text-ink-soft">Introduced by: {introducedByLabel(contact, allContacts)}</p>

      {contact.notes && <p className="text-ink-soft">{contact.notes}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <ContactFormDialog clientId={contact.clientId} contacts={allContacts} existing={contact} />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete contact ${contact.name}`}
          className="flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete…
        </button>
      </div>
    </li>
  );
}

export default function ContactsTab({ client }: { client: Client }) {
  const contacts = useLiveQuery(() => db.contacts.where('clientId').equals(client.id).toArray(), [client.id]);

  if (contacts === undefined) return null;

  // Primary contacts first, then alphabetical — there's no fixed role
  // grouping here (role is free text), so this is the only stable order.
  const sorted = [...contacts].sort((a, b) => {
    if (!!a.isPrimary !== !!b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">Everyone at this client — email or call them in one tap.</p>
        <ContactFormDialog clientId={client.id} contacts={contacts} />
      </div>

      {contacts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No contacts yet"
            hint="Add the people at this client so their details — and who introduced them — are one tap away."
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {sorted.map((c) => (
            <ContactCard key={c.id} contact={c} allContacts={contacts} />
          ))}
        </ul>
      )}
    </div>
  );
}
