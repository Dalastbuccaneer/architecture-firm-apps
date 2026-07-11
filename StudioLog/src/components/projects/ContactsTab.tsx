// Project -> Contacts: the project directory. Grouped under plain role words
// (Client / Consultant / Contractor / Authority / Other), each person one tap
// from an email or call — mailto:/tel: links, no copy-paste. Delete is a
// single confirm: a contact is cheap to re-add, unlike a note or a project.

import { useLiveQuery } from 'dexie-react-hooks';
import { Mail, Phone, Trash2 } from 'lucide-react';
import type { Contact, ContactRole, Project } from '../../types';
import { CONTACT_ROLE_LABEL } from '../../types';
import { db } from '../../db';
import EmptyState from '../EmptyState';
import ContactFormDialog from './ContactFormDialog';

// Key order of CONTACT_ROLE_LABEL is the grouping order.
const ROLE_ORDER = Object.keys(CONTACT_ROLE_LABEL) as ContactRole[];

function ContactCard({ contact }: { contact: Contact }) {
  const onDelete = () => {
    if (!window.confirm(`Remove "${contact.name}" from this project's contacts?`)) return;
    void db.contacts.delete(contact.id);
  };

  return (
    <li className="flex flex-col gap-1 border border-line p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">{contact.name}</span>
        {contact.org && <span className="text-ink-soft">{contact.org}</span>}
        <span className="border border-line px-2 py-0.5">{CONTACT_ROLE_LABEL[contact.role]}</span>
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

      {contact.notes && <p className="text-ink-soft">{contact.notes}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <ContactFormDialog projectId={contact.projectId ?? ''} existing={contact} />
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

export default function ContactsTab({ project }: { project: Project }) {
  const contacts = useLiveQuery(
    () => db.contacts.where('projectId').equals(project.projectId).toArray(),
    [project.projectId],
  );

  if (contacts === undefined) return null;

  const groups = ROLE_ORDER.map((role) => ({
    role,
    people: contacts.filter((c) => c.role === role).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.people.length > 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft">Everyone on this project — email or call them in one tap.</p>
        <ContactFormDialog projectId={project.projectId} />
      </div>

      {contacts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No contacts yet"
            hint="Add the client, consultants, and authorities for this project so their details are one tap away."
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.role}>
              <h2 className="font-bold">
                {CONTACT_ROLE_LABEL[g.role]} ({g.people.length})
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {g.people.map((c) => (
                  <ContactCard key={c.id} contact={c} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
